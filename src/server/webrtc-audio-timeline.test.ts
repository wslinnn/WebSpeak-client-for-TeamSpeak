import assert from "node:assert/strict";
import test from "node:test";
import { fixture, VOICE_20MS } from "./webrtc-audio-fixture.js";

// The downstream RTP timeline follows the speaker's own TeamSpeak packet
// counter (VId): loss, reordering and duplicates must stay visible to the
// browser instead of being flattened into a continuous stream, and a slot
// hand-over must never restart the sequence space of an SSRC.

test("a sender-sequence gap leaves a hole in the sequence space and pushes the timestamp", () => {
  const f = fixture();
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 100 });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 101 });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 104 });
  const [first, second, third] = f.sent;
  assert.equal(second!.header.sequenceNumber, (first!.header.sequenceNumber + 1) & 0xffff);
  // Three packets were lost; the receiver must see the gap, not a compressed
  // timeline that plays the remaining speech slightly fast.
  assert.equal(third!.header.sequenceNumber, (second!.header.sequenceNumber + 3) & 0xffff);
  assert.equal(third!.header.timestamp, (second!.header.timestamp + 3 * 960) >>> 0);
  assert.equal(f.resources.stats.webrtcDownlinkForwardedFrames, 3);
});

test("duplicate and late reordered sender sequences are dropped", () => {
  const f = fixture();
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 100 });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 102 });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 102 });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 101 });
  assert.equal(f.sent.length, 2, "the duplicate and the late packet are not forwarded");
  assert.equal(f.resources.stats.webrtcDownlinkDroppedFrames, 2);
});

test("a sender that restarts its counter is rebased instead of silenced", () => {
  const f = fixture();
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 4_000 });
  for (let frame = 0; frame < 10; frame++) f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: frame });
  // Ten backwards frames is not reordering; after the rebase the speaker is
  // heard again on a continuous timeline.
  const forwarded = f.sent.length;
  assert.equal(forwarded, 2, "only the first packet and the rebase frame are forwarded");
  assert.equal(f.sent.at(-1)!.header.sequenceNumber, (f.sent[0]!.header.sequenceNumber + 1) & 0xffff);
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 10 });
  assert.equal(f.sent.length, 3, "the rebased counter continues normally");
});

test("a counter restart with an implausible forward jump is rebased without a giant gap", () => {
  const f = fixture();
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 10 });
  // 990 packets would be a 20 s outage: this is a restarted counter, so the
  // gateway rebases instead of emitting a hole the receiver cannot conceal.
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 1_000 });
  assert.equal(f.sent[1]!.header.sequenceNumber, (f.sent[0]!.header.sequenceNumber + 1) & 0xffff);
  assert.equal(f.sent[1]!.header.timestamp, (f.sent[0]!.header.timestamp + 960) >>> 0);
});

test("several Opus frames of one sender packet do not look like a gap", () => {
  const f = fixture();
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 200 });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 200 }, 1);
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 201 });
  assert.deepEqual(f.sent.map(packet => packet.header.sequenceNumber),
    [f.sent[0]!.header.sequenceNumber, (f.sent[0]!.header.sequenceNumber + 1) & 0xffff, (f.sent[0]!.header.sequenceNumber + 2) & 0xffff]);
});

test("whisper and normal voice counters do not create gaps when they interleave", () => {
  const f = fixture();
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 30 });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 900, isWhisper: true });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 31 });
  assert.deepEqual(f.sent.map(packet => packet.header.sequenceNumber),
    [f.sent[0]!.header.sequenceNumber, (f.sent[0]!.header.sequenceNumber + 1) & 0xffff, (f.sent[0]!.header.sequenceNumber + 2) & 0xffff],
    "each counter switch is a new segment, never a 870-packet hole");
});


test("a pause filled with comfort noise is not turned into a loss hole", () => {
  const f = fixture();
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 0 });
  // TeamSpeak keeps numbering its packets through a pause (comfort noise and
  // the end-of-speech packet); the gateway filters those out, so those 25
  // counter values carry no audio at all. They are recorded as a silent span
  // and subtracted from the next gap: the receiver sees contiguous audio rather
  // than being asked to conceal half a second of noise, and a real loss inside
  // the same gap is still reported.
  for (let vid = 1; vid <= 25; vid++) {
    f.session.noteSilentTeamSpeakPacket({ clientId: 7, codec: 4, data: Buffer.from([252, 3, 7]), vid });
  }
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 26 });
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[1]!.header.sequenceNumber, (f.sent[0]!.header.sequenceNumber + 1) & 0xffff);
  assert.equal(f.sent[1]!.header.timestamp, (f.sent[0]!.header.timestamp + 960) >>> 0);
});

test("comfort noise from a speaker without a slot does not take one", () => {
  const f = fixture();
  f.session.noteSilentTeamSpeakPacket({ clientId: 7, codec: 4, data: Buffer.from([252, 3, 7]), vid: 3 });
  assert.deepEqual(f.resources.slots.map(slot => slot.clientId), [0, 0], "silence must not claim a downstream slot");
  assert.equal(f.resources.stats.webrtcDownlinkDroppedFrames, 0);
});

test("a late comfort-noise packet does not drag the baseline back", () => {
  const f = fixture();
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 100 });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 101 });
  // Comfort noise shares the UDP path with speech: a reordered 99 arrives after
  // 100/101. Letting it overwrite the baseline made the next real frame look
  // like a three-packet gap and inserted two frames of concealment.
  f.session.noteSilentTeamSpeakPacket({ clientId: 7, codec: 4, data: Buffer.from([252, 3, 7]), vid: 99 });
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 102 });
  assert.equal(f.sent.length, 3);
  assert.equal(f.sent[2]!.header.sequenceNumber, (f.sent[1]!.header.sequenceNumber + 1) & 0xffff);
  assert.equal(f.sent[2]!.header.timestamp, (f.sent[1]!.header.timestamp + 960) >>> 0);
});

test("an early comfort-noise packet does not swallow the speech still in flight", () => {
  const f = fixture();
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 100 });
  // A comfort-noise packet numbered ahead of the speech still on its way must
  // not push the baseline past it, or the late speech reads as duplicates and
  // is dropped (up to 80 ms of lost audio).
  f.session.noteSilentTeamSpeakPacket({ clientId: 7, codec: 4, data: Buffer.from([252, 3, 7]), vid: 105 });
  for (const vid of [101, 102, 103, 104]) {
    f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid });
  }
  assert.equal(f.sent.length, 5, "every speech frame is still relayed");
  assert.deepEqual(
    f.sent.slice(1).map(packet => packet.header.sequenceNumber),
    [101, 102, 103, 104].map((_, index) => (f.sent[0]!.header.sequenceNumber + 1 + index) & 0xffff),
    "the timeline stays continuous",
  );
});

test("a real loss inside a silent span is still reported as a hole", () => {
  const f = fixture();
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 100 });
  // Ten comfort-noise packets, then a speech frame that is three counter steps
  // beyond them: the pause is subtracted, the three-frame loss is not.
  for (let vid = 101; vid <= 110; vid++) {
    f.session.noteSilentTeamSpeakPacket({ clientId: 7, codec: 4, data: Buffer.from([252, 3, 7]), vid });
  }
  f.session.pushTeamSpeakVoice({ clientId: 7, codec: 4, data: VOICE_20MS, vid: 114 });
  assert.equal(f.sent.length, 2);
  // 1 speech packet + 10 silent + 3 lost = advance 14, minus the 10 silent.
  assert.equal(f.sent[1]!.header.sequenceNumber, (f.sent[0]!.header.sequenceNumber + 4) & 0xffff,
    "the pause is hidden, the real loss is not");
  assert.equal(f.sent[1]!.header.timestamp, (f.sent[0]!.header.timestamp + 4 * 960) >>> 0);
});
