import express from "express";
import { MediaStreamTrack, RtpHeader, RtpPacket, RTCPeerConnection, useOPUS } from "werift";
import { isSessionDescription } from "../shared/webrtc.js";
import { isSameOrigin } from "../security/same-origin.js";
import { isAcceptableRemoteIceCandidate } from "./webrtc-config.js";
import { FixedWindowRateLimiter } from "./fixed-window-rate-limit.js";
import { NO_TRUSTED_PROXIES, rateLimitPeerKey, resolveClientAddress } from "./client-ip.js";
import { OpusEncoder } from "./opus-codec.js";
import { AUDIO_LEVEL_URI, type WebRtcAudioOptions } from "./webrtc-audio.js";
import { labPage, labScript } from "./rtp-lab-page.js";
import type { Logger as LoggerType } from "../logger.js";

/**
 * RTP isolation lab (only mounted when WEBSPEAK_RTP_DEBUG=1): a browser page
 * that negotiates a direct WebRTC session with the gateway — bypassing
 * TeamSpeak entirely — while the gateway streams a synthetic tone whose
 * framing characteristics (channels, pacing, silence policy) can be switched
 * live. Reconciling "which mode turns silent" in the operator's own browser
 * and network isolates the variable that breaks real downlink audio without
 * touching the production voice path.
 *
 * Topology notes that are easy to get wrong (both bit us once):
 * - werift answers iterate only over the REMOTE offer's m-lines, so the page
 *   must pre-open every m-line the experiment needs. The lab is downlink-only:
 *   one recvonly m-line matching the gateway's single sendonly transceiver.
 * - A session must not be closed incidentally: `session.closed` is a passive
 *   lifecycle promise, never a close trigger.
 */

const TONE_PCM = 960; // 20 ms at 48 kHz.

/** How long a disconnected lab session lingers before its peer is reaped. */
const DISCONNECT_REAP_MS = 10_000;

/** L4/S7（报告 21）：offer 后一直连不上的会话（浏览器中途关页、ICE 全败）在
 *  此期限内没有进入 connected 就整套回收——不回收则 20ms 时钟与 2 个原生
 *  Opus 编码器随会话对象一起滞留。 */
const NEVER_CONNECTED_REAP_MS = 30_000;

export interface RtpLabOptions {
  logger: LoggerType;
  /** The production WebRTC transport config: without the same UDP port range
   *  and public addresses the lab's ICE candidates are unreachable behind a
   *  container port mapping, and the browser needs the same STUN server to
   *  gather candidates the way the production client does. */
  webrtc?: WebRtcAudioOptions;
}

interface LabMode extends Record<string, unknown> {
  channels: 1 | 2;
  pacing: "even" | "burst" | "stopped";
  silence: "frames" | "none";
}

const DEFAULT_MODE: LabMode = { channels: 2, pacing: "burst", silence: "frames" };

/** Mounts the lab only under WEBSPEAK_RTP_DEBUG=1; the routes do not exist
 *  (and the synthetic streaming machinery is never constructed) otherwise. */
export function mountRtpLabIfEnabled(app: express.Express, options: RtpLabOptions): void {
  if (process.env.WEBSPEAK_RTP_DEBUG !== "1") return;
  const logger = options.logger.child({ component: "rtp-lab" });
  const webrtc = options.webrtc;
  const sessions = new Set<RtpLabSession>();
  // S7（报告 21）：端点是匿名的，每次 offer 都要建整套 peer + 原生编码器——
  // 按对端限一口，防单机循环打爆内存与端口预算。
  const offerLimiter = new FixedWindowRateLimiter(256, 6);
  const peerKey = (request: express.Request): string =>
    rateLimitPeerKey(resolveClientAddress(
      request.socket.remoteAddress,
      request.headers["x-forwarded-for"],
      NO_TRUSTED_PROXIES,
    ));

  app.get("/_rtp-lab", (_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(labPage(webrtc?.stunServer ? [{ urls: webrtc.stunServer }] : []));
  });

  // The page logic lives in a same-origin static script: the global CSP sets
  // script-src 'self' (no unsafe-inline/nonce), so an inline <script> would be
  // silently blocked and the page would render as dead buttons.
  app.get("/_rtp-lab/lab.js", (_request, response) => {
    response.setHeader("content-type", "text/javascript; charset=utf-8");
    response.end(labScript());
  });

  app.post("/_rtp-lab/offer", express.json({ limit: "512kb" }), async (request, response) => {
    // S7：同源 + 每对端限流。匿名端点的最低门槛——跨源一律拒。
    if (!isSameOrigin(request)) {
      response.status(403).json({ error: "cross-origin rejected" });
      return;
    }
    if (!offerLimiter.allow(peerKey(request))) {
      response.status(429).json({ error: "too many lab offers" });
      return;
    }
    try {
      // The body is the full session description object ({type:"offer",sdp}),
      // matching what isSessionDescription validates for the voice path.
      if (!isSessionDescription(request.body, "offer")) {
        response.status(400).json({ error: "invalid offer" });
        return;
      }
      const session = new RtpLabSession(logger, webrtc);
      sessions.add(session);
      session.closed.then(() => sessions.delete(session));
      const answer = await session.accept(request.body);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ type: "answer", sdp: answer }));
    } catch (error) {
      logger.warn({ err: error instanceof Error ? error.message : String(error) }, "lab offer failed");
      response.status(500).json({ error: "lab negotiation failed" });
    }
  });

  // Read-only calibration probe: per-session audio-level counters for the
  // uplink m-line. Debug-only (the whole lab is) and exposes numbers only.
  app.get("/_rtp-lab/level", (_request, response) => {
    response.json({ sessions: [...sessions].map(session => session.getLevel()) });
  });

  app.post("/_rtp-lab/mode", express.json({ limit: "4kb" }), (request, response) => {
    if (!isSameOrigin(request)) {
      response.status(403).json({ error: "cross-origin rejected" });
      return;
    }
    const body = request.body as Partial<LabMode> | undefined;
    const mode: LabMode = {
      channels: body?.channels === 1 ? 1 : 2,
      pacing: body?.pacing === "even" ? "even" : body?.pacing === "stopped" ? "stopped" : "burst",
      silence: body?.silence === "none" ? "none" : "frames",
    };
    for (const session of sessions) session.setMode(mode);
    logger.info(mode, "lab mode switched");
    response.json({ ok: true, mode });
  });
}

class RtpLabSession {
  private readonly peer: RTCPeerConnection;
  private readonly logger: LoggerType;
  private readonly slot: MediaStreamTrack;
  private readonly monoEncoder = new OpusEncoder(48_000, 1);
  private readonly stereoEncoder = new OpusEncoder(48_000, 2);
  private readonly clock: ReturnType<typeof setInterval>;
  private readonly closedPromise: Promise<void>;
  private disconnectWatchdog: ReturnType<typeof setTimeout> | null = null;
  private connectWatchdog: ReturnType<typeof setTimeout> | null = null;
  private mode: LabMode = { ...DEFAULT_MODE };
  private sequenceNumber = (Math.random() * 0x10000) | 0;
  private timestamp = (Math.random() * 0x1_0000_0000) >>> 0;
  private framesInPair = 0;
  private pairGapUntil = 0;
  private uplinkLevelLast: number | null = null;
  private uplinkLevelVoiced = false;
  private uplinkLevelFrames = 0;
  private uplinkLevelParsed = 0;

  constructor(logger: LoggerType, webrtc?: WebRtcAudioOptions) {
    this.logger = logger;
    // Mirrors the production voice path's ICE config: without the same UDP
    // port range and public address the lab candidates are unreachable
    // behind a container port mapping.
    const publicAddresses = webrtc?.publicHost ? [webrtc.publicHost] : undefined;
    this.peer = new RTCPeerConnection({
      iceServers: webrtc?.stunServer ? [{ urls: webrtc.stunServer }] : [],
      codecs: { audio: [useOPUS()] },
      // RFC 6464 probe: the answer advertises the extension only when the
      // page's offer carries it (werift matches remote extensions by URI and
      // keeps their ids).
      headerExtensions: { audio: [{ id: 0, uri: AUDIO_LEVEL_URI }], video: [] },
      iceUseIpv4: true,
      iceUseIpv6: webrtc?.ipv6Enabled === true,
      iceUseTcp: false,
      ...(webrtc?.udpPortRange ? { icePortRange: [...webrtc.udpPortRange] as [number, number] } : {}),
      ...(publicAddresses ? { iceAdditionalHostAddresses: publicAddresses } : {}),
      // S1（报告 21）：调试端点与主路径共享出网面，远端候选走同一地址策略。
      iceFilterCandidatePair: pair => isAcceptableRemoteIceCandidate(pair.remoteCandidate.host, pair.remoteCandidate.port),
      iceFilterStunResponse: message => message.attributesKeys.includes("MESSAGE-INTEGRITY"),
    });
    // Downlink only: one sendonly transceiver fed with the synthetic track.
    // The sender owns SSRC/payloadType/RTCP; writeRtp packets carry placeholders.
    const downlink = this.peer.addTransceiver("audio", { direction: "sendonly" });
    this.slot = new MediaStreamTrack({ kind: "audio" });
    void downlink.sender.replaceTrack(this.slot).catch(() => undefined);
    // Uplink probe: the page's microphone feeds this m-line so the RFC 6464
    // level extension can be calibrated without a TeamSpeak session.
    const uplink = this.peer.addTransceiver("audio", { direction: "sendrecv" });
    uplink.onTrack.subscribe((track) => {
      track.onReceiveRtp.subscribe((_rtp, extensions) => {
        this.uplinkLevelFrames++;
        const level = extensions?.[AUDIO_LEVEL_URI] as { v?: boolean; level?: number } | undefined;
        if (!level || typeof level.level !== "number") return;
        this.uplinkLevelLast = level.level;
        this.uplinkLevelVoiced = level.v === true;
        this.uplinkLevelParsed++;
      });
    });
    // `closed` is passive: it resolves when the connection reaches a terminal
    // state, a disconnect outlives the reap window, or close() was called.
    this.closedPromise = new Promise<void>((resolve) => {
      this.peer.onconnectionstatechange = () => {
        const state = this.peer.connectionState;
        logger.info({ state, slotSsrc: downlink.sender.ssrc }, "lab connection state");
        if (state === "connected" && this.connectWatchdog) {
          clearTimeout(this.connectWatchdog);
          this.connectWatchdog = null;
        }
        if (state === "connected" && this.disconnectWatchdog) {
          clearTimeout(this.disconnectWatchdog);
          this.disconnectWatchdog = null;
          return;
        }
        if (state === "disconnected" && !this.disconnectWatchdog) {
          this.disconnectWatchdog = setTimeout(() => {
            logger.info("lab session reaped after prolonged disconnect");
            void this.peer.close().catch(() => undefined);
            resolve();
          }, DISCONNECT_REAP_MS);
          this.disconnectWatchdog.unref?.();
          return;
        }
        if (state === "failed" || state === "closed") resolve();
      };
    });
    this.clock = setInterval(() => this.tick(), 20);
    this.clock.unref?.();
    // L4（报告 21）：终态统一收掉 20ms 时钟与两个看门狗——否则时钟闭包把整个
    // 会话（含 2 个原生 Opus 编码器）钉在内存里，仅调试模式可达但真实泄漏。
    void this.closedPromise.then(() => {
      if (this.disconnectWatchdog) clearTimeout(this.disconnectWatchdog);
      if (this.connectWatchdog) clearTimeout(this.connectWatchdog);
      clearInterval(this.clock);
    });
  }

  setMode(mode: LabMode): void {
    this.mode = mode;
  }

  getLevel(): { level: number | null; voiced: boolean; frames: number; parsed: number } {
    return {
      level: this.uplinkLevelLast,
      voiced: this.uplinkLevelVoiced,
      frames: this.uplinkLevelFrames,
      parsed: this.uplinkLevelParsed,
    };
  }

  async accept(offer: { type: "offer"; sdp: string }): Promise<string> {
    // 从未 connected 的会话（浏览器拿到 answer 前关页、ICE 全败）到期整套回收。
    this.connectWatchdog = setTimeout(() => {
      if (this.peer.connectionState === "connected") return;
      this.logger.warn("lab session never reached connected; reaping");
      void this.peer.close().catch(() => undefined);
    }, NEVER_CONNECTED_REAP_MS);
    this.connectWatchdog.unref?.();
    try {
      await this.peer.setRemoteDescription({ type: "offer", sdp: offer.sdp });
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);
      return this.peer.localDescription!.sdp;
    } catch (error) {
      // offer 解析/协商失败：立即回收，别让 30s 看门狗兜底拖着一个死会话。
      void this.peer.close().catch(() => undefined);
      throw error;
    }
  }

  get closed(): Promise<void> {
    return this.closedPromise;
  }

  private tick(): void {
    if (this.peer.connectionState !== "connected") return;
    if (this.mode.pacing === "stopped") return;
    const now = Date.now();
    if (this.mode.pacing === "burst") {
      // Observed TeamSpeak cadence: speech arrives as pairs of frames with a
      // ~210 ms gap between pairs.
      if (now < this.pairGapUntil) return;
      if (this.framesInPair >= 2) {
        this.framesInPair = 0;
        this.pairGapUntil = now + 210;
        return;
      }
      this.framesInPair++;
    }
    // Inter-word pause policy: 3-byte digital-silence frames, or complete
    // silence (timestamp freezes) — toggled live from the page.
    const interWordPause = this.sequenceNumber % 140 < 20;
    let payload: Buffer;
    if (interWordPause && this.mode.silence === "frames") {
      payload = Buffer.from([0xfc, 0xff, 0xfe]);
    } else if (interWordPause && this.mode.silence === "none") {
      return;
    } else {
      const encoder = this.mode.channels === 2 ? this.stereoEncoder : this.monoEncoder;
      const pcm = Buffer.alloc(TONE_PCM * 2 * this.mode.channels);
      for (let i = 0; i < TONE_PCM; i++) {
        const sample = Math.round(9000 * Math.sin(2 * Math.PI * 440 * i / 48_000));
        for (let channel = 0; channel < this.mode.channels; channel++) pcm.writeInt16LE(sample, (i * this.mode.channels + channel) * 2);
      }
      payload = encoder.encode(pcm);
    }
    this.slot.writeRtp(new RtpPacket(new RtpHeader({
      payloadType: 111,
      sequenceNumber: this.sequenceNumber & 0xffff,
      timestamp: this.timestamp >>> 0,
      ssrc: 0,
      marker: false,
    }), payload));
    this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;
    this.timestamp = (this.timestamp + 960) >>> 0;
  }
}

