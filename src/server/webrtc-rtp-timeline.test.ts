import assert from "node:assert/strict";
import test from "node:test";
import {
  createTimeline,
  noteSkippedPacket,
  placeOnTimeline,
  VID_REBASE_AFTER_REJECTS,
} from "./webrtc-rtp-timeline.js";

// The skipped-packet accounting, exercised as a pure function: a pause is
// counted and discounted from the next gap, so it is never reported as loss —
// while real loss in the same stretch still is.

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

test("a pause is not turned into loss at any length", () => {
  // A capped set once made pauses of 129-177 packets emit up to a second of
  // concealment noise, while shorter and longer pauses were fine. A counted
  // pause has no such band.
  const pauses = [1, 25, 50, 125, 128, 129, 150, 170, 177, 178, 200, 400, 1_000];
  for (const pause of pauses) {
    const timeline = createTimeline();
    place(timeline, 100);
    for (let vid = 1; vid <= pause; vid++) noteSkippedPacket(timeline, 100 + vid, false);
    assert.equal(place(timeline, 101 + pause), 1, "pause of " + pause + " packets must not be concealed");
  }
});

test("real loss buried inside a paused stretch is still reported", () => {
  const timeline = createTimeline();
  place(timeline, 100);
  // 101 and 102 never arrive; 103 and 104 are comfort noise.
  noteSkippedPacket(timeline, 103, false);
  noteSkippedPacket(timeline, 104, false);
  assert.equal(place(timeline, 105), 3, "the two lost speech packets keep their hole");
});

test("a real loss inside a very long pause is still reported", () => {
  // Counting must not become "discount everything": the gap is reduced by the
  // skips that fit inside it, so a lost frame keeps its hole even after a
  // multi-second pause.
  const timeline = createTimeline();
  place(timeline, 100);
  for (let vid = 101; vid <= 300; vid++) noteSkippedPacket(timeline, vid, false);
  // 301 and 302 were speech that never arrived; 303 resumes.
  assert.equal(place(timeline, 303), 3, "the two lost speech frames stay visible");
});

test("a skipped packet overtaking speech does not leave a false hole", () => {
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
  noteSkippedPacket(timeline, 99, false);
  assert.equal(place(timeline, 102), 1);
});

test("whisper and normal voice keep separate skipped accounting", () => {
  const timeline = createTimeline();
  place(timeline, 100);
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
  let rebased = false;
  for (let attempt = 0; attempt < VID_REBASE_AFTER_REJECTS; attempt++) {
    if (place(timeline, 50) !== null) { rebased = true; break; }
  }
  assert.equal(rebased, true, "the counter rebases instead of silencing the member");
  assert.equal(place(timeline, 51), 1);
});

test("the reordering window stays bounded however long a sender pauses", () => {
  const timeline = createTimeline();
  place(timeline, 0);
  for (let vid = 1; vid <= 500; vid++) noteSkippedPacket(timeline, vid, false);
  assert.ok(timeline.skippedAhead.size <= 32, "bounded, got " + timeline.skippedAhead.size);
  assert.equal(timeline.skippedSinceAccept, 500, "the count itself is not truncated");
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
