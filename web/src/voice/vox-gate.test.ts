import assert from "node:assert/strict";
import { test } from "vitest";
import { captureFrameEnergy, createVoxGateState, frameEnergy, gateVoiceFrame, resetVoxGate } from "./vox-gate";

const THRESHOLD = 0.008;

function speechFrame(): Float32Array {
  const samples = new Float32Array(960);
  for (let index = 0; index < samples.length; index++) samples[index] = Math.sin(index / 8) * 0.2;
  return samples;
}

test("frame energy covers the whole frame, not just its head", () => {
  // A word that starts after the first 256 samples (5.3 ms) — a plosive's
  // release, or a slow onset — must still count as speech for this frame.
  const samples = new Float32Array(960);
  for (let index = 256; index < samples.length; index++) samples[index] = Math.sin(index / 8) * 0.2;
  const energy = frameEnergy(samples);
  assert.ok(energy > THRESHOLD, `whole-frame energy ${energy} must exceed the threshold`);
  // The old head-only measurement would have missed it entirely.
  assert.equal(frameEnergy(samples.subarray(0, 256)), 0);

  const state = createVoxGateState();
  assert.equal(gateVoiceFrame(state, energy, THRESHOLD, 1), true, "the frame is transmitted");
});

test("a level reported by the capture worklet wins over recomputing it", () => {
  const samples = speechFrame();
  assert.equal(captureFrameEnergy(samples, 0.5), 0.5);
  assert.ok(Math.abs(captureFrameEnergy(samples) - frameEnergy(samples)) < 1e-12);
  // A missing or nonsensical level falls back to the frame itself.
  assert.ok(Math.abs(captureFrameEnergy(samples, Number.NaN) - frameEnergy(samples)) < 1e-12);
  assert.ok(Math.abs(captureFrameEnergy(samples, -1) - frameEnergy(samples)) < 1e-12);
});

test("the threshold is compared against the pre-gain level", () => {
  // The tap sits after the input gain: at 50% the same voice arrives at half
  // the level, and it must still open the gate.
  const state = createVoxGateState();
  assert.equal(gateVoiceFrame(state, 0.2 * 0.5, THRESHOLD, 0.5), true);
  // At 200% the post-gain level doubles and must not make silence speech.
  const quiet = createVoxGateState();
  assert.equal(gateVoiceFrame(quiet, 0.004 * 2, THRESHOLD, 2), false);
  // A zero gain carries no speech at all.
  const muted = createVoxGateState();
  assert.equal(gateVoiceFrame(muted, 0, THRESHOLD, 0), false);
  assert.equal(gateVoiceFrame(muted, 1, THRESHOLD, 0), false);
});

test("the gate holds open across short word gaps and closes after the hold window", () => {
  const state = createVoxGateState();
  assert.equal(gateVoiceFrame(state, 0.2, THRESHOLD, 1), true);
  // 15 silent frames (300 ms) stay open, the 16th closes.
  for (let frame = 0; frame < 15; frame++) assert.equal(gateVoiceFrame(state, 0, THRESHOLD, 1), true, `hold frame ${frame}`);
  assert.equal(gateVoiceFrame(state, 0, THRESHOLD, 1), false);
  // Speech reopens it immediately.
  assert.equal(gateVoiceFrame(state, 0.2, THRESHOLD, 1), true);
  resetVoxGate(state);
  assert.equal(gateVoiceFrame(state, 0, THRESHOLD, 1), false, "a reset drops the hold window");
});
