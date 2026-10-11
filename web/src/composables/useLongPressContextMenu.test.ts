import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createLongPressContextMenu } from "./useLongPressContextMenu.js";

// The composable talks to window timers only; node's timers satisfy it.
(globalThis as { window?: unknown }).window = globalThis;

interface PointerLike {
  pointerType: string;
  clientX: number;
  clientY: number;
}

function touch(x: number, y: number): PointerEvent & PointerLike {
  return { pointerType: "touch", clientX: x, clientY: y } as PointerEvent & PointerLike;
}

function mouse(x: number, y: number): PointerEvent & PointerLike {
  return { pointerType: "mouse", clientX: x, clientY: y } as PointerEvent & PointerLike;
}

function clickAt(x: number, y: number): { event: MouseEvent; prevented: boolean; stopped: boolean } {
  const state = { prevented: false, stopped: false };
  const event = {
    clientX: x,
    clientY: y,
    preventDefault: () => { state.prevented = true; },
    stopPropagation: () => { state.stopped = true; },
  } as unknown as MouseEvent;
  // Getters, not spread: the assertions must see the handlers' mutations.
  return { event, get prevented() { return state.prevented; }, get stopped() { return state.stopped; } };
}

const tick = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

describe("createLongPressContextMenu", () => {
  afterEach(() => { void 0; });

  it("opens after the hold duration with the start point and context", async () => {
    const opened: Array<{ x: number; y: number; context?: string }> = [];
    const gestures = createLongPressContextMenu<string>(open => opened.push(open), { durationMs: 20 });
    gestures.pointerDown(touch(30, 40), "row-a");
    await tick(50);
    assert.deepEqual(opened, [{ x: 30, y: 40, context: "row-a" }]);
  });

  it("cancels the pending press when the finger moves beyond the slop", async () => {
    const opened: unknown[] = [];
    const gestures = createLongPressContextMenu(open => opened.push(open), { durationMs: 20, slopPx: 5 });
    gestures.pointerDown(touch(0, 0));
    gestures.pointerMove(touch(30, 0));
    await tick(40);
    assert.equal(opened.length, 0);
  });

  it("keeps the pending press for movement inside the slop", async () => {
    const opened: unknown[] = [];
    const gestures = createLongPressContextMenu(open => opened.push(open), { durationMs: 20, slopPx: 12 });
    gestures.pointerDown(touch(100, 100));
    gestures.pointerMove(touch(108, 104));
    await tick(40);
    assert.equal(opened.length, 1);
  });

  it("ignores mouse pointers entirely", async () => {
    const opened: unknown[] = [];
    const gestures = createLongPressContextMenu(open => opened.push(open), { durationMs: 20 });
    gestures.pointerDown(mouse(10, 10));
    await tick(40);
    assert.equal(opened.length, 0);
  });

  it("suppresses the click that follows an opened long-press exactly once", async () => {
    const opened: unknown[] = [];
    const gestures = createLongPressContextMenu(open => opened.push(open), { durationMs: 20 });
    gestures.pointerDown(touch(10, 10));
    await tick(40);
    const first = clickAt(10, 10);
    gestures.clickCapture(first.event);
    assert.equal(first.prevented, true);
    assert.equal(first.stopped, true);
    const second = clickAt(10, 10);
    gestures.clickCapture(second.event);
    assert.equal(second.prevented, false);
    assert.equal(second.stopped, false);
  });

  it("does not suppress clicks after a cancelled gesture", async () => {
    const opened: unknown[] = [];
    const gestures = createLongPressContextMenu(open => opened.push(open), { durationMs: 20 });
    gestures.pointerDown(touch(10, 10));
    gestures.pointerCancel();
    await tick(40);
    assert.equal(opened.length, 0);
    const tap = clickAt(10, 10);
    gestures.clickCapture(tap.event);
    assert.equal(tap.prevented, false);
  });

  it("routes native contextmenu through the same opener and prevents the default", () => {
    const opened: Array<{ x: number; y: number; context?: number }> = [];
    const gestures = createLongPressContextMenu<number>(open => opened.push(open));
    let prevented = false;
    gestures.contextMenu({ clientX: 12, clientY: 34, preventDefault: () => { prevented = true; } } as unknown as MouseEvent, 7);
    assert.equal(prevented, true);
    assert.deepEqual(opened, [{ x: 12, y: 34, context: 7 }]);
  });
});
