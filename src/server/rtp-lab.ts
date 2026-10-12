import express from "express";
import { MediaStreamTrack, RtpHeader, RtpPacket, RTCPeerConnection, useOPUS } from "werift";
import { isSessionDescription } from "../shared/webrtc.js";
import { OpusEncoder } from "./opus-codec.js";
import type { WebRtcAudioOptions } from "./webrtc-audio.js";
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

  app.get("/_rtp-lab", (_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(labPage(webrtc?.stunServer ? [{ urls: webrtc.stunServer }] : []));
  });

  app.post("/_rtp-lab/offer", express.json({ limit: "512kb" }), async (request, response) => {
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

  app.post("/_rtp-lab/mode", express.json({ limit: "4kb" }), (request, response) => {
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
  private readonly slot: MediaStreamTrack;
  private readonly monoEncoder = new OpusEncoder(48_000, 1);
  private readonly stereoEncoder = new OpusEncoder(48_000, 2);
  private readonly clock: ReturnType<typeof setInterval>;
  private readonly closedPromise: Promise<void>;
  private disconnectWatchdog: ReturnType<typeof setTimeout> | null = null;
  private mode: LabMode = { ...DEFAULT_MODE };
  private sequenceNumber = (Math.random() * 0x10000) | 0;
  private timestamp = (Math.random() * 0x1_0000_0000) >>> 0;
  private framesInPair = 0;
  private pairGapUntil = 0;

  constructor(logger: LoggerType, webrtc?: WebRtcAudioOptions) {
    // Mirrors the production voice path's ICE config: without the same UDP
    // port range and public address the lab candidates are unreachable
    // behind a container port mapping.
    const publicAddresses = webrtc?.publicHost ? [webrtc.publicHost] : undefined;
    this.peer = new RTCPeerConnection({
      iceServers: webrtc?.stunServer ? [{ urls: webrtc.stunServer }] : [],
      codecs: { audio: [useOPUS()] },
      iceUseIpv4: true,
      iceUseIpv6: webrtc?.ipv6Enabled === true,
      iceUseTcp: false,
      ...(webrtc?.udpPortRange ? { icePortRange: [...webrtc.udpPortRange] as [number, number] } : {}),
      ...(publicAddresses ? { iceAdditionalHostAddresses: publicAddresses } : {}),
    });
    // Downlink only: one sendonly transceiver fed with the synthetic track.
    // The sender owns SSRC/payloadType/RTCP; writeRtp packets carry placeholders.
    const downlink = this.peer.addTransceiver("audio", { direction: "sendonly" });
    this.slot = new MediaStreamTrack({ kind: "audio" });
    void downlink.sender.replaceTrack(this.slot).catch(() => undefined);
    // `closed` is passive: it resolves when the connection reaches a terminal
    // state, a disconnect outlives the reap window, or close() was called.
    this.closedPromise = new Promise<void>((resolve) => {
      this.peer.onconnectionstatechange = () => {
        const state = this.peer.connectionState;
        logger.info({ state, slotSsrc: downlink.sender.ssrc }, "lab connection state");
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
  }

  setMode(mode: LabMode): void {
    this.mode = mode;
  }

  async accept(offer: { type: "offer"; sdp: string }): Promise<string> {
    await this.peer.setRemoteDescription({ type: "offer", sdp: offer.sdp });
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    return this.peer.localDescription!.sdp;
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

function labPage(iceServers: Array<{ urls: string }>): string {
  return `<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><title>RTP Lab</title>
<style>
body { font: 14px/1.6 system-ui, sans-serif; max-width: 720px; margin: 24px auto; color: #222; }
fieldset { margin: 12px 0; border: 1px solid #ccc; border-radius: 8px; }
label { margin-right: 14px; }
button { padding: 6px 14px; }
pre { background: #f6f6f6; padding: 10px; border-radius: 8px; min-height: 200px; white-space: pre-wrap; }
</style></head>
<body>
<h1>RTP 隔离实验室</h1>
<p>本页面与网关直连 WebRTC（不经 TeamSpeak），网关播放可切换特征的测试音。逐个模式切换并听：哪个模式静音，即锁定元凶特征。</p>
<p><button id="start">开始连接</button> <button id="apply" disabled>应用模式</button> <button id="stop" disabled>停止</button></p>
<fieldset><legend>声道</legend>
  <label><input type="radio" name="channels" value="2" checked>立体声</label>
  <label><input type="radio" name="channels" value="1">单声道</label>
</fieldset>
<fieldset><legend>节奏</legend>
  <label><input type="radio" name="pacing" value="burst" checked>TS 突发（成对帧+间隙）</label>
  <label><input type="radio" name="pacing" value="even">匀速 20ms</label>
</fieldset>
<fieldset><legend>停顿策略（词间静音）</legend>
  <label><input type="radio" name="silence" value="frames" checked>发 3 字节静音帧</label>
  <label><input type="radio" name="silence" value="none">完全停发</label>
</fieldset>
<pre id="log"></pre>
<script>
const logEl = document.getElementById("log");
const log = (msg) => { logEl.textContent += msg + "\\n"; };
// Created inside the click handler so Web Audio has sticky user activation.
let audioCtx = null;
let started = false;
const ICE_SERVERS = ${JSON.stringify(iceServers)};
const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
peer.onconnectionstatechange = () => log("peer: " + peer.connectionState);
peer.ontrack = (event) => {
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.srcObject = new MediaStream([event.track]);
  document.body.append(audio);
  audio.play().catch(e => log("play blocked: " + e.message));
  const ctx = audioCtx ?? new AudioContext();
  const source = ctx.createMediaStreamSource(new MediaStream([event.track]));
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Float32Array(1024);
  setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    log("analyserRMS=" + Math.sqrt(sum / samples.length).toFixed(5));
  }, 1500);
  setInterval(async () => {
    const report = await peer.getStats();
    report.forEach(s => {
      if (s.type === "inbound-rtp" && s.kind === "audio") {
        log(\`inbound: packets=\${s.packetsReceived} discarded=\${s.packetsDiscarded ?? 0} lost=\${s.packetsLost} audioLevel=\${s.audioLevel} totalSamples=\${s.totalSamplesReceived}\`);
      }
    });
  }, 3000);
};
async function start() {
  // Downlink only: one recvonly m-line for the gateway's sendonly track.
  peer.addTransceiver("audio", { direction: "recvonly" });
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await new Promise(resolve => {
    if (peer.iceGatheringState === "complete") return resolve();
    peer.addEventListener("icegatheringstatechange", () => { if (peer.iceGatheringState === "complete") resolve(); });
    setTimeout(resolve, 4000);
  });
  const response = await fetch("/_rtp-lab/offer", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(peer.localDescription),
  });
  if (!response.ok) { log("offer failed: " + response.status); return; }
  const answer = await response.json();
  await peer.setRemoteDescription(answer);
  log("negotiated — tone should be audible");
}
document.getElementById("start").addEventListener("click", async () => {
  if (started) return;
  started = true;
  document.getElementById("apply").disabled = false;
  document.getElementById("stop").disabled = false;
  try { audioCtx = new AudioContext(); await audioCtx.resume(); } catch (e) { log("audioCtx: " + e.message); }
  start().catch(e => log("error: " + (e.message ?? e)));
});
function readMode() {
  const value = (name) => document.querySelector(\`input[name=\${name}]:checked\`).value;
  return { channels: Number(value("channels")), pacing: value("pacing"), silence: value("silence") };
}
document.getElementById("apply").addEventListener("click", async () => {
  const mode = readMode();
  const response = await fetch("/_rtp-lab/mode", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mode),
  });
  log("mode → " + JSON.stringify((await response.json()).mode));
});
document.getElementById("stop").addEventListener("click", async () => {
  await fetch("/_rtp-lab/mode", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pacing: "stopped", channels: 1, silence: "frames" }) });
  log("stopped");
});
</script>
</body>
</html>`;
}
