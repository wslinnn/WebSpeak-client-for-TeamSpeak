import assert from "node:assert/strict";
import test from "node:test";
import {
  createTimeline,
  noteSkippedPacket,
  placeOnTimeline,
  VID_REBASE_AFTER_REJECTS,
} from "./webrtc-rtp-timeline.js";

// The skipped-packet accounting, exercised as a pure function: only the exact
// counter values the gateway discarded are discounted from a gap, so a pause is
// never reported as loss while real loss — even one buried inside the pause —
// still is.

function place(timeline: ReturnType<typeof createTimeline>, vid: number, whisper = false) {
  const result = placeOnTimeline(timeline, { vid, whisper, continuation: false });
  return result.accepted ? result.advance : null;
}

test("a contiguous counter produces no gap", () => {
  const timeline = createTimeline();
  assert.equal(place(timeline, 100), 1);
  assert.equal(place(timeline, 101), 1);
  assert.equal(place(timeline, 102), 1);
});

test("a plain gap is reported as loss", () => {
  const timeline = createTimeline();
  place(timeline, 100);
  assert.equal(place(timeline, 105), 5, "four packets were lost and must be concealed");
});

test("a pause filled with skipped packets is not reported as loss", () => {
  const timeline = createTimeline();
  place(timeline, 100);
  for (let vid = 101; vid <= 125; vid++) noteSkippedPacket(timeline, vid, false);
  assert.equal(place(timeline, 126), 1, "a 25-packet pause carries no audio to conceal");
});

test("real loss buried inside a paused stretch is still reported", () => {
  // The round-4 §3.1 case: speech, two packets genuinely lost, then the speaker
  // goes quiet (comfort noise) and resumes.
  const timeline = createTimeline();
  place(timeline, 100);
  // 101 and 102 never arrive; 103 and 104 are comfort noise.
  noteSkippedPacket(timeline, 103, false);
  noteSkippedPacket(timeline, 104, false);
  assert.equal(place(timeline, 105), 3, "the two lost speech packets keep their hole");
});

test("a skipped packet overtaking speech does not leave a false hole", () => {
  // The round-4 §3.2 case: comfort noise numbered 105 arrives before the speech
  // it follows. Once the speech catches up, 105 is a packet the timeline no
  // longer owes — it must not be counted as loss.
  const timeline = createTimeline();
  place(timeline, 100);
  noteSkippedPacket(timeline, 105, false);
  for (const vid of [101, 102, 103, 104]) assert.equal(place(timeline, vid), 1);
  assert.equal(place(timeline, 106), 1, "105 was comfort noise, not lost speech");
});

test("a skipped packet behind the speech baseline is ignored", () => {
  const timeline = createTimeline();
  place(timeline, 100);
  place(timeline, 101);
  // A reordered leftover: the voice stream has already covered this value.
  noteSkippedPacket(timeline, 99, false);
  assert.equal(place(timeline, 102), 1);
});

test("whisper and normal voice keep separate skipped accounting", () => {
  const timeline = createTimeline();
  place(timeline, 100);
  // Comfort noise arriving in the whisper counter must not discount a normal
  // voice gap, and vice versa.
  for (let vid = 101; vid <= 110; vid++) noteSkippedPacket(timeline, vid, true);
  assert.equal(place(timeline, 111), 11, "normal-voice loss is not discounted by whisper skips");
});

test("a counter jump beyond the loss window rebases instead of concealing seconds", () => {
  const timeline = createTimeline();
  place(timeline, 100);
  assert.equal(place(timeline, 100 + 200), 1, "a restarted counter is not a 4-second gap");
});

test("a duplicate is rejected and repeated rejects rebase the counter", () => {
  const timeline = createTimeline();
  place(timeline, 100);
  place(timeline, 101);
  assert.equal(place(timeline, 101), null, "a repeat is not forwarded");
  // The counter keeps going backwards: that is a restarted client, not
  // reordering, so after VID_REBASE_AFTER_REJECTS the member is heard again.
  let rebased = false;
  for (let attempt = 0; attempt < VID_REBASE_AFTER_REJECTS; attempt++) {
    if (place(timeline, 50) !== null) { rebased = true; break; }
  }
  assert.equal(rebased, true, "the counter rebases instead of silencing the member");
  assert.equal(place(timeline, 51), 1);
});

test("the skipped set stays bounded however many packets a sender skips", () => {
  const timeline = createTimeline();
  place(timeline, 0);
  for (let vid = 1; vid <= 500; vid++) noteSkippedPacket(timeline, vid, false);
  assert.ok(timeline.skippedVids.size <= 128, `bounded, got ${timeline.skippedVids.size}`);
});

test("without a sender counter the arrival-order timeline keeps working", () => {
  const timeline = createTimeline();
  assert.equal(placeOnTimeline(timeline, { vid: null, whisper: false, continuation: false }).accepted, true);
  assert.equal(timeline.lastVid, null);
  assert.equal(placeOnTimeline(timeline, { vid: null, whisper: false, continuation: false }).accepted, true);
});

test("a continuation frame of an accepted packet adds no gap", () => {
  const timeline = createTimeline();
  place(timeline, 100);
  const continuation = placeOnTimeline(timeline, { vid: 100, whisper: false, continuation: true });
  assert.deepEqual(continuation, { accepted: true, advance: 1 });
});
