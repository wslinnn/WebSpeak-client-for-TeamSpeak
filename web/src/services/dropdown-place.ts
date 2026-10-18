import { currentUiScale } from "../app/ui-scale";

// Shared dropdown placement for the skin/language switchers. Menus anchored
// to a trigger near a screen or container edge overflow whatever anchors
// them; these helpers clamp into the viewport (and any clipping ancestor)
// after the menu has rendered.

const VIEWPORT_MARGIN = 8;
// The CSS anchors the menu 8px below the trigger (`top: calc(100% + 8px)`).
const MENU_GAP = 8;
// Decorated surfaces (the admin login card scrolls, dialogs clip) cut off
// absolutely-positioned menus no matter how well the viewport fits them.
const MAX_CLIP_ANCESTORS = 6;

/**
 * Scroll/clip containers between the trigger and the page root. Bounded walk:
 * menus sit near the surface root, so a handful of levels is plenty.
 */
function collectClipAncestors(el: HTMLElement): HTMLElement[] {
  const clips: HTMLElement[] = [];
  let node = el.parentElement;
  while (node && node !== document.body && clips.length < MAX_CLIP_ANCESTORS) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll" || overflow === "hidden" || overflow === "clip") clips.push(node);
    node = node.parentElement;
  }
  return clips;
}

/**
 * Tile mode: the server rail clips absolutely-positioned menus, so the menu
 * is placed fixed beside the tile (right preferred, flipped when clipped).
 */
export function placeDropdownBesideTile(rootEl: HTMLElement, dropdownEl: HTMLElement): void {
  const rootRect = rootEl.getBoundingClientRect();
  const width = dropdownEl.offsetWidth;
  const height = dropdownEl.offsetHeight;
  const scale = currentUiScale();
  let left = rootRect.right + 8;
  if (left + width > window.innerWidth - VIEWPORT_MARGIN) left = Math.max(VIEWPORT_MARGIN, rootRect.left - width - 8);
  let top = rootRect.top;
  if (top + height > window.innerHeight - VIEWPORT_MARGIN) top = Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN - height);
  dropdownEl.style.position = "fixed";
  // 矩形是视觉像素；缩放子树内的内联坐标按未缩放像素解释，写入前换算。
  dropdownEl.style.left = `${left / scale}px`;
  dropdownEl.style.top = `${top / scale}px`;
  dropdownEl.style.right = "auto";
}

/**
 * Fixed placement below a full-width trigger (the mobile more panel's
 * switchers): viewport-anchored so the panel's own scroll/clip can neither
 * cut the menu off nor — with in-flow expansions — squeeze the rest of the
 * panel down (2026-10-18 user report). The caller re-places on open; panel
 * scrolling after open is accepted (menu closes on outside tap/Esc).
 */
export function placeDropdownBelowFixed(rootEl: HTMLElement, dropdownEl: HTMLElement): void {
  const rootRect = rootEl.getBoundingClientRect();
  const height = dropdownEl.offsetHeight;
  const scale = currentUiScale();
  let top = rootRect.bottom + MENU_GAP;
  if (top + height > window.innerHeight - VIEWPORT_MARGIN) top = Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN - height);
  dropdownEl.style.position = "fixed";
  dropdownEl.style.left = `${rootRect.left / scale}px`;
  dropdownEl.style.top = `${top / scale}px`;
  dropdownEl.style.right = "auto";
  dropdownEl.style.width = `${rootRect.width / scale}px`;
}

/**
 * Inline mode: the dropdown is absolutely positioned relative to the trigger
 * and anchored to its right edge, so a trigger near a container edge pushes
 * the menu past the viewport or past any clipping ancestor (e.g. the admin
 * login card, whose overflow-y:auto also turns overflow-x into auto). After
 * the menu renders, clamp it into the tightest bound of every clipping
 * ancestor and the viewport — horizontally against both edges, vertically
 * flipping above the trigger when the bottom would clip. The CSS default
 * placement stays untouched whenever it already fits. Coordinates stay
 * root-relative so the menu keeps scrolling with its trigger.
 */
export function placeDropdownClamped(rootEl: HTMLElement, dropdownEl: HTMLElement): void {
  dropdownEl.style.left = "";
  dropdownEl.style.top = "";
  dropdownEl.style.right = "";
  const rootRect = rootEl.getBoundingClientRect();
  // offset sizes ignore the entry animation's transform, which would skew a
  // getBoundingClientRect measurement taken the frame the menu opens.
  const width = dropdownEl.offsetWidth;
  const height = dropdownEl.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  // Tightest bound of every clipping ancestor and the viewport, per side.
  let bottomBound = viewportHeight - VIEWPORT_MARGIN;
  let topBound = VIEWPORT_MARGIN;
  let leftBound = VIEWPORT_MARGIN;
  let rightBound = viewportWidth - VIEWPORT_MARGIN;
  for (const node of collectClipAncestors(rootEl)) {
    const rect = node.getBoundingClientRect();
    bottomBound = Math.min(bottomBound, rect.bottom);
    topBound = Math.max(topBound, rect.top);
    leftBound = Math.max(leftBound, rect.left);
    rightBound = Math.min(rightBound, rect.right);
  }
  const clippedBelow = rootRect.bottom + MENU_GAP + height > bottomBound;
  // CSS default: the menu's right edge anchors to the trigger's right edge.
  const anchoredLeft = rootRect.right - width;
  const fitsHorizontally = anchoredLeft >= leftBound && rootRect.right <= rightBound;
  if (!clippedBelow && fitsHorizontally) return;
  // Keep the right-anchored position when it fits; otherwise push into the
  // bounds. A container narrower than the menu cannot fit it at all — align
  // to its left edge and let the container scroll.
  const menuLeft = Math.min(Math.max(anchoredLeft, leftBound), Math.max(leftBound, rightBound - width));
  const placeAbove = clippedBelow && rootRect.top - MENU_GAP - height >= topBound;
  const viewportTop = placeAbove
    ? Math.max(topBound, rootRect.top - MENU_GAP - height)
    : rootRect.bottom + MENU_GAP;
  // 输出与 rootRect 同基准的视觉像素增量；缩放子树内换算成本地像素。
  const scale = currentUiScale();
  dropdownEl.style.left = `${Math.round((menuLeft - rootRect.left) / scale)}px`;
  dropdownEl.style.top = `${Math.round((viewportTop - rootRect.top) / scale)}px`;
  dropdownEl.style.right = "auto";
}
