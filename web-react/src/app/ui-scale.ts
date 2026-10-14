// SPEC §1 ui-scale 平价：以 1920×1080 布局为基准，视口双向更大时放大 --ui-scale（上限 1.5）；
// 更小视口交给响应式断点，不缩小字号。
const BASELINE_WIDTH = 1920;
const BASELINE_HEIGHT = 1080;
const MAX_UI_SCALE = 1.5;

export function computeUiScale(viewportWidth: number, viewportHeight: number): number {
  return Math.min(
    MAX_UI_SCALE,
    Math.max(1, Math.min(viewportWidth / BASELINE_WIDTH, viewportHeight / BASELINE_HEIGHT)),
  );
}

export function applyUiScale(): void {
  const scale = computeUiScale(window.innerWidth, window.innerHeight);
  document.documentElement.style.setProperty("--ui-scale", scale.toFixed(4));
}

export function installUiScale(): () => void {
  applyUiScale();
  window.addEventListener("resize", applyUiScale, { passive: true });
  return () => window.removeEventListener("resize", applyUiScale);
}
