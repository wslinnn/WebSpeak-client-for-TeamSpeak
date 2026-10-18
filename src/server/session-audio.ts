import { WebSocket } from "ws";
import type { ServerMessage } from "../shared/server-messages.js";
import type { AudioFlowStats } from "./audio-stats.js";
import type { TSClient, TSVoiceData } from "./ts-client.js";
import type { WebRtcAudioSession } from "./webrtc-audio.js";

const AUDIO_FRAME_BYTES = 1_920; // 20 ms of 48 kHz mono Int16 PCM.
// Keep the established byte guard; the browser also bounds playback by time.
const MAX_BUFFERED_BYTES = 4_096;
// A malformed frame at voice rate is one error per 20 ms; replying per frame
// turns a bad client into a 100x reply amplifier. Report at most once per
// second and drop the connection after a full second of consecutive garbage.
const INVALID_FRAME_REPORT_INTERVAL_MS = 1_000;
const INVALID_FRAME_CLOSE_THRESHOLD = 20;
// Binary frames bypass the command rate limiter by design, so ingress needs
// its own budget: a 100-frame burst (2x the 50 Hz design rate) that refills
// at the design rate. A window with FRAME_FLOOD_CLOSE_DROPS drops is sustained
// flooding — a client bug or an attack either way — and closes the session
// instead of paying Opus encoding for garbage.
const FRAME_RATE_LIMIT_PER_SECOND = 100;
const FRAME_FLOOD_CLOSE_DROPS = 200;
// L7（报告 21）：egressFramesByClient 按 说话者 键只增不减——满编服务器跑一天
// 会把每个会话的统计表养到数千键。超过阈值时清掉 10 分钟没说话的键；活跃键
// 每帧刷新时间戳，不受影响。
const EGRESS_CLIENT_PRUNE_THRESHOLD = 256;
const EGRESS_CLIENT_TTL_MS = 10 * 60_000;
/** TS 客户端开麦静默期的周期帧 = ≤3 字节的数字舒适噪声（RFC 6716 最小有意义
 *  载荷远大于此；voice.md 62-63 档案的 0xfc 3 字节实锤）。不向下游转发：浏览器
 *  说话指示吃 packetsReceived 增量，舒适噪声会让磁贴在静音期误报说话。 */
const COMFORT_NOISE_FRAME_BYTES = 3;
/** 上行静音门控阈值（Int16 归一化 rms）：低于它视为静默，迟滞释放窗过后不再
 *  向 TS 转发——浏览器静默期发的是真实编码近静音帧（非 3 字节舒适噪声），
 *  转发会让 TS 保持「说话中」并使扬声器回灌路径常驻（2026-10-18 实测）。 */
const UPLINK_SPEECH_RMS = 0.006;
const UPLINK_RELEASE_MS = 350;
/** 测量解码器接口：仅 decode（Int16 PCM）。生产用 OpusEncoder，测试可注入桩。 */
export interface UplinkFrameDecoder {
  decode(frame: Buffer): Buffer;
}

export interface VoiceEncoder {
  encode(frame: Buffer): Buffer;
  dispose(): void;
}

export interface SessionAudioOptions {
  audio: AudioFlowStats;
  socket: Pick<WebSocket, "readyState" | "bufferedAmount" | "close"> & { send(packet: Buffer): void };
  client: Pick<TSClient, "sendVoice" | "sendWhisper">;
  isCurrent(): boolean;
  isReady(): boolean;
  selfId(): number;
  peer(): Pick<WebRtcAudioSession, "pushTeamSpeakVoice"> | null;
  whisperTargets(): readonly number[] | null;
  sendJson(message: ServerMessage): void;
}

/** A session owns one encoder and one active audio route in each direction. */
export class SessionAudioTransport {
  private encoder: VoiceEncoder | null;
  private closed = false;
  private warnedAt: number | null = null;
  private invalidFrameStreak = 0;
  private lastInvalidFrameReportAt = Number.NEGATIVE_INFINITY;
  private frameTokens = FRAME_RATE_LIMIT_PER_SECOND;
  private frameTokensAt: number;
  private floodWindowStart: number | null = null;
  private floodWindowDrops = 0;
  private readonly egressClientLastSeen = new Map<string, number>();

  constructor(private readonly options: SessionAudioOptions, encoder: VoiceEncoder, private readonly clock: () => number = Date.now,
    private readonly uplinkDecoder?: UplinkFrameDecoder) {
    this.encoder = encoder;
    this.frameTokensAt = this.clock();
  }

  private isCurrent(): boolean {
    return !this.closed && this.options.isCurrent() && this.options.socket.readyState === WebSocket.OPEN;
  }

  /** Binary ingress has no command-limiter coverage; without a budget a
   *  single session converts socket speed into Opus work and upstream
   *  TeamSpeak traffic at line rate. */
  private consumeFrameBudget(): boolean {
    const now = this.clock();
    this.frameTokens = Math.min(FRAME_RATE_LIMIT_PER_SECOND, this.frameTokens + ((now - this.frameTokensAt) / 1_000) * FRAME_RATE_LIMIT_PER_SECOND);
    this.frameTokensAt = now;
    if (this.frameTokens >= 1) {
      this.frameTokens -= 1;
      this.floodWindowStart = null;
      this.floodWindowDrops = 0;
      return true;
    }
    if (this.floodWindowStart === null || now - this.floodWindowStart > 1_000) {
      this.floodWindowStart = now;
      this.floodWindowDrops = 1;
    } else if (++this.floodWindowDrops >= FRAME_FLOOD_CLOSE_DROPS) {
      try { this.options.socket.close(1008, "AUDIO_FRAME_RATE_LIMITED"); } catch { /* the socket may already be closing */ }
    }
    this.options.audio.ingressDroppedFrames++;
    return false;
  }

  private recordIngress(): void {
    const stats = this.options.audio;
    const now = this.clock();
    if (stats.ingressLastAt !== null) stats.ingressMaxGapMs = Math.max(stats.ingressMaxGapMs, now - stats.ingressLastAt);
    stats.ingressFirstAt ??= now;
    stats.ingressLastAt = now;
    stats.ingressFrames++;
  }

  private sendVoice(data: Buffer, codec: number): void {
    const stats = this.options.audio;
    try {
      const targets = this.options.whisperTargets();
      if (targets?.length) this.options.client.sendWhisper(data, [...targets], codec);
      else this.options.client.sendVoice(data, codec);
      const now = this.clock();
      if (stats.tsSendLastAt !== null) stats.tsSendMaxGapMs = Math.max(stats.tsSendMaxGapMs, now - stats.tsSendLastAt);
      stats.tsSendFirstAt ??= now;
      stats.tsSendLastAt = now;
      stats.tsSendFrames++;
    } catch {
      stats.tsSendErrors++;
    }
  }

  private reportEncoderFailure(): void {
    const now = this.clock();
    if (this.warnedAt !== null && now - this.warnedAt < 5_000) return;
    this.warnedAt = now;
    try {
      this.options.sendJson({ type: "audioError", code: "AUDIO_ENCODER_UNAVAILABLE", detail: "Opus encoder unavailable" });
    } catch { /* the socket may have closed while reporting the failure */ }
  }

  receivePcm(frame: Buffer): void {
    if (!this.isCurrent()) return;
    if (!this.consumeFrameBudget()) return;
    const stats = this.options.audio;
    if (frame.length !== AUDIO_FRAME_BYTES) {
      stats.ingressDroppedFrames++;
      this.invalidFrameStreak++;
      const now = this.clock();
      if (this.invalidFrameStreak >= INVALID_FRAME_CLOSE_THRESHOLD) {
        try { this.options.socket.close(1008, "INVALID_AUDIO_FRAME"); } catch { /* the socket may already be closing */ }
        return;
      }
      if (now - this.lastInvalidFrameReportAt >= INVALID_FRAME_REPORT_INTERVAL_MS) {
        this.lastInvalidFrameReportAt = now;
        try {
          this.options.sendJson({ type: "error", error: { code: "INVALID_AUDIO_FRAME", message: "音频帧格式无效", recoverable: false } });
        } catch { /* the socket may have closed while reporting the failure */ }
      }
      return;
    }
    this.invalidFrameStreak = 0;
    // Late TCP frames from before a WebRTC switch must not duplicate RTP audio.
    if (!this.options.isReady() || this.options.peer()) { stats.ingressDroppedFrames++; return; }
    this.recordIngress();
    const startedAt = this.clock();
    let encoded: Buffer;
    try {
      if (!this.encoder) throw new Error("Encoder unavailable");
      encoded = this.encoder.encode(frame);
      stats.tsEncodeMaxMs = Math.max(stats.tsEncodeMaxMs, this.clock() - startedAt);
    } catch {
      stats.tsSendErrors++;
      stats.ingressDroppedFrames++;
      this.reportEncoderFailure();
      return;
    }
    this.sendVoice(encoded, 4);
  }

  receiveWebRtc(data: Buffer, codec: number): void {
    if (!this.isCurrent() || !this.options.isReady()) return;
    this.recordIngress();
    // 上行静音门控：解码测电平，迟滞释放窗（350ms，保词尾）过后静默期不向
    // TS 转发。伴奏混音（codec 5）不门控；解码失败放行（fail-open）。
    if (codec === 4 && !this.uplinkSpeech(this.clock(), data)) {
      this.options.audio.egressDroppedFrames++;
      return;
    }
    this.sendVoice(data, codec);
  }

  private uplinkVoiceUntil = 0;

  private uplinkSpeech(now: number, frame: Buffer): boolean {
    let rms: number | null = null;
    try {
      const pcm = this.uplinkDecoder?.decode(frame);
      if (pcm && pcm.length >= 2) {
        let sum = 0;
        const samples = Math.floor(pcm.length / 2);
        for (let index = 0; index < samples; index++) {
          const value = pcm.readInt16LE(index * 2) / 32_768;
          sum += value * value;
        }
        rms = Math.sqrt(sum / samples);
      }
    } catch {
      return true;
    }
    if (rms === null) return true;
    if (rms >= UPLINK_SPEECH_RMS) {
      this.uplinkVoiceUntil = now + UPLINK_RELEASE_MS;
      return true;
    }
    return now < this.uplinkVoiceUntil;
  }

  receiveTeamSpeak(data: TSVoiceData): void {
    if (!this.isCurrent() || !this.options.isReady()) return;
    const stats = this.options.audio;
    const now = this.clock();
    if (stats.tsReceiveLastAt !== null) stats.tsReceiveMaxGapMs = Math.max(stats.tsReceiveMaxGapMs, now - stats.tsReceiveLastAt);
    stats.tsReceiveFirstAt ??= now;
    stats.tsReceiveLastAt = now;
    stats.tsReceiveFrames++;
    if (data.clientId === this.options.selfId()) return;
    if (!Number.isInteger(data.clientId) || data.clientId < 1 || data.clientId > 65_535
      || !Number.isInteger(data.codec) || data.codec < 0 || data.codec > 255 || !Buffer.isBuffer(data.data)) {
      stats.egressDroppedFrames++;
      return;
    }
    // 舒适噪声过滤：不占 egress 记账（转发数/活跃表），WebRTC 与兼容 WS 两路同滤。
    if (data.data.length <= COMFORT_NOISE_FRAME_BYTES) {
      stats.egressDroppedFrames++;
      return;
    }
    if (stats.egressLastAt !== null) stats.egressMaxGapMs = Math.max(stats.egressMaxGapMs, now - stats.egressLastAt);
    stats.egressFirstAt ??= now;
    stats.egressLastAt = now;
    const key = String(data.clientId);
    stats.egressFramesByClient[key] = (stats.egressFramesByClient[key] ?? 0) + 1;
    this.egressClientLastSeen.set(key, now);
    if (this.egressClientLastSeen.size > EGRESS_CLIENT_PRUNE_THRESHOLD) this.pruneEgressClients(now);
    const peer = this.options.peer();
    if (peer) {
      try { peer.pushTeamSpeakVoice(data); stats.egressFrames++; }
      catch { stats.egressDroppedFrames++; }
      return;
    }
    const bufferedBytes = this.options.socket.bufferedAmount;
    stats.egressPeakBufferedBytes = Math.max(stats.egressPeakBufferedBytes, bufferedBytes);
    if (bufferedBytes > MAX_BUFFERED_BYTES) { stats.egressDroppedFrames++; return; }
    const packet = Buffer.allocUnsafe(3 + data.data.length);
    packet[0] = data.codec;
    packet.writeUInt16BE(data.clientId, 1);
    data.data.copy(packet, 3);
    try {
      this.options.socket.send(packet);
      stats.egressFrames++;
      const sentAt = this.clock();
      if (stats.egressSentLastAt !== null) stats.egressSentMaxGapMs = Math.max(stats.egressSentMaxGapMs, sentAt - stats.egressSentLastAt);
      stats.egressSentFirstAt ??= sentAt;
      stats.egressSentLastAt = sentAt;
    } catch { stats.egressDroppedFrames++; }
  }

  private pruneEgressClients(now: number): void {
    for (const [key, seenAt] of this.egressClientLastSeen) {
      if (now - seenAt < EGRESS_CLIENT_TTL_MS) continue;
      this.egressClientLastSeen.delete(key);
      delete this.options.audio.egressFramesByClient[key];
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const encoder = this.encoder;
    this.encoder = null;
    try { encoder?.dispose(); } catch { /* other session resources must still be released */ }
  }
}
