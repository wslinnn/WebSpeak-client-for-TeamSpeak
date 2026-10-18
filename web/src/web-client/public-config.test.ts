import { afterEach, describe, expect, it, vi } from "vitest";

import { createPublicConfig } from "./public-config";

/*
 * 「:9987」裸奔回归锁（2026-10-18 复盘）：open+屏蔽预填模式在挂载回填恢复意图
 * 目标之后异步跑 loadPublicConfig，applyPrefill("", 9987) 曾无条件把真实 host
 * 清成 ""——守卫（shouldSkipPrefill）必须在两个预填分支前生效。
 */

function publicConfigResponse(mode: string, prefillBlocked: boolean): unknown {
  return {
    ok: true,
    json: async () => ({ accessMode: mode, targetPrefillBlocked: prefillBlocked }),
  };
}

describe("publicConfig 预填守卫", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("open+屏蔽预填在无守卫时清空 host（旧行为基线）", async () => {
    vi.stubGlobal("fetch", async () => publicConfigResponse("open", true));
    const applied: Array<[string, string]> = [];
    const controller = createPublicConfig({ applyPrefill: (host, port) => applied.push([host, port]), t: key => key });
    await controller.loadPublicConfig();
    expect(applied).toEqual([["", "9987"]]);
  });

  it("会话上下文存在（shouldSkipPrefill）时清空与预填都不落地", async () => {
    vi.stubGlobal("fetch", async () => publicConfigResponse("open", true));
    const applied: Array<[string, string]> = [];
    const controller = createPublicConfig({
      applyPrefill: (host, port) => applied.push([host, port]),
      shouldSkipPrefill: () => true,
      t: key => key,
    });
    await controller.loadPublicConfig();
    expect(applied).toEqual([]);
    expect(controller.store.getState().accessMode).toBe("open");
    expect(controller.store.getState().openTargetPrefillBlocked).toBe(true);
  });

  it("守卫同样拦住 fixed 目标预填分支", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ accessMode: "fixed", target: "ts.example.com:9987" }),
    }));
    const applied: Array<[string, string]> = [];
    const controller = createPublicConfig({
      applyPrefill: (host, port) => applied.push([host, port]),
      shouldSkipPrefill: () => true,
      t: key => key,
    });
    await controller.loadPublicConfig();
    expect(applied).toEqual([]);
  });
});
