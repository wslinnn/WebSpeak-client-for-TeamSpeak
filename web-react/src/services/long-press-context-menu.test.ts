import { describe, expect, it, vi } from "vitest";

import { createLongPressContextMenu, type LongPressOpen } from "./long-press-context-menu";

/** 指针事件桩：旧 Vue composable 的平移 characterization（右键开菜单、长按开菜单、
 *  移动取消、点击吞噬、pointercancel 不吞点击）。 */
function pointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    pointerType: "touch",
    clientX: 10,
    clientY: 20,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  } as unknown as PointerEvent;
}
function mouseEvent(overrides: Partial<MouseEvent> = {}): MouseEvent {
  return {
    clientX: 30,
    clientY: 40,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  } as unknown as MouseEvent;
}

describe("createLongPressContextMenu", () => {
  it("right-click opens the menu immediately at the pointer and cancels a pending hold", () => {
    vi.useFakeTimers();
    const opens: LongPressOpen<string>[] = [];
    const gestures = createLongPressContextMenu<string>((open) => opens.push(open));
    gestures.pointerDown(pointerEvent(), "server-a");
    gestures.contextMenu(mouseEvent(), "server-b");
    expect(opens).toEqual([{ x: 30, y: 40, context: "server-b" }]);
    // 原生长按定时器已被右键取消：到点不再合成第二个菜单。
    vi.advanceTimersByTime(600);
    expect(opens).toHaveLength(1);
    vi.useRealTimers();
  });

  it("a 500ms touch hold opens the menu once and swallows exactly one trailing click", () => {
    vi.useFakeTimers();
    const opens: LongPressOpen<string>[] = [];
    const gestures = createLongPressContextMenu<string>((open) => opens.push(open));
    gestures.pointerDown(pointerEvent(), "server-a");
    vi.advanceTimersByTime(500);
    expect(opens).toEqual([{ x: 10, y: 20, context: "server-a" }]);
    gestures.clickCapture(mouseEvent());
    // 吞噬只此一次：后续点击正常放行（preventDefault 不再被调）。
    const later = mouseEvent();
    gestures.clickCapture(later);
    expect(later.preventDefault).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("movement within the slop keeps the hold; movement beyond it cancels (it was a scroll)", () => {
    vi.useFakeTimers();
    const opens: LongPressOpen<undefined>[] = [];
    const gestures = createLongPressContextMenu<undefined>((open) => opens.push(open));
    gestures.pointerDown(pointerEvent());
    gestures.pointerMove(pointerEvent({ clientX: 10, clientY: 25 }));
    vi.advanceTimersByTime(500);
    expect(opens).toHaveLength(1); // 5px < 12px slop：按住不是滚动，到点开菜单
    gestures.pointerDown(pointerEvent({ clientX: 100, clientY: 100 }));
    gestures.pointerMove(pointerEvent({ clientX: 100, clientY: 130 }));
    vi.advanceTimersByTime(500);
    expect(opens).toHaveLength(1); // 30px > slop：滚动取消，不再开
    gestures.pointerUp();
    vi.useRealTimers();
  });

  it("mouse presses never start a hold; pointercancel re-arms the click flag", () => {
    vi.useFakeTimers();
    const opens: LongPressOpen<undefined>[] = [];
    const gestures = createLongPressContextMenu<undefined>((open) => opens.push(open));
    gestures.pointerDown(pointerEvent({ pointerType: "mouse" }));
    vi.advanceTimersByTime(800);
    expect(opens).toEqual([]);
    gestures.pointerDown(pointerEvent());
    gestures.pointerCancel();
    const click = mouseEvent();
    gestures.clickCapture(click);
    expect(click.preventDefault).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("dispose cancels the pending hold", () => {
    vi.useFakeTimers();
    const opens: LongPressOpen<undefined>[] = [];
    const gestures = createLongPressContextMenu<undefined>((open) => opens.push(open));
    gestures.pointerDown(pointerEvent());
    gestures.dispose();
    vi.advanceTimersByTime(800);
    expect(opens).toEqual([]);
    vi.useRealTimers();
  });
});
