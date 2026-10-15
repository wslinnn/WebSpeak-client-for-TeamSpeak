export interface LongPressOpen<T> {
  x: number;
  y: number;
  /** The per-element context passed through from the handler binding. */
  context?: T;
}

interface LongPressOptions {
  /** Press duration before the menu opens. */
  durationMs?: number;
  /** Movement that cancels a pending press — it is a scroll, not a hold. */
  slopPx?: number;
}

const HOLD_MS = 500;
const SLOP_PX = 12;

/** Unified context-menu entry for a row that is primarily a click target:
 * touch long-press (iOS never fires a native contextmenu) and native
 * right-click share one opener, so both produce the same menu. The tap that
 * opens the menu is swallowed so the row is not also activated. */
export function createLongPressContextMenu<T>(onOpen: (open: LongPressOpen<T>) => void, options: LongPressOptions = {}) {
  const holdMs = options.durationMs ?? HOLD_MS;
  const slopPx = options.slopPx ?? SLOP_PX;
  let timer: number | null = null;
  let startX = 0;
  let startY = 0;
  let suppressClick = false;

  function cancel(): void {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  }

  function pointerDown(event: PointerEvent, context?: T): void {
    // Mouse and pen keep the native contextmenu path entirely.
    if (event.pointerType !== "touch") return;
    cancel();
    suppressClick = false;
    startX = event.clientX;
    startY = event.clientY;
    timer = window.setTimeout(() => {
      timer = null;
      suppressClick = true;
      onOpen({ x: startX, y: startY, context });
    }, holdMs);
  }

  function pointerMove(event: PointerEvent): void {
    if (timer === null) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > slopPx) cancel();
  }

  function pointerUp(): void {
    cancel();
  }

  function pointerCancel(): void {
    cancel();
    // A cancelled gesture never produces the click the flag would suppress.
    suppressClick = false;
  }

  function clickCapture(event: MouseEvent): void {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function contextMenu(event: MouseEvent, context?: T): void {
    event.preventDefault();
    // A native menu wins over the pending synthesized one (Android fires
    // both); reassigning the same point is harmless everywhere else.
    cancel();
    onOpen({ x: event.clientX, y: event.clientY, context });
  }

  function dispose(): void {
    cancel();
    suppressClick = false;
  }

  return { pointerDown, pointerMove, pointerUp, pointerCancel, clickCapture, contextMenu, dispose };
}
