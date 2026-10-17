import assert from "node:assert/strict";
import test from "node:test";
import { createSocket } from "node:dgram";
import pino from "pino";
import { RTCPeerConnection, MediaStreamTrack, useOPUS, usePCMU, type RtpPacket } from "werift";
import type { Logger } from "../logger.js";
import { countIceCandidates, pinOpusCodecParameters, WebRtcAudioSession, type WebRtcAudioStats } from "./webrtc-audio.js";

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

interface FixtureSlot {
  track: { stop(): void; writeRtp(packet: RtpPacket): void };
  clientId: number;
  sequenceNumber: number;
  timestamp: number;
  markerPending: boolean;
  lastUsedAt: number;
}

interface FixtureStats {
  webrtcDownlinkForwardedFrames: number;
  webrtcDownlinkDroppedFrames: number;
}

function fixture(overrides: Partial<{ slots: FixtureSlot[] }> = {}) {
  const released: string[] = [];
  const sent: RtpPacket[] = [];
  const makeTrack = (name: string) => ({
    stop(): void { released.push(name); },
    writeRtp(packet: RtpPacket): void { sent.push(packet); },
  });
  const resources = {
    closed: false, closePromise: null,
    onVoiceFrame: () => {},
    onVoiceRoutes: (() => {}) as (slots: readonly number[]) => void,
    slots: overrides.slots ?? [
      { track: makeTrack("slot-0"), clientId: 0, sequenceNumber: 100, timestamp: 5_000, markerPending: true, lastUsedAt: 0 },
      { track: makeTrack("slot-1"), clientId: 0, sequenceNumber: 200, timestamp: 9_000, markerPending: true, lastUsedAt: 0 },
    ] as FixtureSlot[],
    stats: {
      webrtcIngressRtpFrames: 0, webrtcIngressRtpFirstAt: null, webrtcIngressRtpLastAt: null, webrtcIngressRtpMaxGapMs: 0,
      webrtcEgressRtpFrames: 0, webrtcEgressRtpFirstAt: null, webrtcEgressRtpLastAt: null, webrtcEgressRtpMaxGapMs: 0,
      webrtcDownlinkForwardedFrames: 0, webrtcDownlinkDroppedFrames: 0, webrtcActiveSpeakerSlots: 0,
    } as WebRtcAudioStats & FixtureStats,
    peer: { async close() { released.push("peer"); } },
  };
  // Slot and stats state is private on the real class; tests reach it through
  // `resources` while the prototype methods operate on the same object.
  const session = Object.assign(Object.create(WebRtcAudioSession.prototype), resources) as WebRtcAudioSession;
  return { session, resources, released, sent };
}

// A 20 ms SILK WB mono frame (TOC 0x48: config 9, code 0), a 40 ms sibling
// and a 2.5 ms CELT frame exercise the timestamp table.
const VOICE_20MS = Buffer.concat([Buffer.from([0x48]), Buffer.alloc(33, 0x55)]);
const VOICE_40MS = Buffer.concat([Buffer.from([0x50]), Buffer.alloc(60, 0x66)]);
const VOICE_CELT_2_5MS = Buffer.concat([Buffer.from([0x80]), Buffer.alloc(12, 0x77)]);

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

test("a full slot pool evicts the least recently active speaker", () => {
  const routes: number[][] = [];
  const f = fixture();
  (f.session as unknown as { onVoiceRoutes: (slots: readonly number[]) => void }).onVoiceRoutes = slots => routes.push([...slots]);
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS });
  f.session.pushTeamSpeakVoice({ clientId: 9, codec: 4, data: VOICE_20MS });
  f.session.pushTeamSpeakVoice({ clientId: 11, codec: 4, data: VOICE_20MS });
  assert.deepEqual(routes.at(-1), [11, 9], "the oldest slot was reassigned and marked with a fresh marker");
  assert.equal(f.sent[2]!.header.marker, true, "a reassigned stream restarts with a marker");
  assert.notEqual(f.sent[2]!.header.sequenceNumber, 102, "a reassigned stream restarts its sequence space");
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
