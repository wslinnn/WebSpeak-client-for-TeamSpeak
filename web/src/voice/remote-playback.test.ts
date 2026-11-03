// @vitest-environment node
// Focused contract tests for the compatibility-path playback scheduler: the
// TS6-style static watermark (overflow drops the late frame, 300 ms backlog
// keeps the reset as a safety net) and the talk-spike pre-roll.
import { afterEach, beforeEach, test, vi } from "vitest";
import assert from "node:assert/strict";
import { createRemotePlayback } from "./remote-playback";
import { AudioContextStub, AudioDecoderStub, decodedChunk, installVoiceStubs, uninstallVoiceStubs } from "../test/voice-test-stubs";

let context: AudioContextStub;
let playback: ReturnType<typeof createRemotePlayback>;
let dropped: number;
let decodeErrors: number;

beforeEach(() => {
  installVoiceStubs();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  context = new AudioContextStub();
  dropped = 0;
  decodeErrors = 0;
  playback = createRemotePlayback({
    getContext: () => context as unknown as AudioContext,
    getVolume: () => 1,
    onDecodeError: () => { decodeErrors++; },
    onDrop: () => { dropped++; },
  });
});

afterEach(() => {
  playback.clearAll();
  vi.useRealTimers();
  uninstallVoiceStubs();
});

function feedFrame(clientId = 7): void {
  playback.play(clientId, new Uint8Array([1, 2, 3, 4]), 4);
}

function output(decoder: AudioDecoderStub): void {
  (decoder.callbacks as { output: (chunk: unknown) => void }).output(decodedChunk());
}

test("the pre-roll holds the first frame and starts both frames once the queue reaches two", () => {
  feedFrame();
  output(AudioDecoderStub.instances[0]!);
  assert.equal(AudioContextStub.sources.length, 0, "a lone first frame must not start playback");
  feedFrame();
  output(AudioDecoderStub.instances[0]!);
  assert.deepEqual(AudioContextStub.sources.map(source => source.startedAt), [0, 0.02]);
  vi.advanceTimersByTime(60);
  assert.equal(AudioContextStub.sources.length, 2, "the prime wait timer must be cancelled on fulfilment");
  assert.equal(decodeErrors, 0);
});

test("the pre-roll wait budget starts a lone first frame after 60 ms", () => {
  feedFrame();
  output(AudioDecoderStub.instances[0]!);
  vi.advanceTimersByTime(59);
  assert.equal(AudioContextStub.sources.length, 0);
  vi.advanceTimersByTime(1);
  assert.deepEqual(AudioContextStub.sources.map(source => source.startedAt), [0]);
});

test("head jitter is absorbed: frames held apart schedule together at the flushed present", () => {
  feedFrame();
  output(AudioDecoderStub.instances[0]!);
  context.currentTime = 0.03; // talk-spike gap before the second frame arrives
  feedFrame();
  output(AudioDecoderStub.instances[0]!);
  assert.deepEqual(AudioContextStub.sources.map(source => source.startedAt), [0.03, 0.05]);
});

test("overflow drops the late frame and the stream keeps playing without a reset", () => {
  feedFrame();
  const decoder = AudioDecoderStub.instances[0]!;
  for (let index = 0; index < 6; index++) {
    output(decoder);
    feedFrame();
  }
  // 帧 1-2 预滚起播，帧 3-4 排满 80ms 窗口；帧 5-6 超窗只丢自己。
  assert.deepEqual(AudioContextStub.sources.map(source => source.startedAt), [0, 0.02, 0.04, 0.06]);
  assert.equal(dropped, 2);
  assert.equal(decodeErrors, 0);
  assert.equal(decoder.closed, 0);
  assert.ok(AudioContextStub.sources.every(source => source.stopped === 0));
  context.currentTime = 0.08;
  output(decoder);
  assert.equal(AudioContextStub.sources.at(-1)!.startedAt, 0.08, "the window reopens as the timeline drains");
  assert.equal(AudioDecoderStub.instances.length, 1);
});

test("a backlog beyond the 300 ms hard cap keeps the reset as a safety net", () => {
  feedFrame();
  const decoder = AudioDecoderStub.instances[0]!;
  for (let index = 0; index < 4; index++) {
    output(decoder);
    feedFrame();
  }
  assert.equal(AudioContextStub.sources.length, 4);
  context.currentTime = -1; // 模拟时间线失步：playTime 相对当前时间积压 >300ms
  feedFrame();
  assert.equal(AudioDecoderStub.instances.length, 2, "the stream must be rebuilt");
  assert.equal(decoder.closed, 1);
  assert.equal(AudioContextStub.gains[0]!.disconnects, 1);
});

test("a full decode queue still resets the stream", () => {
  feedFrame();
  const decoder = AudioDecoderStub.instances[0]!;
  decoder.decodeQueueSize = 3;
  feedFrame();
  assert.equal(AudioDecoderStub.instances.length, 2);
  assert.equal(decoder.closed, 1);
});

test("clear discards the held pre-roll and its wait timer", () => {
  feedFrame();
  output(AudioDecoderStub.instances[0]!);
  playback.clear(7);
  vi.advanceTimersByTime(60);
  assert.equal(AudioContextStub.sources.length, 0);
  output(AudioDecoderStub.instances[0]!); // a late decode of the cleared stream must stay inert
  assert.equal(AudioContextStub.sources.length, 0);
});
