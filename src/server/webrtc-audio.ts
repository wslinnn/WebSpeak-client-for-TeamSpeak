import { randomInt } from "node:crypto";
import {
  MediaStreamTrack,
  RtpHeader,
  RtpPacket,
  RTCPeerConnection,
  useOPUS,
} from "werift";
import type { Logger as LoggerType } from "../logger.js";
import type { TSVoiceData } from "./ts-client.js";
import { isAcceptableRemoteIceCandidate, WEBRTC_UDP_PORT_RANGE } from "./webrtc-config.js";
import { opusFrameDurationMs } from "./opus-frame.js";
import { WEBRTC_UPLINK_OPUS_MAX_BITRATE_BPS, type WebRtcSessionDescription } from "../shared/webrtc.js";
export type { WebRtcSessionDescription } from "../shared/webrtc.js";

export { DEFAULT_WEBRTC_UDP_PORT_RANGE, WEBRTC_UDP_PORT_RANGE } from "./webrtc-config.js";

const AUDIO_SAMPLE_RATE = 48_000;
const RTP_SAMPLES_PER_MS = AUDIO_SAMPLE_RATE / 1000;
const DEFAULT_WEBRTC_OPUS_PAYLOAD_TYPE = 111;
// Downstream slot count is bounded both for CPU hygiene (every werift track
// runs RTCP bookkeeping) and because the offer's m-line count — which a
// malicious client controls — must not dictate gateway work. The browser
// opens exactly this many recvonly transceivers; extra ones are answered
// inactive. Speaking slots are assigned LRU: in a room with more concurrent
// speakers than slots the least recently active voice stream stops.
const MAX_DOWNSTREAM_SLOTS = 16;

/** Local ICE candidates in an answer SDP. werift fills `media.iceCandidates`
 *  from the gathered transports, so a count of zero means gathering produced
 *  nothing: port-range exhaustion, address filtering or a bind failure — each
 *  of which silently degrades the session to the compatibility transport
 *  (报告 21 F2). Exported for tests. */
export function countIceCandidates(sdp: string): number {
  let count = 0;
  for (const line of sdp.split("\n")) if (line.startsWith("a=candidate:")) count += 1;
  return count;
}

// WebRTC is served by the WebSpeak process itself. The default range is also
// published by the bundled Docker Compose file; advanced administrators can
// change it in the admin console before enabling WebRTC.
export interface WebRtcAudioOptions {
  enabled: boolean;
  publicHost?: string;
  ipv6Enabled?: boolean;
  stunServer?: string;
  udpPortRange?: [number, number];
}

export interface WebRtcAudioSessionOptions {
  connectionId: string;
  publicAddresses?: string[];
  ipv6Enabled?: boolean;
  stunServer?: string;
  publicHost?: string;
  udpPortRange?: [number, number];
  logger: LoggerType;
  microphoneMuted?: boolean;
  accompanimentActive?: boolean;
  onVoiceFrame: (data: Buffer, codec: 4 | 5) => void;
  /** Fired whenever the speaking-slot assignment changes. The array maps slot
   *  index to TeamSpeak client id, with 0 marking a free slot. */
  onVoiceRoutes: (slots: readonly number[]) => void;
}

export interface WebRtcAudioStats {
  webrtcIngressRtpFrames: number;
  webrtcIngressRtpFirstAt: number | null;
  webrtcIngressRtpLastAt: number | null;
  webrtcIngressRtpMaxGapMs: number;
  webrtcEgressRtpFrames: number;
  webrtcEgressRtpFirstAt: number | null;
  webrtcEgressRtpLastAt: number | null;
  webrtcEgressRtpMaxGapMs: number;
  webrtcDownlinkForwardedFrames: number;
  webrtcDownlinkDroppedFrames: number;
  webrtcActiveSpeakerSlots: number;
}

interface DownstreamSlot {
  track: MediaStreamTrack;
  clientId: number;
  sequenceNumber: number;
  timestamp: number;
  markerPending: boolean;
  lastUsedAt: number;
}

/**
 * One WebRTC audio session for one browser connection.
 *
 * The browser's microphone uplink arrives on the first audio m-line and is
 * forwarded to TeamSpeak untouched. Downstream, every TeamSpeak speaker is
 * relayed on its own RTP stream through a pre-negotiated pool of sendonly
 * m-lines: payloads pass through byte-identical (one decode/encode stage less
 * than the previous mixer design and stereo accompaniment survives), while
 * sequence numbers, timestamps and the slot's sender SSRC are rewritten per
 * RFC 3550 so each speaker forms an independent continuous stream.
 */
export class WebRtcAudioSession {
  readonly peer: RTCPeerConnection;
  private readonly logger: LoggerType;
  private readonly udpPortRange: [number, number];
  private readonly onVoiceFrame: (data: Buffer, codec: 4 | 5) => void;
  private readonly onVoiceRoutes: (slots: readonly number[]) => void;
  private readonly uplink: ReturnType<RTCPeerConnection["addTransceiver"]>;
  private readonly slots: DownstreamSlot[] = [];
  private readonly opusPayloadTypes = new Set<number>();
  private outgoingPayloadType = DEFAULT_WEBRTC_OPUS_PAYLOAD_TYPE;
  private lastIngressRtpAt: number | null = null;
  private lastEgressRtpAt: number | null = null;
  private microphoneMuted: boolean;
  private accompanimentActive: boolean;
  // Egress frame diagnostics: with WEBSPEAK_RTP_DEBUG=1 the first frames per
  // session log their TOC/parsed duration/sequence/timeline so a silent
  // decode on the browser side can be attributed to payload vs RTP timeline,
  // then a low-rate sample keeps the channel observable without flooding.
  private readonly debugEnabled = process.env.WEBSPEAK_RTP_DEBUG === "1";
  private debugFrameCounter = 0;
  private closed = false;
  private closePromise: Promise<void> | null = null;
  private readonly stats: WebRtcAudioStats = {
    webrtcIngressRtpFrames: 0,
    webrtcIngressRtpFirstAt: null,
    webrtcIngressRtpLastAt: null,
    webrtcIngressRtpMaxGapMs: 0,
    webrtcEgressRtpFrames: 0,
    webrtcEgressRtpFirstAt: null,
    webrtcEgressRtpLastAt: null,
    webrtcEgressRtpMaxGapMs: 0,
    webrtcDownlinkForwardedFrames: 0,
    webrtcDownlinkDroppedFrames: 0,
    webrtcActiveSpeakerSlots: 0,
  };

  constructor(options: WebRtcAudioSessionOptions) {
    this.logger = options.logger.child({ component: "webrtc-audio", connectionId: options.connectionId });
    this.onVoiceFrame = options.onVoiceFrame;
    this.onVoiceRoutes = options.onVoiceRoutes;
    this.microphoneMuted = options.microphoneMuted === true;
    this.accompanimentActive = options.accompanimentActive === true;

    const iceAdditionalHostAddresses = options.publicAddresses ?? (options.publicHost ? [options.publicHost] : undefined);
    const udpPortRange = options.udpPortRange ?? WEBRTC_UDP_PORT_RANGE;
    this.udpPortRange = udpPortRange;
    this.peer = new RTCPeerConnection({
      // Both audio routes carry Opus; accepting PCMU would label Opus output
      // as another codec and silently discard the peer's incoming audio.
      codecs: { audio: [useOPUS()] },
      iceServers: options.stunServer ? [{ urls: options.stunServer }] : [],
      iceUseIpv4: true,
      iceUseIpv6: options.ipv6Enabled === true,
      iceUseTcp: false,
      icePortRange: [...udpPortRange] as [number, number],
      // S1（报告 21）：被地址策略拒绝的远端候选不建对、不产生任何出站包。
      iceFilterCandidatePair: pair => isAcceptableRemoteIceCandidate(pair.remoteCandidate.host, pair.remoteCandidate.port),
      // S1 收尾：只对携带 MESSAGE-INTEGRITY 的请求回签名响应（RFC 8445 连通性
      // 检查必带，真实浏览器恒满足）——无完整性属性的裸请求是反射器探测，
      // 不回签名包、也不驱动连通性检查。
      iceFilterStunResponse: message => message.attributesKeys.includes("MESSAGE-INTEGRITY"),
      ...(iceAdditionalHostAddresses ? { iceAdditionalHostAddresses } : {}),
    });
    this.peer.onconnectionstatechange = () => {
      this.logger.info({ state: this.peer.connectionState }, "WebRTC connection state changed");
    };

    // The uplink transceiver is created eagerly so the RTP subscription is in
    // place before any offer arrives: werift fires onTrack synchronously while
    // setRemoteDescription registers the browser's SSRC, so a subscription
    // made later (during createAnswer) would miss the event entirely and the
    // microphone RTP would arrive with no consumer.
    this.uplink = this.peer.addTransceiver("audio", { direction: "sendrecv" });
    this.uplink.onTrack.subscribe((track) => {
      track.onReceiveRtp.subscribe((rtp) => {
        if (this.closed) return;
        const receivedAt = performance.now();
        if (this.lastIngressRtpAt !== null) this.stats.webrtcIngressRtpMaxGapMs = Math.max(this.stats.webrtcIngressRtpMaxGapMs, Math.round(receivedAt - this.lastIngressRtpAt));
        this.lastIngressRtpAt = receivedAt;
        this.stats.webrtcIngressRtpFirstAt ??= Date.now();
        this.stats.webrtcIngressRtpLastAt = Date.now();
        this.stats.webrtcIngressRtpFrames++;
        if (!this.opusPayloadTypes.has(rtp.header.payloadType)) return;
        const payload = Buffer.from(rtp.payload);
        // A muted microphone must stop the browser user's TeamSpeak voice
        // packets at the gateway. Browser-side track.enabled/gain changes
        // still produce RTP comfort-silence on some browsers, and forwarding
        // those packets makes TeamSpeak keep the user in the speaking state.
        // When accompaniment is active, keep forwarding the mixed track: the
        // browser has already removed only the microphone component.
        if (this.microphoneMuted && !this.accompanimentActive) return;
        this.onVoiceFrame(payload, this.accompanimentActive ? 5 : 4);
      });
    });
  }

  getStats(): WebRtcAudioStats {
    return {
      ...this.stats,
      webrtcActiveSpeakerSlots: this.slots.reduce((count, slot) => count + (slot.clientId !== 0 ? 1 : 0), 0),
    };
  }

  /** S1 的可观测面：出站由 iceFilterCandidatePair 兜底拦下，这里在会话层留一条
   *  痕迹，方便排查「某客户端为什么连不上媒体」或确认恶意构造（数量 + 至多两个
   *  样本地址；地址本就来自该客户端自己的 SDP）。 */
  private noteRejectedRemoteCandidates(sdp: string): void {
    let rejected = 0;
    const samples: string[] = [];
    for (const rawLine of sdp.split("\n")) {
      const line = rawLine.trim();
      if (!line.startsWith("a=candidate:")) continue;
      // SDP 候选行：a=candidate:<foundation> <component> <transport> <priority> <address> <port> typ <type>
      const parts = line.split(/\s+/);
      if (isAcceptableRemoteIceCandidate(parts[4] ?? "", Number(parts[5]))) continue;
      rejected += 1;
      if (samples.length < 2) samples.push(parts[4] || line.slice(0, 48));
    }
    if (rejected > 0) {
      this.logger.warn({ rejected, samples }, "Offer contains remote ICE candidates rejected by the address policy");
    }
  }

  async createAnswer(offer: WebRtcSessionDescription): Promise<WebRtcSessionDescription> {
    if (this.closed) throw new Error("WebRTC session is closed");
    this.noteRejectedRemoteCandidates(offer.sdp);
    await this.peer.setRemoteDescription(offer);
    // The uplink m-line binds to the eagerly created transceiver; the
    // remaining audio m-lines from the offer form the downstream slot pool.
    // werift echoes the offer's direction onto each passive transceiver, so
    // the roles must still be assigned explicitly: we receive the uplink and
    // send the slots.
    const audioTransceivers = this.peer.getTransceivers().filter(transceiver => transceiver.kind === "audio");
    const uplink = this.uplink;
    const uplinkOpus = uplink.codecs.filter(codec => codec.mimeType.toLowerCase() === "audio/opus" && codec.clockRate === AUDIO_SAMPLE_RATE);
    if (!uplinkOpus.length) throw new Error("WebRTC offer did not negotiate Opus audio");
    this.opusPayloadTypes.clear();
    uplink.direction = "recvonly";
    for (const codec of uplinkOpus) {
      codec.parameters = pinOpusCodecParameters(codec.parameters);
      this.opusPayloadTypes.add(codec.payloadType);
    }
    this.outgoingPayloadType = uplinkOpus[0]!.payloadType;

    for (const transceiver of audioTransceivers.slice(1, 1 + MAX_DOWNSTREAM_SLOTS)) {
      transceiver.direction = "sendonly";
      for (const codec of transceiver.codecs) {
        if (codec.mimeType.toLowerCase() === "audio/opus" && codec.clockRate === AUDIO_SAMPLE_RATE) {
          codec.parameters = pinOpusCodecParameters(codec.parameters);
          this.opusPayloadTypes.add(codec.payloadType);
        }
      }
      const track = new MediaStreamTrack({ kind: "audio" });
      // The sender owns SSRC, sequence offset and RTCP for this stream; we
      // only feed it RTP packets with per-slot continuity (see
      // pushTeamSpeakVoice). A transceiver without negotiated Opus keeps its
      // track but the sender never transmits, preserving slot↔m-line alignment.
      await transceiver.sender.replaceTrack(track);
      this.slots.push({
        track,
        clientId: 0,
        sequenceNumber: randomInt(0, 65_536),
        timestamp: randomInt(0, 0x1_0000_0000) >>> 0,
        markerPending: true,
        lastUsedAt: 0,
      });
    }
    // Offers with more audio m-lines than the slot cap (or video m-lines we
    // never accept) are answered inactive rather than left to werift's echo.
    for (const transceiver of audioTransceivers.slice(1 + MAX_DOWNSTREAM_SLOTS)) {
      transceiver.direction = "inactive";
    }

    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    if (this.debugEnabled) {
      this.logger.info({
        slots: this.slots.map((slot, index) => ({
          slot: index,
          ssrc: audioTransceivers[index + 1]?.sender.ssrc ?? 0,
        })),
      }, "downstream slot SSRC map (compare with browser inbound-rtp SSRCs)");
    }
    const description = this.peer.localDescription;
    if (!description) throw new Error("WebRTC answer was not created");
    if (description.type !== "answer" && description.type !== "offer") throw new Error("Unexpected WebRTC answer type");
    // 候选量为零不是「稍后补齐」：werift 在 setLocalDescription 里已完成收集，answer
    // 就是浏览器唯一能拿到的候选来源。werift 对拿不到端口的地址只写 debug 日志，这里
    // 把它转成可观测告警，避免静默回退兼容传输而无从排查（报告 21 F2）。
    if (countIceCandidates(description.sdp) === 0) {
      // connectionId 已由 logger 的 child 绑定携带。
      this.logger.warn({
        portRange: this.udpPortRange,
      }, "WebRTC answer carries no ICE candidates; check the UDP port range, address bindings and firewall");
    }
    return { type: description.type, sdp: description.sdp };
  }

  /** Relays one TeamSpeak voice frame to the speaker's downstream slot. The
   *  Opus payload is forwarded byte-identically; only the RTP framing is
   *  generated here, with the timestamp advancing by the packet's real audio
   *  duration parsed from its TOC header. */
  pushTeamSpeakVoice(data: TSVoiceData): void {
    if (this.closed || (data.codec !== 4 && data.codec !== 5)) return;
    const payload = Buffer.isBuffer(data.data) ? data.data : Buffer.from(data.data);
    const durationMs = opusFrameDurationMs(payload);
    if (durationMs === null || payload.length === 0) {
      this.stats.webrtcDownlinkDroppedFrames++;
      this.logDebugFrame(payload[0] ?? -1, payload.length, -1, 0, 0, data.clientId);
      return;
    }
    const slot = this.slotFor(data.clientId);
    if (!slot) {
      this.stats.webrtcDownlinkDroppedFrames++;
      return;
    }
    const marker = slot.markerPending;
    slot.markerPending = false;
    // The sender overwrites payloadType and ssrc with the negotiated values,
    // so those header fields here are placeholders.
    const packet = new RtpPacket(new RtpHeader({
      payloadType: this.outgoingPayloadType,
      sequenceNumber: slot.sequenceNumber,
      timestamp: slot.timestamp,
      ssrc: 0,
      marker,
    }), payload);
    slot.sequenceNumber = (slot.sequenceNumber + 1) & 0xffff;
    slot.timestamp = (slot.timestamp + Math.round(durationMs * RTP_SAMPLES_PER_MS)) >>> 0;
    this.logDebugFrame(payload[0] ?? -1, payload.length, durationMs, packet.header.sequenceNumber, packet.header.timestamp, data.clientId);
    const sentAt = performance.now();
    try {
      slot.track.writeRtp(packet);
      if (this.lastEgressRtpAt !== null) this.stats.webrtcEgressRtpMaxGapMs = Math.max(this.stats.webrtcEgressRtpMaxGapMs, Math.round(sentAt - this.lastEgressRtpAt));
      this.lastEgressRtpAt = sentAt;
      this.stats.webrtcEgressRtpFirstAt ??= Date.now();
      this.stats.webrtcEgressRtpLastAt = Date.now();
      this.stats.webrtcEgressRtpFrames++;
      this.stats.webrtcDownlinkForwardedFrames++;
    } catch {
      this.stats.webrtcDownlinkDroppedFrames++;
    }
  }

  /** First 40 frames log in full, then a 1-in-500 sample keeps the channel
   *  observable without flooding production logs. */
  private logDebugFrame(toc: number, length: number, durationMs: number, sequenceNumber: number, timestamp: number, clientId: number): void {
    if (!this.debugEnabled) return;
    this.debugFrameCounter++;
    if (this.debugFrameCounter > 40 && this.debugFrameCounter % 500 !== 0) return;
    this.logger.info({ toc: `0x${toc.toString(16)}`, bytes: length, durationMs, seq: sequenceNumber, timestamp, clientId, frame: this.debugFrameCounter }, "RTP egress frame");
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closed = true;
    // Publish the completion before disposing resources: even reentrant or
    // concurrent callers must wait for the same physical peer shutdown.
    this.closePromise = Promise.resolve().then(async () => {
      for (const slot of this.slots) {
        try { slot.track.stop(); } catch { /* always attempt peer shutdown */ }
      }
      this.slots.length = 0;
      await this.peer.close();
    });
    return this.closePromise;
  }

  setMicrophoneMuted(muted: boolean): void {
    this.microphoneMuted = muted;
  }

  setAccompanimentActive(active: boolean): void {
    this.accompanimentActive = active;
  }

  /** Finds the speaker's slot, assigning a free one or evicting the least
   *  recently active speaker when the pool is full. Every reassignment is
   *  published so the browser can bind its playback streams. */
  private slotFor(clientId: number): DownstreamSlot | null {
    const now = performance.now();
    const existing = this.slots.find(slot => slot.clientId === clientId);
    if (existing) {
      existing.lastUsedAt = now;
      return existing;
    }
    let slot = this.slots.find(candidate => candidate.clientId === 0);
    if (!slot) slot = this.slots.reduce<DownstreamSlot | undefined>((oldest, candidate) => oldest === undefined || candidate.lastUsedAt < oldest.lastUsedAt ? candidate : oldest, undefined);
    if (!slot) return null;
    slot.clientId = clientId;
    slot.markerPending = true;
    slot.sequenceNumber = randomInt(0, 65_536);
    slot.timestamp = randomInt(0, 0x1_0000_0000) >>> 0;
    slot.lastUsedAt = now;
    this.onVoiceRoutes(this.slots.map(assigned => assigned.clientId));
    return slot;
  }
}

// werift echoes the browser offer's Opus fmtp into the negotiated codec, so
// the browser uplink encoder would keep its self-chosen settings. Rewriting
// the negotiated parameters is the only server-side lever on uplink quality:
// maxaveragebitrate raises the ceiling to the TeamSpeak quality-10 budget
// (the shared constant documents why 60 kbps, not 64), and usedtx=0 keeps
// discontinuous transmission off so the forwarded RTP timeline stays
// continuous — the gateway relays payloads untouched and cannot paper over
// DTX gaps. stereo is deliberately NOT set: the uplink is mono (microphone,
// with accompaniment mixed into the same track) and a stereo declaration
// would split the same bits across channels; the downstream slots inherit
// per-packet channel counts from the Opus TOC itself.
export function pinOpusCodecParameters(existing: string | undefined): string {
  const kept = (existing ?? "")
    .split(";")
    .map(part => part.trim())
    .filter(part => part && !/^(maxaveragebitrate|usedtx)=/i.test(part));
  kept.push(`maxaveragebitrate=${WEBRTC_UPLINK_OPUS_MAX_BITRATE_BPS}`, "usedtx=0");
  return kept.join(";");
}
