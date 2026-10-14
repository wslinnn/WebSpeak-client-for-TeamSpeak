import { describe, expect, it } from "vitest";

import { computeUiScale } from "./ui-scale";

describe("ui-scale（SPEC §1 平价）", () => {
  it("1920×1080 基准 = 1", () => {
    expect(computeUiScale(1920, 1080)).toBe(1);
  });

  it("单向更大不放大（取两向最小，再钳下限 1）", () => {
    expect(computeUiScale(3840, 1080)).toBe(1);
    expect(computeUiScale(1920, 2160)).toBe(1);
  });

  it("双向放大按比例（取两向最小），上限 1.5", () => {
    expect(computeUiScale(2400, 1400)).toBeCloseTo(2400 / 1920);
    expect(computeUiScale(3840, 2160)).toBe(1.5);
    expect(computeUiScale(7680, 4320)).toBe(1.5);
  });

  it("小视口钳在 1（交给响应式断点，不缩字号）", () => {
    expect(computeUiScale(1366, 768)).toBe(1);
    expect(computeUiScale(375, 667)).toBe(1);
  });
});
