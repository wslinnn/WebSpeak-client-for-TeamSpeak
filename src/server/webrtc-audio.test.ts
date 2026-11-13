import assert from "node:assert/strict";
import test from "node:test";
import { createSocket } from "node:dgram";
import pino from "pino";
import { RTCPeerConnection, MediaStreamTrack, useOPUS, usePCMU, type CandidatePair } from "werift";
import type { Logger } from "../logger.js";
import { countIceCandidates, pinOpusCodecParameters, WebRtcAudioSession } from "./webrtc-audio.js";
import { fixture, VOICE_20MS, VOICE_40MS, VOICE_CELT_2_5MS } from "./webrtc-audio-fixture.js";

function recordingLogger() {
  const warnings: Array<{ payload: Record<string, unknown>; message: string }> = [];
  const logger = {
    debug() {}, info() {},
    warn(payload: Record<string, unknown>, message: string) { warnings.push({ payload, message }); },
    error() {},
    child() { return logger; },
  } as unknown as Logger;
  return { logger, warnings };
}

function sessionOptions(overrides: Partial<ConstructorParameters<typeof WebRtcAudioSession>[0]> = {}) {
  return {
    connectionId: "test",
    logger: pino({ enabled: false }),
    onVoiceFrame() {},
    onVoiceRoutes() {},
    ...overrides,
  };
}

test("configured STUN is actually queried and contributes srflx candidates", async t => {
  const stun = createSocket("udp4");
  await new Promise<void>(resolve => stun.bind(0, "127.0.0.1", resolve));
  t.after(() => stun.close());
  let requests = 0;
  stun.on("message", (request, remote) => {
    if (request.length < 20 || request.readUInt16BE(0) !== 1) return;
    requests++;
    const response = Buffer.alloc(32);
    response.writeUInt16BE(0x0101, 0);
    response.writeUInt16BE(12, 2);
    request.copy(response, 4, 4, 20);
    response.writeUInt16BE(0x0020, 20); // XOR-MAPPED-ADDRESS
    response.writeUInt16BE(8, 22);
    response[25] = 1;
    response.writeUInt16BE(remote.port ^ 0x2112, 26);
    remote.address.split(".").map(Number).forEach((octet, index) => { response[28 + index] = octet ^ request[4 + index]!; });
    stun.send(response, remote.port, remote.address);
  });
  const session = new WebRtcAudioSession(sessionOptions({
    connectionId: "configured-ice",
    stunServer: `stun:127.0.0.1:${stun.address().port}`, ipv6Enabled: true, publicAddresses: ["127.0.0.1"],
  }));
  const source = new RTCPeerConnection({ iceServers: [], codecs: { audio: [useOPUS()] } });
  t.after(async () => { await session.close(); await source.close(); });
  source.addTransceiver("audio", { direction: "sendrecv" });
  const offer = await source.createOffer();
  const answer = await session.createAnswer({ type: "offer", sdp: offer.sdp });
  assert.ok(requests > 0);
  assert.match(answer.sdp, / typ srflx /);
  assert.equal(session.peer.iceTransports[0]!.connection.options.useIpv6, true);
});

test("WebRTC rejects an offer without negotiated audio instead of returning an empty answer", async t => {
  const session = new WebRtcAudioSession(sessionOptions({ connectionId: "invalid-offer" }));
  t.after(() => session.close());
  await assert.rejects(session.createAnswer({ type: "offer", sdp: "invalid sdp" }), /did not negotiate Opus audio/);
});

for (const scenario of ["PCMU only", "Opus only", "PCMU before Opus"] as const) {
  test(`WebRTC negotiates only supported audio with ${scenario}`, async t => {
    const codecs = scenario === "PCMU only" ? [usePCMU()]
      : scenario === "Opus only" ? [useOPUS({ payloadType: 109 })]
      : [usePCMU(), useOPUS({ payloadType: 109 })];
    const source = new RTCPeerConnection({ iceServers: [], codecs: { audio: codecs } });
    const session = new WebRtcAudioSession(sessionOptions({ connectionId: scenario }));
    t.after(async () => { await session.close(); await source.close(); });
    source.addTransceiver("audio", { direction: "sendrecv" });
    const offer = await source.createOffer();
    if (scenario === "PCMU only") {
      await assert.rejects(session.createAnswer({ type: "offer", sdp: offer.sdp }));
      return;
    }
    const answer = await session.createAnswer({ type: "offer", sdp: offer.sdp });
    assert.equal(answer.type, "answer");
    assert.match(answer.sdp, /a=rtpmap:109 opus\/48000\/2/i);
    // The uplink pins travel through the negotiated codec parameters.
    assert.match(answer.sdp, /a=fmtp:109 maxaveragebitrate=60000;usedtx=0/i);
    assert.doesNotMatch(answer.sdp, /PCMU/i);
    const audio = session.peer.getTransceivers().find(transceiver => transceiver.kind === "audio")!;
    assert.deepEqual(audio.codecs.map(codec => codec.payloadType), [109]);
  });
}

test("the answer turns the first audio m-line into the uplink and the rest into a sendonly slot pool", async t => {
  const browser = new RTCPeerConnection({ iceServers: [], codecs: { audio: [useOPUS()] } });
  browser.addTransceiver(new MediaStreamTrack({ kind: "audio" }), { direction: "sendonly" });
  for (let slot = 0; slot < 3; slot++) browser.addTransceiver("audio", { direction: "recvonly" });
  const session = new WebRtcAudioSession(sessionOptions({ connectionId: "slot-pool" }));
  t.after(async () => { await session.close(); await browser.close(); });
  const offer = await browser.createOffer();
  const answer = await session.createAnswer({ type: "offer", sdp: offer.sdp });
  // Split before each m-line: section 0 is the SDP header, 1 the uplink,
  // 2-4 the three slots.
  const sections = answer.sdp.split(/\r\n(?=m=)/);
  assert.equal(sections.length, 5);
  assert.match(sections[1]!, /a=recvonly/, "the uplink m-line receives only");
  for (const slot of sections.slice(2)) {
    assert.match(slot, /a=sendonly/, "each pool m-line sends only");
    assert.match(slot, /a=ssrc:\d+ cname:/, "each pool m-line announces its own sender ssrc");
    assert.match(slot, /a=fmtp:96 maxaveragebitrate=60000;usedtx=0/i, "the uplink pins cover every m-line");
  }
});

test("TeamSpeak frames are relayed byte-identically with rewritten RTP framing", () => {
  const f = fixture();
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_40MS });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 5, data: VOICE_CELT_2_5MS });
  assert.equal(f.sent.length, 3);
  assert.deepEqual(Buffer.from(f.sent[0]!.payload), VOICE_20MS, "payload must pass through untouched");
  assert.equal(f.sent[0]!.header.marker, true, "the first packet of a stream carries the marker");
  assert.equal(f.sent[1]!.header.marker, false);
  const [first, second, third] = f.sent;
  // A freshly assigned slot draws a random sequence/timestamp start; the
  // stream must simply advance continuously from it.
  assert.equal(second!.header.sequenceNumber, (first!.header.sequenceNumber + 1) & 0xffff);
  assert.equal(third!.header.sequenceNumber, (first!.header.sequenceNumber + 2) & 0xffff);
  // A packet's timestamp offset equals the *previous* packet's audio duration.
  assert.equal(second!.header.timestamp, (first!.header.timestamp + 960) >>> 0, "the 20 ms frame advances 20 ms of samples");
  assert.equal(third!.header.timestamp, (second!.header.timestamp + 1_920) >>> 0, "the 40 ms frame advances 40 ms of samples");
  assert.equal(f.resources.slots[0].clientId, 7);
  assert.equal(f.resources.stats.webrtcDownlinkForwardedFrames, 3);
});

test("slot assignment announces routes with free slots as zero", () => {
  const routes: number[][] = [];
  const f = fixture();
  (f.session as unknown as { onVoiceRoutes: (slots: readonly number[]) => void }).onVoiceRoutes = slots => routes.push([...slots]);
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS });
  f.session.pushTeamSpeakVoice({ clientId: 9, codec: 4, data: VOICE_20MS });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS });
  assert.deepEqual(routes, [[7, 0], [7, 9]], "reassignments notify, continued speech does not");
  assert.equal(f.sent[2]!.header.sequenceNumber, (f.sent[0]!.header.sequenceNumber + 1) & 0xffff,
    "an already-bound speaker continues its stream without restarting");
});

test("a departed speaker releases its downstream slot", () => {
  const routes: number[][] = [];
  const f = fixture();
  (f.session as unknown as { onVoiceRoutes: (slots: readonly number[]) => void }).onVoiceRoutes = slots => routes.push([...slots]);
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS });
  f.session.pushTeamSpeakVoice({ clientId: 9, codec: 4, data: VOICE_20MS });
  f.session.releaseClient(7);
  assert.deepEqual(routes, [[7, 0], [7, 9], [0, 9]], "the announced table must stop naming a client that left");
  assert.equal(f.resources.slots[0].clientId, 0);
  assert.equal(f.session.getStats().webrtcActiveSpeakerSlots, 1);
  // 未绑定的 client 不触发多余广播。
  f.session.releaseClient(7);
  assert.equal(routes.length, 3);
  // 槽位保持可用：新说话者接管同一槽位，并以标记位重开时间线。
  f.session.pushTeamSpeakVoice({ clientId: 11, codec: 4, data: VOICE_20MS });
  assert.equal(f.resources.slots[0].clientId, 11);
  assert.equal(f.sent.at(-1)!.header.marker, true);
});

test("a full slot pool keeps its speakers and drops the newcomer while they are active", () => {
  const routes: number[][] = [];
  const f = fixture();
  (f.session as unknown as { onVoiceRoutes: (slots: readonly number[]) => void }).onVoiceRoutes = slots => routes.push([...slots]);
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS });
  f.session.pushTeamSpeakVoice({ clientId: 9, codec: 4, data: VOICE_20MS });
  // Both slots were just used; a third speaker must not evict either of them.
  for (let frame = 0; frame < 5; frame++) f.session.pushTeamSpeakVoice({ clientId: 11, codec: 4, data: VOICE_20MS });
  assert.equal(routes.length, 2, "an active pool must not re-broadcast the route table per frame");
  assert.equal(f.resources.stats.webrtcDownlinkDroppedFrames, 5, "the newcomer's frames are dropped instead");
  assert.deepEqual(f.resources.slots.map(slot => slot.clientId), [7, 9], "the established speakers keep their slots");
});

test("a slot whose speaker has been silent for the hysteresis window is preempted", () => {
  const routes: number[][] = [];
  const f = fixture();
  (f.session as unknown as { onVoiceRoutes: (slots: readonly number[]) => void }).onVoiceRoutes = slots => routes.push([...slots]);
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS });
  f.session.pushTeamSpeakVoice({ clientId: 9, codec: 4, data: VOICE_20MS });
  const firstSeq = f.sent[0]!.header.sequenceNumber;
  const firstTimestamp = f.sent[0]!.header.timestamp;
  // Speaker 7 stopped talking 5 s ago; speaker 9 is still transmitting.
  f.resources.slots[0].lastUsedAt = performance.now() - 5_000;
  f.session.pushTeamSpeakVoice({ clientId: 11, codec: 4, data: VOICE_20MS });
  assert.deepEqual(routes.at(-1), [11, 9], "the idle slot was reassigned to the newcomer");
  assert.equal(f.resources.slots[0].clientId, 11);
  const reassigned = f.sent.at(-1)!;
  assert.equal(reassigned.header.marker, true, "a reassigned stream starts a new talk spurt");
  // Same SSRC, same timeline: the hand-over continues the slot's sequence and
  // timestamp space instead of drawing new random ones.
  assert.equal(reassigned.header.sequenceNumber, (firstSeq + 1) & 0xffff, "the sequence continues across the hand-over");
  assert.equal(reassigned.header.timestamp, (firstTimestamp + 960) >>> 0, "the timestamp continues across the hand-over");
});

test("unforwardable frames are counted and dropped without touching the slots", () => {
  const f = fixture();
  // Legacy codecs (anything but the two Opus variants) are silently ignored —
  // old TeamSpeak clients may still send them.
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 0, data: VOICE_20MS });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: Buffer.alloc(0) });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: Buffer.from([0x48]) });
  assert.equal(f.sent.length, 0);
  assert.equal(f.resources.stats.webrtcDownlinkDroppedFrames, 2);
});

test("a session without downstream slots drops downstream audio instead of crashing", () => {
  const f = fixture({ slots: [] });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS });
  assert.equal(f.sent.length, 0);
  assert.equal(f.resources.stats.webrtcDownlinkDroppedFrames, 1);
});

test("WebRTC close releases slot tracks and the peer after track failures", async () => {
  const f = fixture();
  f.resources.slots[0].track.stop = () => { f.released.push("slot-0"); throw new Error("Track failed"); };
  await f.session.close();
  await f.session.close();
  assert.deepEqual(f.released, ["slot-0", "slot-1", "peer"]);
  assert.equal(f.resources.slots.length, 0);
});

test("concurrent WebRTC close callers await the same pending peer shutdown", async () => {
  const f = fixture();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let closes = 0;
  f.resources.peer.close = async () => { closes++; await pending; };
  const first = f.session.close();
  let secondCompleted = false;
  const second = f.session.close().then(() => { secondCompleted = true; });
  await Promise.resolve();
  const completedEarly = secondCompleted;
  release();
  await Promise.all([first, second]);
  assert.equal(completedEarly, false);
  assert.equal(closes, 1);
});

test("a rejected peer shutdown is shared without repeating partial cleanup", async () => {
  const f = fixture();
  const failure = new Error("Peer shutdown failed");
  f.resources.slots[0].track.stop = () => {};
  f.resources.slots[1].track.stop = () => {};
  f.resources.peer.close = async () => { f.released.push("peer"); throw failure; };
  const first = f.session.close();
  const second = f.session.close();
  assert.equal(first, second);
  await assert.rejects(first, error => error === failure);
  await assert.rejects(second, error => error === failure);
  await assert.rejects(f.session.close(), error => error === failure);
  assert.deepEqual(f.released, ["peer"]);
});

test("a failing uplink setup closes the half-built peer before the constructor throws", () => {
  // The constructor never returns when a post-creation step fails, so the
  // caller's `peer?.close()` is a no-op. Instrument the prototype to observe
  // that the rollback happens inside the constructor instead. Count distinct
  // peers: werift re-enters close() on the same instance while tearing down.
  const originalAddTransceiver = RTCPeerConnection.prototype.addTransceiver;
  const originalClose = RTCPeerConnection.prototype.close;
  const closedPeers = new Set<RTCPeerConnection>();
  const setupFailure = new Error("Uplink transceiver unavailable");
  RTCPeerConnection.prototype.addTransceiver = function patchedAddTransceiver(): never {
    throw setupFailure;
  };
  RTCPeerConnection.prototype.close = function patchedClose(this: RTCPeerConnection): Promise<void> {
    closedPeers.add(this);
    return originalClose.call(this);
  };
  try {
    assert.throws(
      () => new WebRtcAudioSession(sessionOptions({ connectionId: "uplink-failure" })),
      error => error === setupFailure,
    );
  } finally {
    RTCPeerConnection.prototype.addTransceiver = originalAddTransceiver;
    RTCPeerConnection.prototype.close = originalClose;
  }
  assert.equal(closedPeers.size, 1, "the constructor must roll back the peer it already created");
});

test("codec parameter pinning merges browser parameters and overrides conflicting pins", () => {
  assert.equal(pinOpusCodecParameters("minptime=10;useinbandfec=1;maxaveragebitrate=32000;usedtx=1"), "minptime=10;useinbandfec=1;maxaveragebitrate=60000;usedtx=0");
  assert.equal(pinOpusCodecParameters(undefined), "maxaveragebitrate=60000;usedtx=0");
  assert.equal(pinOpusCodecParameters(""), "maxaveragebitrate=60000;usedtx=0");
});

test("countIceCandidates reads a=candidate lines regardless of line endings", () => {
  const sdp = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=candidate:1 1 UDP 2122252543 192.168.1.10 40000 typ host\r\na=candidate:2 1 UDP 2122252543 127.0.0.1 40001 typ host\r\n";
  assert.equal(countIceCandidates(sdp), 2);
  assert.equal(countIceCandidates("v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"), 0);
});

test("an answer without ICE candidates raises a warning naming the port range", async t => {
  const { logger, warnings } = recordingLogger();
  const session = new WebRtcAudioSession(sessionOptions({ connectionId: "no-candidates", logger, udpPortRange: [40000, 41999] }));
  const source = new RTCPeerConnection({ iceServers: [], codecs: { audio: [useOPUS()] } });
  t.after(async () => { await session.close(); await source.close(); });
  source.addTransceiver("audio", { direction: "sendrecv" });
  const offer = await source.createOffer();
  // 模拟「每块地址都拿不到端口」：werift 的收集失败被逐地址吞掉后，answer 没有任何候选。
  Object.defineProperty(session.peer, "localDescription", {
    value: { type: "answer", sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" },
    configurable: true,
  });
  try {
    const answer = await session.createAnswer({ type: "offer", sdp: offer.sdp });
    assert.equal(countIceCandidates(answer.sdp), 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!.message, /no ICE candidates/);
    assert.deepEqual(warnings[0]!.payload.portRange, [40000, 41999]);
  } finally {
    delete (session.peer as unknown as Record<string, unknown>).localDescription;
  }
});

test("a normally negotiated answer carries ICE candidates and does not warn", async t => {
  const { logger, warnings } = recordingLogger();
  const session = new WebRtcAudioSession(sessionOptions({ connectionId: "normal", logger }));
  const source = new RTCPeerConnection({ iceServers: [], codecs: { audio: [useOPUS()] } });
  t.after(async () => { await session.close(); await source.close(); });
  source.addTransceiver("audio", { direction: "sendrecv" });
  const offer = await source.createOffer();
  const answer = await session.createAnswer({ type: "offer", sdp: offer.sdp });
  assert.ok(countIceCandidates(answer.sdp) > 0);
  assert.equal(warnings.length, 0);
});

test("the peer wires the remote candidate policy and probe primitives are refused", async t => {
  const session = new WebRtcAudioSession(sessionOptions({ connectionId: "policy" }));
  t.after(() => session.close());
  const filter = session.peer.config.iceFilterCandidatePair;
  assert.ok(filter, "iceFilterCandidatePair must be configured");
  const pairOf = (host: string, port: number) => ({ remoteCandidate: { host, port } } as CandidatePair);
  assert.equal(filter(pairOf("192.168.1.10", 40000)), true, "LAN host candidates stay usable");
  assert.equal(filter(pairOf("127.0.0.1", 5900)), false, "loopback is never probed");
  assert.equal(filter(pairOf("169.254.169.254", 80)), false, "cloud metadata is never probed");
  assert.equal(filter(pairOf("relay.attacker.example", 5353)), false, "hostnames are never resolved");

  const stunFilter = session.peer.config.iceFilterStunResponse as
    | ((message: { attributesKeys: string[] }) => boolean)
    | undefined;
  assert.ok(stunFilter, "iceFilterStunResponse must be configured");
  assert.equal(stunFilter({ attributesKeys: ["USERNAME", "MESSAGE-INTEGRITY"] }), true, "legit connectivity checks are answered");
  assert.equal(stunFilter({ attributesKeys: [] }), false, "unsigned probes get no signed response");
});

test("an offer with policy-rejected candidates logs one warning with samples", async t => {
  const { logger, warnings } = recordingLogger();
  const session = new WebRtcAudioSession(sessionOptions({ connectionId: "policy-warn", logger }));
  const source = new RTCPeerConnection({ iceServers: [], codecs: { audio: [useOPUS()] } });
  t.after(async () => { await session.close(); await source.close(); });
  source.addTransceiver("audio", { direction: "sendrecv" });
  const offer = await source.createOffer();
  const sdp = `${offer.sdp}a=candidate:probe 1 udp 2130706431 127.0.0.1 5900 typ host\r\n`;
  const answer = await session.createAnswer({ type: "offer", sdp });
  assert.ok(countIceCandidates(answer.sdp) > 0, "the legit candidates still produce a working answer");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!.message, /address policy/);
  assert.deepEqual(warnings[0]!.payload.samples, ["127.0.0.1"]);
});
