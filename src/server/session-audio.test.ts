import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./session-audio-fixture.js";
import type { TSVoiceData } from "./ts-client.js";

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

test("the ingress token bucket drops burst overflow and closes only absurd floods", () => {
  const f = fixture();
  // The fixture clock advances on every encode; pin it so the bucket is only
  // refilled by explicit time jumps. The stand-in still records frames.
  f.encoder.encode = (frame) => { f.encoded.push(frame); return Buffer.from([9]); };
  // 设计码率 50 Hz，预算 400/s（8 倍余量）：整个突发放行。
  for (let i = 0; i < 400; i++) f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(f.encoded.length, 400);
  // Same-instant overflow only drops: TCP catch-up bursts must not close a
  // session that was merely slow for a moment.
  for (let i = 0; i < 100; i++) f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(f.encoded.length, 400);
  assert.equal(f.audio.ingressDroppedFrames, 100);
  assert.equal(f.closes.length, 0);
  // Time passes, the bucket refills to full again.
  f.state.now = 5_000;
  for (let i = 0; i < 400; i++) f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(f.encoded.length, 800);
  // Only a burst far beyond any audio pattern (600 back-to-back drops,
  // FRAME_FLOOD_CLOSE_DROPS) closes the session.
  for (let i = 0; i < 600; i++) f.transport.receivePcm(Buffer.alloc(1_920));
  assert.deepEqual(f.closes, [{ code: 1008, reason: "AUDIO_FRAME_RATE_LIMITED" }]);
});

test("a browser using 10 ms frames (100 pps) never touches the ingress budget", () => {
  const f = fixture();
  f.encoder.encode = (frame) => { f.encoded.push(frame); return Buffer.from([9]); };
  // 10 ms ptime = 100 帧/秒，是旧预算（100/s）的临界值：抖动会丢帧。新预算下
  // 连续 10 秒的 10 ms 帧全部放行，且没有任何丢弃。
  for (let index = 0; index < 1_000; index++) { f.state.now += 10; f.transport.receivePcm(Buffer.alloc(1_920)); }
  assert.equal(f.encoded.length, 1_000);
  assert.equal(f.audio.ingressDroppedFrames, 0);
  assert.equal(f.closes.length, 0);
});

test("sustained overload is capped and reported, never disconnected", () => {
  const f = fixture();
  f.encoder.encode = (frame) => { f.encoded.push(frame); return Buffer.from([9]); };
  // 500 帧/秒持续 10 秒（5000 帧）：可放行 = 回填 400×10 + 突发 400 = 4400，其余
  // 丢弃，且**不断连**。成功帧会重置洪泛窗口，所以累计丢弃即使超过 600 也不会
  // 触发关闭——「持续超预算即断开」从来不是本实现的语义，关闭只留给「没有任何
  // 成功帧插进来的瞬时爆发」。
  for (let frame = 0; frame < 5_000; frame++) { f.state.now += 2; f.transport.receivePcm(Buffer.alloc(1_920)); }
  assert.equal(f.closes.length, 0, "持续超预算只丢帧，不断连");
  assert.ok(f.audio.ingressDroppedFrames >= 500, `drops accumulate, got ${f.audio.ingressDroppedFrames}`);
  assert.ok(f.encoded.length >= 4_000, `the cap still forwards the budgeted share, got ${f.encoded.length}`);
  // 诊断留痕：一分钟窗口内一条告警，带丢弃数，运维能区分「网关在丢上行」与
  // 「TS 侧听不到」。
  const throttled = f.warnings.filter(warning => warning.code === "AUDIO_INGRESS_THROTTLED");
  assert.equal(throttled.length, 1);
  assert.ok(Number(throttled[0]!.droppedFrames) >= 100);
});

test("WebRTC ingress shares the frame budget instead of letting RTP bypass it", () => {
  const f = fixture();
  // codec 5（伴奏混音）不经过静音门控，直接把每条上行包计入转发，便于观察预算。
  const frame = Buffer.from([5, 9]);
  for (let i = 0; i < 400; i++) f.transport.receiveWebRtc(frame, 5);
  assert.equal(f.forwarded.length, 400, "满突发（8x 设计码率）全部放行");
  // 同一瞬间的溢出只丢包：真实浏览器 UDP 抖动不该直接拆会话。
  for (let i = 0; i < 100; i++) f.transport.receiveWebRtc(frame, 5);
  assert.equal(f.forwarded.length, 400);
  assert.equal(f.audio.ingressDroppedFrames, 100);
  assert.equal(f.audio.tsSendFrames, 400);
  assert.equal(f.closes.length, 0);
  // 远超音频形态的突发（1 秒窗口内 600 次丢弃）与兼容路径同样关闭会话。窗口
  // 跨过阈值后每个后续丢弃仍会再发一次 close（socket 已关闭时抛错被吞）。
  for (let i = 0; i < 600; i++) f.transport.receiveWebRtc(frame, 5);
  assert.ok(f.closes.length >= 1);
  assert.deepEqual(f.closes[0], { code: 1008, reason: "AUDIO_FRAME_RATE_LIMITED" });
  // 真实 50 Hz 上行不受预算影响：时间推进后照常放行。
  f.state.now = 5_000;
  for (let i = 0; i < 50; i++) { f.transport.receiveWebRtc(frame, 5); f.state.now += 20; }
  assert.equal(f.forwarded.length, 450);
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

test("the trailer byte is stripped before the comfort-noise filter", () => {
  const pushed: TSVoiceData[] = [];
  const f = fixture();
  f.state.peer = { pushTeamSpeakVoice: (data: TSVoiceData) => { pushed.push(data); } };
  // 3 字节舒适噪声 + 尾字节：不剥离会以 4 字节逃逸 ≤3 字节过滤。
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 4, data: Buffer.from([252, 3, 7, 30]), flags: 0x40 });
  assert.equal(pushed.length, 0);
  assert.equal(f.audio.egressDroppedFrames, 1);
  // 真实帧 + 尾字节：尾字节不进入转发载荷。
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 4, data: Buffer.from([11, 12, 13, 14, 30]), flags: 0x40 });
  assert.equal(pushed.length, 1);
  assert.deepEqual([...pushed[0]!.data], [11, 12, 13, 14]);
});

test("nvp frames split into independent downlink packets", () => {
  const f = fixture();
  f.transport.receiveTeamSpeak({
    clientId: 513, codec: 4, data: Buffer.from([2, 11, 12, 13, 14, 15, 21, 22, 23, 24, 25]), flags: 0x10,
  });
  assert.equal(f.packets.length, 2);
  assert.deepEqual([...f.packets[0]!], [4, 2, 1, 11, 12, 13, 14, 15]);
  assert.deepEqual([...f.packets[1]!], [4, 2, 1, 21, 22, 23, 24, 25]);
  assert.equal(f.audio.egressFrames, 2);
  assert.deepEqual(f.audio.egressFramesByClient, { "513": 2 });
  // WebRTC 路径同样逐帧推送；扩展字节与尾字节组合时先剥尾字节再拆帧。
  const pushed: TSVoiceData[] = [];
  f.state.peer = { pushTeamSpeakVoice: (data: TSVoiceData) => { pushed.push(data); } };
  f.transport.receiveTeamSpeak({
    clientId: 513, codec: 4, data: Buffer.from([2, 31, 32, 33, 34, 35, 41, 42, 43, 44, 45, 30]), flags: 0x10 | 0x40,
  });
  assert.deepEqual(pushed.map(item => [...item.data]), [[31, 32, 33, 34, 35], [41, 42, 43, 44, 45]]);
  assert.equal(f.audio.egressFrames, 4);
});

test("malformed nvp payloads are dropped without forwarding", () => {
  const f = fixture();
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 4, data: Buffer.from([0, 11, 12]), flags: 0x10 });
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 4, data: Buffer.from([3, 11, 12, 13, 14]), flags: 0x10 });
  assert.equal(f.packets.length, 0);
  assert.equal(f.audio.egressDroppedFrames, 2);
});

test("uplink silence gate drops near-silent frames after the release window and passes speech", () => {
  // 解码桩：帧首字节 1 = 语音（rms≈0.09），否则为数字静音（rms=0）。
  const voicePcm = Buffer.from(Int16Array.from({ length: 960 }, () => 3000).buffer);
  const decoder = { decode: (frame: Buffer) => (frame[0] === 1 ? voicePcm : Buffer.alloc(1_920)) };
  const f = fixture(() => decoder);
  // 静音帧：释放窗未武装 → 直接拦截（门控从未打开，无停止标记）。
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
  // 窗外静音帧拦截，并在此边沿发一帧空 payload 停止标记（官方 D10 行为）。
  f.state.now += 1_000;
  f.transport.receiveWebRtc(silence, 4);
  assert.equal(f.forwarded.length, 3);
  assert.deepEqual([...f.forwarded[2]!.data], []);
  assert.equal(f.forwarded[2]!.codec, 4);
  assert.equal(f.audio.egressDroppedFrames, 2);
  // 静默期后续帧不再重复发停止标记。
  f.transport.receiveWebRtc(silence, 4);
  assert.equal(f.forwarded.length, 3);
  assert.equal(f.audio.egressDroppedFrames, 3);
  // codec 5（伴奏混音）永不门控。
  f.transport.receiveWebRtc(Buffer.from([5, 9]), 5);
  assert.equal(f.forwarded.length, 4);
});

test("the stop marker follows the active whisper route", () => {
  const voicePcm = Buffer.from(Int16Array.from({ length: 960 }, () => 3000).buffer);
  const decoder = { decode: (frame: Buffer) => (frame[0] === 1 ? voicePcm : Buffer.alloc(1_920)) };
  const f = fixture(() => decoder);
  f.transport.receiveWebRtc(Buffer.from([1, 9]), 4);
  assert.equal(f.forwarded.length, 1);
  f.state.targets = [7, 8];
  f.state.now += 1_000;
  f.transport.receiveWebRtc(Buffer.from([2, 9]), 4);
  assert.equal(f.forwarded.length, 2);
  assert.deepEqual(f.forwarded[1], { data: Buffer.alloc(0), codec: 4, targets: [7, 8] });
});

test("the uplink silence-gate decoder is allocated on the first WebRTC frame only", () => {
  let created = 0;
  const decoder = { decode: () => Buffer.alloc(1_920) };
  const f = fixture(() => { created += 1; return decoder; });
  // 兼容（WebSocket）路径从不做上行门控：编码 PCM 帧不该为它分配原生 Opus 解码器。
  f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(created, 0);
  assert.equal(f.audio.ingressFrames, 1);
  // 首个 WebRTC 语音帧才创建，之后复用同一个实例。
  f.transport.receiveWebRtc(Buffer.from([2, 9]), 4);
  assert.equal(created, 1);
  f.transport.receiveWebRtc(Buffer.from([2, 9]), 4);
  assert.equal(created, 1);
  // 工厂抛错时门控 fail-open（放行），不打断语音。
  const broken = fixture(() => { throw new Error("native opus unavailable"); });
  broken.transport.receiveWebRtc(Buffer.from([2, 9]), 4);
  assert.equal(broken.forwarded.length, 1);
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

test("non-Opus channel codecs are dropped and reported once per session", () => {
  const f = fixture();
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 3, data: Buffer.from([11, 12, 13, 14]) });
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 0, data: Buffer.from([11, 12, 13, 14]) });
  assert.equal(f.packets.length, 0);
  assert.equal(f.audio.egressDroppedFrames, 2);
  assert.equal(f.notices.length, 1);
  assert.deepEqual(f.notices[0], { type: "audioError", code: "UNSUPPORTED_CHANNEL_CODEC", detail: "当前频道编码不是 Opus" });
  assert.deepEqual(f.warnings, [{ code: "UNSUPPORTED_CHANNEL_CODEC", codec: 3 }]);
  // Opus 语音（4/5）不受影响，后续非 Opus 包也不再上报。
  f.transport.receiveTeamSpeak(f.remote());
  assert.equal(f.packets.length, 1);
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 1, data: Buffer.from([11, 12, 13, 14]) });
  assert.equal(f.notices.length, 1);
});

test("invalid SDK speaker IDs and codecs cannot throw while packing the header", () => {
  const f = fixture();
  for (const clientId of [-1, 65_536, NaN]) f.transport.receiveTeamSpeak(f.remote(clientId));
  for (const codec of [-1, 256, NaN]) f.transport.receiveTeamSpeak({ ...f.remote(), codec });
  assert.equal(f.audio.egressDroppedFrames, 6);
  assert.equal(f.packets.length, 0);
});

test("a WebRTC voice session without a live peer drops TS audio instead of leaking onto the WS downlink", () => {
  const f = fixture();
  f.state.webRtcVoice = true;
  f.transport.receiveTeamSpeak(f.remote());
  assert.equal(f.packets.length, 0);
  assert.equal(f.audio.egressDroppedFrames, 1);
  assert.equal(f.audio.egressFrames, 0);
  // 协商完成（peer 就位）后同一路径立即走 RTP，互斥但不缺流。
  const pushed: Buffer[] = [];
  f.state.peer = { pushTeamSpeakVoice: (data: TSVoiceData) => { pushed.push(data.data); } };
  f.transport.receiveTeamSpeak(f.remote());
  assert.equal(pushed.length, 1);
  assert.equal(f.audio.egressFrames, 1);
});

test("a WebRTC voice session discards WS uplink frames even before its peer exists", () => {
  const f = fixture();
  f.state.webRtcVoice = true;
  f.transport.receivePcm(Buffer.alloc(1_920));
  assert.equal(f.forwarded.length, 0);
  assert.equal(f.audio.ingressDroppedFrames, 1);
  assert.equal(f.audio.ingressFrames, 0);
});
