import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * 屏幕共享全屏契约（对齐上游 32d8443 的修复面）：
 * 全屏播放面必须自足——基础卡片的 margin/border/圆角不能漏进全屏，尺寸用
 * vh+dvh 兜底，信箱底走 --wsd-media-void（双主题同值，浅色信箱会被读成布局
 * 故障）。组件侧无内联样式写入、全屏态读 document.fullscreenElement 的语义
 * 由 screen-share-view.test.ts 覆盖，这里只钉样式面。
 *
 * 读文件而非 ?raw 导入：vitest 对 CSS 走 stub；web 测试恒经 `npm --prefix web`
 * 运行，cwd = web/ 根。
 */

const room = readFileSync("src/styles/web-client/room.css", "utf8");
const tokens = readFileSync("src/styles/web-client/tokens.css", "utf8");

function declarations(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = room.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  return block.split(";").map((line) => line.trim()).filter(Boolean);
}

describe("屏幕共享全屏样式契约", () => {
  it("全屏播放面自足：定位/尺寸/外边距全部显式声明", () => {
    const decls = declarations(".screen-share-player:fullscreen");
    const has = (prefix: string): boolean => decls.some((line) => line.startsWith(prefix));
    for (const prefix of ["position: fixed", "inset: 0", "width: 100vw", "height: 100vh", "height: 100dvh", "max-width: none", "max-height: none", "margin: 0", "border: 0", "border-radius: 0"]) {
      expect(has(prefix), `:fullscreen 缺少 ${prefix}`).toBe(true);
    }
    expect(decls.join(";")).toContain("background: var(--wsd-media-void)");
  });

  it("全屏舞台与视频撑满、且信箱底为媒体背板色", () => {
    const stage = declarations(".screen-share-player:fullscreen .screen-share-player-stage");
    for (const prefix of ["width: 100%", "height: 100%", "min-height: 0", "max-height: none", "aspect-ratio: auto"]) {
      expect(stage.some((line) => line.startsWith(prefix)), `全屏舞台缺少 ${prefix}`).toBe(true);
    }
    expect(stage.join(";")).toContain("background: var(--wsd-media-void)");
    const video = declarations(".screen-share-player:fullscreen .screen-share-player-video");
    expect(video.join(";")).toContain("background: var(--wsd-media-void)");
  });

  it("媒体背板令牌双主题同值定义在 tokens.css", () => {
    const hits = tokens.match(/--wsd-media-void:\s*([^;]+);/g) ?? [];
    expect(hits.length).toBe(2);
    const values = new Set(hits.map((line) => line.split(":")[1]?.trim().replace(";", "")));
    expect(values.size, "日夜必须同值（浅色信箱是布局故障观感）").toBe(1);
  });
});
