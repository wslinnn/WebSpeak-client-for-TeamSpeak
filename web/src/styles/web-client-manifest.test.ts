import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * web-client.css 的层结构锁：级联胜负由 @layer 结构决定——顶部声明语句
 * 即覆盖契约（层序 = 覆盖权限），每条 @import 必须挂 layer(ws-主题)，
 * 层与文件一一对应。谁新增文件忘了同步层，或引入未分层 @import，
 * 都会在这里被拦下（未分层规则会压过全部分层应用样式，两边都不是预期行为）。
 *
 * 读文件而非 ?raw 导入：vitest 对 CSS 模块走 stub（?raw 实测返回空串）；
 * web 测试恒经 `npm --prefix web` 运行，cwd = web/ 根。
 */

const manifest = readFileSync("src/styles/web-client.css", "utf8");

/** 层阶梯契约：层序 = 覆盖权限（低 → 高）。改动必须同步本数组与 manifest。 */
const LAYER_LADDER = [
  ["ws-tokens", "tokens"],
  ["ws-base", "base"],
  ["ws-ui", "ui"],
  ["ws-join", "join"],
  ["ws-chrome", "chrome"],
  ["ws-room", "room"],
  ["ws-dialogs", "dialogs"],
  ["ws-menus", "menus"],
  ["ws-night", "night"],
  ["ws-mobile", "mobile"],
] as const;

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
  it("层阶梯 = 声明语句序 = 导入序，层与文件一一对应", () => {
    const declared = layerNamesFromStatement();
    const imported = importLayers();
    expect(declared, "声明语句必须与层阶梯契约一致").toEqual(LAYER_LADDER.map(([name]) => name));
    expect(imported.map((entry) => entry.layer), "导入挂层必须与声明语句逐条一致").toEqual(declared);
    expect(imported, "层与文件一一对应且齐全").toEqual(
      LAYER_LADDER.map(([name, file]) => ({ path: `./web-client/${file}.css`, layer: name })),
    );
  });

  it("层名带 ws- 语义前缀，无批次序号", () => {
    for (const name of layerNamesFromStatement()) {
      expect(name).toMatch(/^ws-[a-z]+$/);
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
