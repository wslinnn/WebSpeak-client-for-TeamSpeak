import assert from "node:assert/strict";
import test from "node:test";
import type { TSVoiceData } from "./ts-client.js";
import { fixture } from "./session-audio-fixture.js";

// The WebRTC relay path of the session transport: which frames reach
// pushTeamSpeakVoice, in what order, and what the sink learns about the ones
// that do not (comfort noise still consumes sender sequence numbers; a
// rejected packet's remaining frames must not be forwarded).

test("comfort noise only advances the sender baseline, never the RTP timeline", () => {
  const pushed: TSVoiceData[] = [];
  const silent: TSVoiceData[] = [];
  const f = fixture();
  f.state.peer = {
    pushTeamSpeakVoice: (data: TSVoiceData) => { pushed.push(data); return true; },
    noteSilentTeamSpeakPacket: (data: TSVoiceData) => { silent.push(data); },
  };
  // 3-byte comfort noise and the empty end-of-speech packet are not relayed,
  // but they do consume the speaker's sequence number: the downstream timeline
  // has to learn about them or every pause becomes a loss hole.
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 4, data: Buffer.from([252, 3, 7]), vid: 41 });
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 4, data: Buffer.alloc(0), vid: 42 });
  assert.equal(pushed.length, 0, "nothing is relayed");
  assert.deepEqual(silent.map(item => item.vid), [41, 42], "the baseline follows the silent packets");
});

test("the rest of a rejected multi-frame packet is not forwarded", () => {
  const calls: number[] = [];
  const f = fixture();
  // First frame rejected (duplicate/late), second frame of the same packet must
  // not be forwarded under the same sender sequence.
  f.state.peer = { pushTeamSpeakVoice: (_data: TSVoiceData, index = 0) => { calls.push(index); return index !== 0; } };
  const frame = Buffer.from([0x48, 1, 2, 3]);
  const payload = Buffer.concat([Buffer.from([2]), frame, frame]);
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 4, data: payload, flags: 0x10, vid: 5 });
  assert.deepEqual(calls, [0], "the second frame of a rejected packet is skipped");
  assert.equal(f.audio.egressDroppedFrames, 1);
});

test("an accepted multi-frame packet forwards every frame with its index", () => {
  const calls: number[] = [];
  const f = fixture();
  f.state.peer = { pushTeamSpeakVoice: (_data: TSVoiceData, index = 0) => { calls.push(index); return true; } };
  const frame = Buffer.from([0x48, 1, 2, 3]);
  const payload = Buffer.concat([Buffer.from([2]), frame, frame]);
  f.transport.receiveTeamSpeak({ clientId: 513, codec: 4, data: payload, flags: 0x10, vid: 5 });
  assert.deepEqual(calls, [0, 1]);
  assert.equal(f.audio.egressFrames, 2);
});
