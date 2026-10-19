import assert from "node:assert/strict";
import test from "node:test";
import { SessionAudioTransport } from "./session-audio.js";
import { createAudioFlowStats } from "./audio-stats.js";
import type { ServerMessage } from "../shared/server-messages.js";
import type { TSVoiceData } from "./ts-client.js";

function fixture(uplinkDecoder?: { decode(frame: Buffer): Buffer }) {
  const state = { current: true, ready: true, now: 0, targets: null as number[] | null, disposed: 0,
    peer: null as { pushTeamSpeakVoice(data: TSVoiceData): void } | null };
  const audio = createAudioFlowStats();
  const packets: Buffer[] = [];
  const encoded: Buffer[] = [];
  const forwarded: Array<{ data: Buffer; codec: number; targets?: number[] }> = [];
  const notices: ServerMessage[] = [];
  const warnings: Array<Record<string, unknown>> = [];
  const closes: Array<{ code: number; reason: string }> = [];
  const socket = { readyState: 1 as 0 | 1 | 2 | 3, bufferedAmount: 0, send: (packet: Buffer) => { packets.push(packet); },
    close: (code: number, reason: string) => { closes.push({ code, reason }); } };
  const client = {
    sendVoice: (data: Buffer, codec: number) => { forwarded.push({ data, codec }); },
    sendWhisper: (data: Buffer, targets: number[], codec: number) => { forwarded.push({ data, codec, targets }); },
  };
  const encoder = {
    encode(frame: Buffer) { encoded.push(frame); state.now += 3; return Buffer.from([9, 8, 7]); },
    dispose() { state.disposed++; },
  };
  const logger = {
    debug: () => {}, info: () => {}, error: () => {},
    warn: (objOrMessage: unknown) => { if (typeof objOrMessage === "object" && objOrMessage !== null) warnings.push(objOrMessage as Record<string, unknown>); },
    child: () => logger,
  };
  const transport = new SessionAudioTransport({
    audio, socket, client, logger, isCurrent: () => state.current, isReady: () => state.ready,
    selfId: () => 1, peer: () => state.peer, whisperTargets: () => state.targets,
    sendJson: message => { notices.push(message); },
  }, encoder, () => state.now, uplinkDecoder);
  // 载荷取现实尺寸（≥4 字节）：≤3 字节是舒适噪声帧，下行过滤器会拦（见下方专测）。
  const remote = (clientId = 513) => ({ clientId, codec: 4, data: Buffer.from([11, 12, 13, 14]) });
  return { transport, audio, state, socket, client, encoder, packets, encoded, forwarded, notices, warnings, closes, remote };
}

test("PCM framing preserves codec, whisper routing and timing counters", () => {
  const f = fixture();
  f.transport.receivePcm(Buffer.alloc(1_920));
  f.state.now = 20;
  f.state.targets = [7, 8];
  f.transport.receivePcm(Buffer.alloc(1_920));
  assert.deepEqual(f.forwarded.map(({ codec, targets }) => ({ codec, targets })), [
    { codec: 4, targets: undefined }, { codec: 4, targets: [7, 8] },
  ]);
  assert.equal(f.audio.ingressFrames, 2);
  assert.equal(f.audio.ingressMaxGapMs, 20);
  assert.equal(f.audio.tsSendMaxGapMs, 20);
  assert.equal(f.audio.tsEncodeMaxMs, 3);
});

test("invalid PCM replies are rate limited and a sustained streak closes the socket", () => {
  const f = fixture();
  // 20 malformed frames in the same second: one reply, then a protocol close.
  for (let i = 0; i < 20; i++) f.transport.receivePcm(Buffer.alloc(1_919));
  assert.equal(f.notices.length, 1);
  assert.deepEqual(f.notices[0], { type: "error", error: { code: "INVALID_AUDIO_FRAME", message: "音频帧格式无效", recoverable: false } });
  assert.deepEqual(f.closes, [{ code: 1008, reason: "INVALID_AUDIO_FRAME" }]);
  assert.equal(f.audio.ingressDroppedFrames, 20);
  // A later valid frame resets the streak: occasional garbage must never
  // accumulate into a close while real audio keeps flowing.
  f.state.now = 5_000;
  f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(f.encoded.length, 1);
  // An unready session still drops frames silently, without error replies.
  f.state.ready = false;
  const droppedBefore = f.audio.ingressDroppedFrames;
  f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(f.audio.ingressDroppedFrames, droppedBefore + 1);
  assert.equal(f.notices.length, 1);
});

test("a frame the route discards is never reported as malformed", () => {
  const f = fixture();
  // 路由关闭期（会话未就绪 / WebRTC 已接管）任何帧都会被丢弃：把它算作坏帧
  // 会给出错误归因，浏览器还会把该 code 当会话错误渲染，打断进行中的快速连接；
  // 连发 20 帧更不能因此触发 1008 关闭。
  f.state.ready = false;
  for (let i = 0; i < 25; i++) f.transport.receivePcm(Buffer.alloc(1_919));
  assert.equal(f.notices.length, 0);
  assert.equal(f.warnings.length, 0);
  assert.equal(f.closes.length, 0);
  assert.equal(f.audio.ingressDroppedFrames, 25);
  // 同尺寸的帧在路由就绪后仍然是坏帧：顺序换了，判据没放宽。
  f.state.ready = true;
  f.transport.receivePcm(Buffer.alloc(1_919));
  assert.equal(f.notices.length, 1);
  assert.equal(f.warnings.length, 1);
  assert.deepEqual(f.warnings[0], { code: "INVALID_AUDIO_FRAME", frameBytes: 1_919, expectedBytes: 1_920, droppedFrames: 26 });
  // WebRTC 接管后同理：迟到的 TCP 帧只记路由丢弃。
  f.state.peer = { pushTeamSpeakVoice() {} };
  f.state.now = 10_000;
  f.transport.receivePcm(Buffer.alloc(1_919));
  assert.equal(f.notices.length, 1);
  assert.equal(f.closes.length, 0);
});

test("the ingress token bucket drops burst overflow and closes sustained floods", () => {
  const f = fixture();
  // The fixture clock advances on every encode; pin it so the bucket is only
  // refilled by explicit time jumps. The stand-in still records frames.
  f.encoder.encode = (frame) => { f.encoded.push(frame); return Buffer.from([9]); };
  // The full burst budget passes at once; real-time audio (50 Hz) refills
  // behind its consumption forever.
  for (let i = 0; i < 100; i++) f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(f.encoded.length, 100);
  // Same-instant overflow only drops: TCP catch-up bursts must not close a
  // session that was merely slow for a moment.
  for (let i = 0; i < 60; i++) f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(f.encoded.length, 100);
  assert.equal(f.audio.ingressDroppedFrames, 60);
  assert.equal(f.closes.length, 0);
  // Time passes, the bucket refills to full again.
  f.state.now = 5_000;
  for (let i = 0; i < 100; i++) f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(f.encoded.length, 200);
  // A window of sustained flooding (200 drops, FRAME_FLOOD_CLOSE_DROPS)
  // closes the session like malformed audio.
  for (let i = 0; i < 200; i++) f.transport.receivePcm(Buffer.alloc(1_920));
  assert.deepEqual(f.closes, [{ code: 1008, reason: "AUDIO_FRAME_RATE_LIMITED" }]);
});

test("WebRTC ingress excludes queued PCM and fallback re-enables PCM", () => {
  const f = fixture();
  f.state.peer = { pushTeamSpeakVoice() {} };
  f.transport.receivePcm(Buffer.alloc(1_920));
  const opus = Buffer.from([3, 2, 1]);
  f.transport.receiveWebRtc(opus, 5);
  assert.equal(f.encoded.length, 0);
  assert.deepEqual(f.forwarded, [{ data: opus, codec: 5 }]);
  assert.equal(f.audio.ingressDroppedFrames, 1);
  f.state.peer = null;
  f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(f.encoded.length, 1);
  assert.equal(f.audio.tsSendFrames, 2);
});

test("TeamSpeak packets keep the three-byte header and exclude self playback", () => {
  const f = fixture();
  f.transport.receiveTeamSpeak(f.remote(1));
  const remote = f.remote();
  f.transport.receiveTeamSpeak(remote);
  remote.data.fill(0);
  assert.deepEqual([...f.packets[0]!], [4, 2, 1, 11, 12, 13, 14]);
  assert.equal(f.audio.tsReceiveFrames, 2);
  assert.equal(f.audio.egressFrames, 1);
  assert.deepEqual(f.audio.egressFramesByClient, { "513": 1 });
});

test("comfort noise frames (≤3 bytes) are not forwarded to either downlink", () => {
  const pushed: TSVoiceData[] = [];
  const f = fixture();
  f.state.peer = { pushTeamSpeakVoice: (data: TSVoiceData) => { pushed.push(data); } };
  // 开麦静默期 TS 客户端发的 3 字节数字舒适噪声：不转发（说话指示吃
  // packetsReceived 增量，转发会让磁贴静音期误报说话），计 egressDropped。
  const before = f.audio.egressDroppedFrames;
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 4, data: Buffer.from([252, 3, 7]) });
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 4, data: Buffer.from([1]) });
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 4, data: Buffer.alloc(0) });
  assert.equal(f.packets.length, 0, "兼容 WS 不收到舒适噪声");
  assert.equal(pushed.length, 0, "WebRTC 槽不收到舒适噪声");
  assert.equal(f.audio.egressDroppedFrames, before + 3);
  assert.deepEqual(f.audio.egressFramesByClient, {}, "不占每客户端转发记账");
  // 现实载荷不受影响。
  f.transport.receiveTeamSpeak(f.remote(513));
  assert.equal(pushed.length, 1);
  assert.deepEqual([...pushed[0]!.data], [11, 12, 13, 14]);
});

test("uplink silence gate drops near-silent frames after the release window and passes speech", () => {
  // 解码桩：帧首字节 1 = 语音（rms≈0.09），否则为数字静音（rms=0）。
  const voicePcm = Buffer.from(Int16Array.from({ length: 960 }, () => 3000).buffer);
  const decoder = { decode: (frame: Buffer) => (frame[0] === 1 ? voicePcm : Buffer.alloc(1_920)) };
  const f = fixture(decoder);
  // 静音帧：释放窗未武装 → 直接拦截。
  const silence = Buffer.from([2, 9]);
  f.transport.receiveWebRtc(silence, 4);
  assert.equal(f.forwarded.length, 0);
  assert.equal(f.audio.egressDroppedFrames, 1);
  // 语音帧：放行并武装释放窗（350ms）。
  f.transport.receiveWebRtc(Buffer.from([1, 9]), 4);
  assert.equal(f.forwarded.length, 1);
  // 窗内静音帧放行（词尾保护）。
  f.state.now += 100;
  f.transport.receiveWebRtc(silence, 4);
  assert.equal(f.forwarded.length, 2);
  // 窗外静音帧拦截；codec 5（伴奏混音）永不门控。
  f.state.now += 1_000;
  f.transport.receiveWebRtc(silence, 4);
  assert.equal(f.forwarded.length, 2);
  assert.equal(f.audio.egressDroppedFrames, 2);
  f.transport.receiveWebRtc(Buffer.from([5, 9]), 5);
  assert.equal(f.forwarded.length, 3);
});

test("uplink silence gate fails open when no decoder is wired (legacy construction)", () => {
  const f = fixture();
  f.transport.receiveWebRtc(Buffer.from([2, 9]), 4);
  assert.equal(f.forwarded.length, 1);
});

test("backpressure drops bursts above 4096 bytes and resumes without a retained queue", () => {
  const f = fixture();
  f.socket.bufferedAmount = 4_096;
  f.transport.receiveTeamSpeak(f.remote());
  f.socket.bufferedAmount = 4_097;
  for (let i = 0; i < 100; i++) f.transport.receiveTeamSpeak(f.remote());
  assert.equal(f.packets.length, 1);
  assert.equal(f.audio.egressDroppedFrames, 100);
  f.socket.bufferedAmount = 0;
  f.transport.receiveTeamSpeak(f.remote());
  assert.equal(f.packets.length, 2);
  assert.equal(f.audio.egressPeakBufferedBytes, 4_097);
});

test("the per-client egress table prunes speakers silent for ten minutes (报告 21 L7)", () => {
  const f = fixture();
  // 越过 256 键阈值：257 个不同说话人，全部活跃。
  for (let clientId = 2; clientId <= 258; clientId++) {
    f.state.now = clientId; // 每个说话人带自己的时间戳
    f.transport.receiveTeamSpeak(f.remote(clientId));
  }
  assert.equal(Object.keys(f.audio.egressFramesByClient).length, 257);
  // 时钟推进过 10 分钟 TTL：旧键（2..257）过期被清，258 刚说完话保留。
  f.state.now = 610_000;
  f.transport.receiveTeamSpeak(f.remote(258));
  const surviving = Object.keys(f.audio.egressFramesByClient);
  assert.deepEqual(surviving, ["258"]);
  // 保留键的计数连续：新帧只 +1，不重置。
  assert.equal(f.audio.egressFramesByClient["258"], 2);
});

test("WebRTC downlink owns egress without a duplicate WebSocket packet", () => {
  const f = fixture();
  const received: TSVoiceData[] = [];
  f.state.peer = { pushTeamSpeakVoice: data => { received.push(data); } };
  f.transport.receiveTeamSpeak(f.remote());
  assert.equal(received.length, 1);
  assert.equal(f.packets.length, 0);
  f.state.peer = null;
  f.transport.receiveTeamSpeak(f.remote());
  assert.equal(received.length, 1);
  assert.equal(f.packets.length, 1);
});

test("encoding failures are counted and reported at most once per five seconds", t => {
  const f = fixture();
  t.mock.method(f.encoder, "encode", () => { throw new Error("Codec failed"); });
  for (const now of [0, 1, 4_999, 5_000]) { f.state.now = now; f.transport.receivePcm(Buffer.alloc(1_920)); }
  assert.equal(f.audio.tsSendErrors, 4);
  assert.equal(f.audio.ingressDroppedFrames, 4);
  assert.equal(f.forwarded.length, 0);
  assert.equal(f.notices.length, 2);
  assert.deepEqual(f.notices[0], { type: "audioError", code: "AUDIO_ENCODER_UNAVAILABLE", detail: "Opus encoder unavailable" });
  t.mock.restoreAll();
  f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(f.audio.tsSendFrames, 1);
});

test("SDK and downlink failures cannot escape the audio callbacks", t => {
  const f = fixture();
  t.mock.method(f.client, "sendVoice", () => { throw new Error("SDK disconnected"); });
  f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(f.audio.tsSendErrors, 1);
  assert.equal(f.notices.length, 0, "SDK failure must not be reported as an encoder failure");
  t.mock.method(f.socket, "send", () => { throw new Error("Socket closed"); });
  f.transport.receiveTeamSpeak(f.remote());
  f.state.peer = { pushTeamSpeakVoice() { throw new Error("Peer closed"); } };
  f.transport.receiveTeamSpeak(f.remote());
  assert.equal(f.audio.egressDroppedFrames, 2);
});

test("removed sessions and closed sockets ignore late frames without changing counters", () => {
  const f = fixture();
  const baseline = structuredClone(f.audio);
  const lateFrames = () => {
    f.transport.receivePcm(Buffer.alloc(1_920));
    f.transport.receiveWebRtc(Buffer.from([1]), 4);
    f.transport.receiveTeamSpeak(f.remote());
  };
  f.state.current = false;
  lateFrames();
  f.state.current = true;
  f.socket.readyState = 3;
  lateFrames();
  assert.deepEqual(f.audio, baseline);
  assert.equal(f.encoded.length, 0);
});

test("codec cleanup is idempotent even if disposal throws", t => {
  const f = fixture();
  let attempts = 0;
  t.mock.method(f.encoder, "dispose", () => { attempts++; throw new Error("Already closed"); });
  f.transport.close();
  f.transport.close();
  f.transport.receivePcm(Buffer.alloc(1_920));
  f.transport.receiveWebRtc(Buffer.from([1]), 4);
  f.transport.receiveTeamSpeak(f.remote());
  assert.equal(attempts, 1);
  assert.equal(f.audio.ingressFrames, 0);
  assert.equal(f.audio.tsReceiveFrames, 0);
});

test("invalid SDK speaker IDs and codecs cannot throw while packing the header", () => {
  const f = fixture();
  for (const clientId of [-1, 65_536, NaN]) f.transport.receiveTeamSpeak(f.remote(clientId));
  for (const codec of [-1, 256, NaN]) f.transport.receiveTeamSpeak({ ...f.remote(), codec });
  assert.equal(f.audio.egressDroppedFrames, 6);
  assert.equal(f.packets.length, 0);
});
