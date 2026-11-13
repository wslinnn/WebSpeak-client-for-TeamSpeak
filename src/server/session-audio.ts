import { WebSocket } from "ws";
import type { Logger as LoggerType } from "../logger.js";
import type { ServerMessage } from "../shared/server-messages.js";
import type { AudioFlowStats } from "./audio-stats.js";
import type { TSClient, TSVoiceData } from "./ts-client.js";
import type { WebRtcAudioSession } from "./webrtc-audio.js";
import { splitVoicePayload } from "./voice-payload.js";

const AUDIO_FRAME_BYTES = 1_920; // 20 ms of 48 kHz mono Int16 PCM.
// Keep the established byte guard; the browser also bounds playback by time.
const MAX_BUFFERED_BYTES = 4_096;
// A malformed frame at voice rate is one error per 20 ms; replying per frame
// turns a bad client into a 100x reply amplifier. Report at most once per
// second and drop the connection after a full second of consecutive garbage.
const INVALID_FRAME_REPORT_INTERVAL_MS = 1_000;
const INVALID_FRAME_CLOSE_THRESHOLD = 20;
// Binary frames bypass the command rate limiter by design, so ingress needs a
// budget of its own. The policy is two-tier and deliberately non-punitive: for
// a self-hosted gateway, silencing or dropping a normal user costs far more
// than paying for a little excess work.
//
//   1. Above the budget (400 frames/s = 8x the 50 Hz design rate) frames are
//      dropped and counted, and the session keeps running. Sustained overload
//      is therefore *capped*, not disconnected — the cap is what bounds CPU and
//      the upstream packet rate. The 8x headroom covers 10 ms ptime (100/s) and
//      5 ms ptime (200/s) browsers, a tab that was suspended and flushes its
//      queue, and mobile uplink jitter; the earlier 100/s budget sat exactly on
//      a 10 ms-ptime browser's rate and could drop frames under jitter.
//   2. Closing the session is reserved for an absurd burst: any successful
//      frame resets the window, so 600 drops in one window means >600 packets
//      arrived back-to-back with no refill gap — a client bug or an attack,
//      never audio.
// Drops are reported to the log (rate-limited) so an operator can tell
// "the gateway is discarding this session's uplink" from a TeamSpeak-side
// problem instead of guessing.
const FRAME_RATE_LIMIT_PER_SECOND = 400;
const FRAME_FLOOD_CLOSE_DROPS = 600;
const THROTTLE_REPORT_INTERVAL_MS = 60_000;
const THROTTLE_REPORT_DROPS = 100;
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
  /** Optional: audio faults are also surfaced here so operators can see them.
   *  Writes stay on the report window above — never per frame. */
  logger?: LoggerType;
  isCurrent(): boolean;
  isReady(): boolean;
  selfId(): number;
  /** The gateway advertised WebRTC to this session (`connected.webrtcAvailable`).
   *  Audio rides the peer exclusively: with no live peer there is no WS
   *  fallback in either direction — the failure surfaces on the browser
   *  instead of silently degrading to the compatibility transport. */
  webRtcVoice(): boolean;
  peer(): Pick<WebRtcAudioSession, "pushTeamSpeakVoice"> | null;
  whisperTargets(): readonly number[] | null;
  sendJson(message: ServerMessage): void;
}

/** A session owns one encoder and one active audio route in each direction. */
export class SessionAudioTransport {
  private encoder: VoiceEncoder | null;
  private closed = false;
  private readonly logger: LoggerType | null;
  private warnedAt: number | null = null;
  private invalidFrameStreak = 0;
  private lastInvalidFrameReportAt = Number.NEGATIVE_INFINITY;
  private frameTokens = FRAME_RATE_LIMIT_PER_SECOND;
  private frameTokensAt: number;
  private floodWindowStart: number | null = null;
  private floodWindowDrops = 0;
  private readonly egressClientLastSeen = new Map<string, number>();

  constructor(private readonly options: SessionAudioOptions, encoder: VoiceEncoder, private readonly clock: () => number = Date.now,
    /** Uplink silence-gate decoder factory. Created lazily on the first WebRTC
     *  voice frame: only WebRTC voice sessions ever measure
     *  uplink loudness, so a compatibility (WebSocket) session must not pay for
     *  a native Opus codec instance it never uses. */
    private readonly createUplinkDecoder?: () => UplinkFrameDecoder | undefined) {
    this.encoder = encoder;
    this.logger = options.logger ?? null;
    this.frameTokensAt = this.clock();
  }

  private uplinkDecoder: UplinkFrameDecoder | null = null;
  private uplinkDecoderResolved = false;

  /** The gate is an optional enhancement: an unavailable decoder fails open
   *  exactly like the legacy construction without one. */
  private uplinkRmsDecoder(): UplinkFrameDecoder | undefined {
    if (!this.createUplinkDecoder) return undefined;
    if (!this.uplinkDecoderResolved) {
      this.uplinkDecoderResolved = true;
      try {
        this.uplinkDecoder = this.createUplinkDecoder() ?? null;
      } catch {
        this.uplinkDecoder = null;
      }
    }
    return this.uplinkDecoder ?? undefined;
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
    this.reportThrottle(now);
    return false;
  }

  private throttleDrops = 0;
  private throttleReportedAt = Number.NEGATIVE_INFINITY;

  /** Warn once a minute, and only after a meaningful amount of loss. Without it,
   *  an operator diagnosing "others cannot hear me" has no way to tell the
   *  gateway is discarding that uplink (the counter alone is easy to miss). */
  private reportThrottle(now: number): void {
    this.throttleDrops += 1;
    if (this.throttleDrops < THROTTLE_REPORT_DROPS) return;
    if (now - this.throttleReportedAt < THROTTLE_REPORT_INTERVAL_MS) return;
    this.throttleReportedAt = now;
    const droppedFrames = this.throttleDrops;
    this.throttleDrops = 0;
    this.logger?.warn({
      code: "AUDIO_INGRESS_THROTTLED",
      droppedFrames,
      budgetPerSecond: FRAME_RATE_LIMIT_PER_SECOND,
    }, "Browser audio ingress exceeds the frame budget; excess frames are dropped");
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
    this.logger?.warn({ code: "AUDIO_ENCODER_UNAVAILABLE" }, "Opus encoder unavailable for the browser uplink");
    try {
      this.options.sendJson({ type: "audioError", code: "AUDIO_ENCODER_UNAVAILABLE", detail: "Opus encoder unavailable" });
    } catch { /* the socket may have closed while reporting the failure */ }
  }

  private unsupportedCodecReported = false;

  /** 每会话只报一次：非 Opus 频道在整个会话里都是同一个事实，逐包上报会把
   *  20ms 的语音流变成错误提示放大器（与坏帧报告同一理由）。 */
  private reportUnsupportedCodec(codec: number): void {
    if (this.unsupportedCodecReported) return;
    this.unsupportedCodecReported = true;
    this.logger?.warn({ code: "UNSUPPORTED_CHANNEL_CODEC", codec }, "Channel codec is not Opus; incoming voice cannot be relayed");
    try {
      this.options.sendJson({ type: "audioError", code: "UNSUPPORTED_CHANNEL_CODEC", detail: "当前频道编码不是 Opus" });
    } catch { /* the socket may have closed while reporting the failure */ }
  }

  receivePcm(frame: Buffer): void {
    if (!this.isCurrent()) return;
    const stats = this.options.audio;
    // Resolve the route before judging the frame. A frame that arrives while
    // the route is down (session not ready, a WebRTC peer has taken over, or
    // the session rides WebRTC voice and must not leak onto the WS uplink —
    // including the negotiating window and after a failed negotiation) is
    // discarded whatever its size, so calling it malformed misattributes
    // the drop — and the browser renders that error, which aborts an in-flight
    // quick connect. Late TCP frames from before a WebRTC switch must not
    // duplicate RTP audio either.
    if (!this.options.isReady() || this.options.peer() || this.options.webRtcVoice()) { stats.ingressDroppedFrames++; return; }
    // The budget is charged only for frames this route would actually process:
    // a suspended tab flushing its queue into a not-ready session is dropped
    // above at O(1) cost and must not trip the "ingress exceeds the frame
    // budget" warning, which is meant to describe real uplink overload.
    if (!this.consumeFrameBudget()) return;
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
        // 报告给浏览器的故障同时进日志（同一条限流窗口内）：出站错误本身不落
        // 日志，运维此前只能等会话拆除后从流量统计里反推持续发坏帧的客户端。
        this.logger?.warn(
          { code: "INVALID_AUDIO_FRAME", frameBytes: frame.length, expectedBytes: AUDIO_FRAME_BYTES, droppedFrames: stats.ingressDroppedFrames },
          "Discarded malformed browser audio frame",
        );
        try {
          this.options.sendJson({ type: "error", error: { code: "INVALID_AUDIO_FRAME", message: "音频帧格式无效", recoverable: false } });
        } catch { /* the socket may have closed while reporting the failure */ }
      }
      return;
    }
    this.invalidFrameStreak = 0;
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
    // RTP 上行同样绕过命令限流器——没有预算时单个已入房客户端
    // 可以按线速送 Opus 包，让网关逐包解码测电平再向 TS 转发。与兼容路径共用
    // 同一个令牌桶（会话同一时刻只有一条上行路由），持续洪泛同样关闭会话。
    if (!this.consumeFrameBudget()) return;
    this.recordIngress();
    // 上行静音门控：解码测电平，迟滞释放窗（350ms，保词尾）过后静默期不向
    // TS 转发。伴奏混音（codec 5）不门控；解码失败放行（fail-open）。
    if (codec === 4 && !this.uplinkSpeech(this.clock(), data)) {
      this.options.audio.egressDroppedFrames++;
      this.sendSilenceMarker(codec);
      return;
    }
    if (codec === 4) this.uplinkGateOpen = true;
    this.sendVoice(data, codec);
  }

  private uplinkGateOpen = false;

  /** 官方在 talk→silent 边沿发一帧空 payload 语音包（停止标记，36 号 §3）：
   *  接收方据此收尾说话态与抖动缓冲。与正常帧同路由（私语期走私语通道），
   *  只在门控由开到关的边沿发一次；空包本身不经过门控（它是门控的输出）。 */
  private sendSilenceMarker(codec: number): void {
    if (!this.uplinkGateOpen) return;
    this.uplinkGateOpen = false;
    this.sendVoice(Buffer.alloc(0), codec);
  }

  private uplinkVoiceUntil = 0;

  private uplinkSpeech(now: number, frame: Buffer): boolean {
    let rms: number | null = null;
    try {
      const pcm = this.uplinkRmsDecoder()?.decode(frame);
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
    // 非 Opus 频道（Speex/CELT）：网关不转码、浏览器也解不了，转发只会得到
    // 噪声。一次性显式报错（33 号 D12，有意差异），之后同 codec 静默丢弃。
    if (data.codec !== 4 && data.codec !== 5) {
      stats.egressDroppedFrames++;
      this.reportUnsupportedCodec(data.codec);
      return;
    }
    // 可选字节（33 号 D3/D14）：0x40 尾字节是发送方 RTT 抖动、0x10 扩展字节
    // 是 nvp（Opus 帧数）。必须先剥离/拆帧再做 ≤3 字节舒适噪声过滤——否则
    // 「3 字节帧 + 尾字节」会以 4 字节逃逸过滤。拆出的每帧独立走 peer/WS 路由。
    const split = splitVoicePayload(data.data, data.flags ?? 0);
    if (!split) {
      stats.egressDroppedFrames++;
      return;
    }
    const frames = split.frames.filter(frame => frame.length > COMFORT_NOISE_FRAME_BYTES);
    stats.egressDroppedFrames += split.frames.length - frames.length;
    if (frames.length === 0) return;
    // WebRTC 语音会话没有 WS 音频回退：无 live peer（协商窗口/协商失败/peer 拆除）
    // 时帧按丢弃记账而不是转投 WS——降级被移除后，断流必须显式可见。
    if (!this.options.peer() && this.options.webRtcVoice()) {
      stats.egressDroppedFrames += frames.length;
      return;
    }
    if (stats.egressLastAt !== null) stats.egressMaxGapMs = Math.max(stats.egressMaxGapMs, now - stats.egressLastAt);
    stats.egressFirstAt ??= now;
    stats.egressLastAt = now;
    const key = String(data.clientId);
    stats.egressFramesByClient[key] = (stats.egressFramesByClient[key] ?? 0) + frames.length;
    this.egressClientLastSeen.set(key, now);
    if (this.egressClientLastSeen.size > EGRESS_CLIENT_PRUNE_THRESHOLD) this.pruneEgressClients(now);
    const peer = this.options.peer();
    if (peer) {
      for (const frame of frames) {
        try {
          peer.pushTeamSpeakVoice(frame === data.data ? data : { ...data, data: frame });
          stats.egressFrames++;
        } catch { stats.egressDroppedFrames++; }
      }
      return;
    }
    for (const frame of frames) {
      const bufferedBytes = this.options.socket.bufferedAmount;
      stats.egressPeakBufferedBytes = Math.max(stats.egressPeakBufferedBytes, bufferedBytes);
      if (bufferedBytes > MAX_BUFFERED_BYTES) { stats.egressDroppedFrames++; continue; }
      const packet = Buffer.allocUnsafe(3 + frame.length);
      packet[0] = data.codec;
      packet.writeUInt16BE(data.clientId, 1);
      frame.copy(packet, 3);
      try {
        this.options.socket.send(packet);
        stats.egressFrames++;
        const sentAt = this.clock();
        if (stats.egressSentLastAt !== null) stats.egressSentMaxGapMs = Math.max(stats.egressSentMaxGapMs, sentAt - stats.egressSentLastAt);
        stats.egressSentFirstAt ??= sentAt;
        stats.egressSentLastAt = sentAt;
      } catch { stats.egressDroppedFrames++; }
    }
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
