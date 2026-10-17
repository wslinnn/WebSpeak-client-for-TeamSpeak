import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * web-client.css 的层结构锁（报告 24 阶段 1 回归测试）：
 * 级联胜负已从「导入序记忆」改为 @layer 结构——每条 @import 必须挂 layer(wNN-主题)，
 * 层序 = 导入序 = 顶部声明语句序。谁新增分片忘了同步层，或引入未分层 @import，
 * 都会在这里被拦下（未分层规则会压过全部分层应用样式，也会被皮肤未分层规则压过，
 * 两边都不是预期行为）。
 *
 * 读文件而非 ?raw 导入：vitest 对 CSS 模块走 stub（?raw 实测返回空串）；
 * web 测试恒经 `npm --prefix web` 运行，cwd = web/ 根。
 */

const manifest = readFileSync("src/styles/web-client.css", "utf8");

function layerNamesFromStatement(): string[] {
  const statement = manifest.match(/^@layer ([^;{]+);/m);
  expect(statement, "manifest 顶部必须有 @layer a, b, …; 声明语句").toBeTruthy();
  return (statement?.[1] ?? "").split(",").map((name) => name.trim());
}

function importLayers(): Array<{ path: string; layer: string }> {
  const imports = [...manifest.matchAll(/^@import "([^"]+)"(?:\s+layer\(([-_a-z0-9.]+)\))?;/gm)];
  return imports.map((m) => ({ path: m[1] ?? "", layer: m[2] ?? "" }));
}

describe("web-client.css 层结构", () => {
  it("每条 @import 都挂了 layer(w…)", () => {
    const imports = importLayers();
    expect(imports.length).toBeGreaterThanOrEqual(23);
    for (const entry of imports) {
      expect(entry.layer, `${entry.path} 缺少 layer() 标注`).toMatch(/^w\d{2}-/);
    }
  });

  it("层序 = 导入序 = 声明语句序（wNN 编号连续递增）", () => {
    const declared = layerNamesFromStatement();
    const imported = importLayers().map((entry) => entry.layer);
    expect(imported).toEqual(declared);
    const numbers = imported.map((name) => Number(name.slice(1, 3)));
    for (let i = 1; i < numbers.length; i++) {
      const prev = numbers[i - 1];
      const cur = numbers[i];
      expect(cur, "层名 wNN 编号必须可解析").toBeDefined();
      expect(prev).toBeDefined();
      expect(cur).toBe((prev ?? 0) + 1);
    }
  });

  it("层名带 w 序号前缀，不与 Tailwind/皮肤层撞名", () => {
    for (const name of layerNamesFromStatement()) {
      expect(name).toMatch(/^w\d{2}-[-_a-z0-9]+$/);
    }
  });

  it("manifest 顶层只有 @layer 声明与 @import，无内联规则", () => {
    const body = manifest
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^@layer [^;{]+;/m, "")
      .replace(/^@import [^;]+;/gm, "");
    expect(body.trim()).toBe("");
  });
});
