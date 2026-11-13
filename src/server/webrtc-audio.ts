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
// inactive. 24 covers a large panel's concurrent speakers; an idle slot costs
// a negotiated m-line and nothing else (the browser only builds an <audio>
// element for a slot the gateway actually assigns).
const MAX_DOWNSTREAM_SLOTS = 24;
// A slot may only be taken away from its speaker after that speaker has been
// silent this long. TeamSpeak stops sending packets the moment a member stops
// talking, so "idle" is a reliable "not speaking"; the window is what keeps a
// room with more concurrent speakers than slots stable. Without it every
// packet of a 25th speaker preempted the least recently active slot, which
// re-broadcast the whole route table and restarted an RTP timeline 50 times a
// second (both the displaced and the newcomer kept evicting each other).
const SLOT_PREEMPT_IDLE_MS = 2_000;
// A sender-sequence jump larger than this is not packet loss (that would be a
// multi-second outage on a 50 Hz stream): the speaker's client restarted its
// counter. Rebase onto the new counter instead of emitting a huge gap.
const MAX_VID_GAP_FRAMES = 50;
// A sender sequence that keeps counting backwards is not reordering either:
// after this many rejected frames the counter is rebased so a client that
// reset it can never silence itself for the rest of the call.
const VID_REBASE_AFTER_REJECTS = 10;

/** RFC 6464 ssrc-audio-level header extension. Configuring the URI (not a
 *  fixed id) is what matters: werift keeps the remote offer's extension id
 *  when the URI is configured, so the answer advertises the browser's own
 *  extmap id and the receiver parses packets with that same id. */
export const AUDIO_LEVEL_URI = "urn:ietf:params:rtp-hdrext:ssrc-audio-level";

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
  /** Last TeamSpeak sender sequence relayed on this slot (null while the slot
   *  has no sender sequence to follow). */
  lastVid: number | null;
  /** True while `lastVid` belongs to the speaker's whisper counter, which
   *  TeamSpeak numbers separately from its normal voice counter. */
  vidWhisper: boolean;
  /** Packets rejected as duplicates or late reordering since the last accepted
   *  one (see VID_REBASE_AFTER_REJECTS). */
  vidRejected: number;
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
      // RFC 6464 level: werift filters the remote offer's extensions by URI
      // and keeps their ids, so this only advertises the extension back when
      // the browser actually offered it.
      headerExtensions: { audio: [{ id: 0, uri: AUDIO_LEVEL_URI }], video: [] },
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
    // A throw in here must not strand the peer: the factory never returns, so
    // the caller's `peer` handle stays null and its `peer?.close()` is a no-op.
    let uplink: ReturnType<RTCPeerConnection["addTransceiver"]>;
    try {
      this.peer.onconnectionstatechange = () => {
        this.logger.info({ state: this.peer.connectionState }, "WebRTC connection state changed");
      };

      // The uplink transceiver is created eagerly so the RTP subscription is in
      // place before any offer arrives: werift fires onTrack synchronously while
      // setRemoteDescription registers the browser's SSRC, so a subscription
      // made later (during createAnswer) would miss the event entirely and the
      // microphone RTP would arrive with no consumer.
      uplink = this.peer.addTransceiver("audio", { direction: "sendrecv" });
      uplink.onTrack.subscribe((track) => {
        track.onReceiveRtp.subscribe((rtp, extensions) => {
          if (this.closed) return;
          const receivedAt = performance.now();
          if (this.lastIngressRtpAt !== null) this.stats.webrtcIngressRtpMaxGapMs = Math.max(this.stats.webrtcIngressRtpMaxGapMs, Math.round(receivedAt - this.lastIngressRtpAt));
          this.lastIngressRtpAt = receivedAt;
          this.stats.webrtcIngressRtpFirstAt ??= Date.now();
          this.stats.webrtcIngressRtpLastAt = Date.now();
          this.stats.webrtcIngressRtpFrames++;
          this.noteUplinkAudioLevel(extensions);
          if (!this.opusPayloadTypes.has(rtp.header.payloadType)) return;
          // A muted microphone must stop the browser user's TeamSpeak voice
          // packets at the gateway. Browser-side track.enabled/gain changes
          // still produce RTP comfort-silence on some browsers, and forwarding
          // those packets makes TeamSpeak keep the user in the speaking state.
          // When accompaniment is active, keep forwarding the mixed track: the
          // browser has already removed only the microphone component.
          if (this.microphoneMuted && !this.accompanimentActive) return;
          // F7（报告 21）：Buffer 复制放在静音/伴奏短路之后——被静音丢弃的帧
          // 不再付出逐帧拷贝。
          const payload = Buffer.from(rtp.payload);
          this.onVoiceFrame(payload, this.accompanimentActive ? 5 : 4);
        });
      });
    } catch (error: unknown) {
      void this.peer.close().catch(() => { /* rollback is best effort */ });
      throw error;
    }
    this.uplink = uplink;
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
          codec.parameters = pinOpusCodecParameters(codec.parameters, "downstream");
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
        // RFC 3550 §5.1: the initial sequence number and timestamp are drawn
        // at random so an observer cannot infer traffic history. This is the
        // only place they are drawn — a slot keeps its timeline for life.
        sequenceNumber: randomInt(0, 65_536),
        timestamp: randomInt(0, 0x1_0000_0000) >>> 0,
        markerPending: true,
        lastUsedAt: 0,
        lastVid: null,
        vidWhisper: false,
        vidRejected: 0,
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
   *  duration parsed from its TOC header and the sequence following the
   *  speaker's own packet counter so loss, reordering and duplicates stay
   *  visible to the browser instead of being flattened into a continuous
   *  stream. `frameIndex` is the frame's position inside its sender packet:
   *  the second and later frames of one packet share its sender sequence and
   *  follow each other with no gap. */
  pushTeamSpeakVoice(data: TSVoiceData, frameIndex = 0): void {
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
    const samples = Math.round(durationMs * RTP_SAMPLES_PER_MS);
    if (!this.placeOnTimeline(slot, data, samples, frameIndex > 0)) {
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
    slot.timestamp = (slot.timestamp + samples) >>> 0;
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

  /** Places the frame on the slot's RTP timeline. Returns false when the frame
   *  must not be forwarded (a duplicate, or a packet that arrived after a later
   *  one — putting it back in time would make the browser play the audio out of
   *  order). A sender-sequence gap is turned into a sequence/timestamp hole so
   *  the browser conceals the missing audio instead of playing the rest of the
   *  speech slightly fast. */
  private placeOnTimeline(slot: DownstreamSlot, data: TSVoiceData, samples: number, continuation: boolean): boolean {
    const whisper = data.isWhisper === true;
    const rawVid = data.vid;
    const vid = typeof rawVid === "number" && Number.isInteger(rawVid) ? rawVid & 0xffff : null;
    if (continuation) {
      // Another Opus frame of the packet already on the timeline: it shares
      // that packet's sender sequence, so no gap and no new baseline.
      return true;
    }
    if (vid === null) {
      // No sender sequence to key on (legacy SDK event): keep the arrival-order
      // timeline this path has always used.
      slot.lastVid = null;
      slot.vidRejected = 0;
      slot.vidWhisper = whisper;
      return true;
    }
    let advance = 1;
    if (slot.lastVid !== null && slot.vidWhisper === whisper) {
      // RFC-equivalent comparison for a 16-bit counter: the signed difference,
      // never `a < b` (it wraps from 65535 to 0).
      const delta = ((vid - slot.lastVid) << 16) >> 16;
      if (delta === 0) {
        // The same packet arrived twice: forwarding it would repeat a syllable.
        slot.vidRejected += 1;
        if (slot.vidRejected < VID_REBASE_AFTER_REJECTS) return false;
        // A speaker whose counter keeps repeating has restarted it: rebase so
        // the member is heard again instead of being dropped forever.
        slot.vidRejected = 0;
        slot.lastVid = vid;
        slot.vidWhisper = whisper;
        return true;
      }
      if (delta < 0) {
        // Arrived after a later packet: the receiver cannot use it either, and
        // forwarding it would move the audio backwards in time.
        slot.vidRejected += 1;
        if (slot.vidRejected < VID_REBASE_AFTER_REJECTS) return false;
        slot.vidRejected = 0;
        slot.lastVid = vid;
        slot.vidWhisper = whisper;
        return true;
      }
      if (delta <= MAX_VID_GAP_FRAMES) advance = delta;
      // A larger jump is a counter restart, not loss: rebase (advance stays 1).
    }
    slot.vidRejected = 0;
    if (advance > 1) {
      // Leave the hole *before* this packet: the receiver then sees the gap
      // between the previous packet and this one, and this packet's timestamp
      // lands delta frame durations later.
      slot.sequenceNumber = (slot.sequenceNumber + (advance - 1)) & 0xffff;
      slot.timestamp = (slot.timestamp + (advance - 1) * samples) >>> 0;
    }
    slot.lastVid = vid;
    slot.vidWhisper = whisper;
    return true;
  }

  private uplinkLevelFrames = 0;

  /** Calibration probe for the D11 gate (WEBSPEAK_RTP_DEBUG=1): one log line
   *  per second of received RFC 6464 level values. The gate itself stays
   *  RMS-based until the probe has calibrated thresholds on real browsers. */
  private noteUplinkAudioLevel(extensions: { [uri: string]: unknown } | undefined): void {
    const level = extensions?.[AUDIO_LEVEL_URI] as { v?: boolean; level?: number } | undefined;
    if (!level || typeof level.level !== "number") return;
    this.uplinkLevelFrames++;
    if (!this.debugEnabled || this.uplinkLevelFrames % 50 !== 0) return;
    this.logger.info({ level: level.level, voiced: level.v === true }, "uplink audio level");
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

  /** Releases the slot of a speaker who left the server. Without this the
   *  binding (and the announced route list) keeps naming a client that is gone
   *  until some other speaker happens to claim the slot, which also inflates
   *  the active-speaker count in diagnostics. */
  releaseClient(clientId: number): void {
    const slot = this.slots.find(candidate => candidate.clientId === clientId);
    if (!slot) return;
    slot.clientId = 0;
    slot.markerPending = true;
    // The RTP timeline is not reset here: the slot keeps its sequence space
    // and the next speaker continues it (see slotFor).
    slot.lastVid = null;
    slot.vidRejected = 0;
    this.onVoiceRoutes(this.slots.map(assigned => assigned.clientId));
  }

  /** Finds the speaker's slot, assigning a free one or — only once its speaker
   *  has been silent for SLOT_PREEMPT_IDLE_MS — taking the least recently
   *  active one. A slot whose speaker is still transmitting is never taken:
   *  with more concurrent speakers than slots the newcomer's frames are dropped
   *  instead, so the speakers that got a slot keep a stable RTP stream each.
   *  Every reassignment is published once so the browser can bind its playback
   *  streams. */
  private slotFor(clientId: number): DownstreamSlot | null {
    const now = performance.now();
    const existing = this.slots.find(slot => slot.clientId === clientId);
    if (existing) {
      existing.lastUsedAt = now;
      return existing;
    }
    let slot = this.slots.find(candidate => candidate.clientId === 0);
    if (!slot) {
      const oldest = this.slots.reduce<DownstreamSlot | undefined>(
        (candidate, other) => candidate === undefined || other.lastUsedAt < candidate.lastUsedAt ? other : candidate, undefined);
      if (!oldest || now - oldest.lastUsedAt < SLOT_PREEMPT_IDLE_MS) return null;
      slot = oldest;
    }
    slot.clientId = clientId;
    slot.markerPending = true;
    // Hand the slot over on the timeline it already has. The slot's SSRC never
    // changes and RFC 3550 defines one continuous sequence/timestamp space per
    // SSRC; the previous random restart made the browser's jitter buffer read
    // the new speaker as loss or reordering. The marker bit is what tells the
    // receiver a new talk spurt starts here.
    slot.lastVid = null;
    slot.vidRejected = 0;
    slot.lastUsedAt = now;
    this.onVoiceRoutes(this.slots.map(assigned => assigned.clientId));
    return slot;
  }
}

// werift echoes the browser offer's Opus fmtp into the negotiated codec, so
// the browser uplink encoder would keep its self-chosen settings. Rewriting the
// negotiated parameters is the only server-side lever on uplink quality:
// maxaveragebitrate raises the ceiling to the TeamSpeak quality-10 budget (the
// shared constant documents why 60 kbps, not 64), and usedtx=0 keeps
// discontinuous transmission off so the forwarded RTP timeline stays
// continuous — the gateway relays payloads untouched and cannot paper over DTX
// gaps.
//
// The uplink is mono (microphone, with accompaniment mixed into the same
// track), so the uplink answer must say so: Firefox offers `stereo=1` by
// default and keeping it would let the browser declare a stereo send while the
// gateway forwards the payload as codec 4 (mono). The downstream m-lines keep
// whatever the browser offered — codec 5 (stereo accompaniment) is relayed
// untouched and must stay allowed there.
export function pinOpusCodecParameters(existing: string | undefined, role: "uplink" | "downstream" = "uplink"): string {
  const kept = (existing ?? "")
    .split(";")
    .map(part => part.trim())
    .filter(part => part && !/^(maxaveragebitrate|usedtx)=/i.test(part))
    .filter(part => role === "downstream" || !/^(stereo|sprop-stereo)=/i.test(part));
  kept.push(`maxaveragebitrate=${WEBRTC_UPLINK_OPUS_MAX_BITRATE_BPS}`, "usedtx=0");
  if (role === "uplink") kept.push("stereo=0");
  return kept.join(";");
}
