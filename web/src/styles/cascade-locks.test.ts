import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * important 锁单源化回归锁（报告 26 A 级修复的防复发测试）：
 * @layer 化后跨层 important 按「早层胜」裁决——同一元素族的重要锁若散居多层，
 * 早层锁会静默压掉晚层锁（本案三连：≤740 成员面板开关失效、成员菜单软键盘
 * 避让失效、菜单左锚回退 12px）。原则：同一锁面只允许住在一层；
 * 新增 important 锁前先跑 reports/layer-tools/layer-conflict-scan.mjs 查互撞。
 *
 * 读文件而非 ?raw 导入：vitest 对 CSS 走 stub（?raw 返回空串）；
 * web 测试恒经 `npm --prefix web` 运行，cwd = web/ 根。
 */

const shard = (name: string): string => readFileSync(`src/styles/web-client/${name}.css`, "utf8");
const mobileCss = readFileSync("src/styles/web-client-mobile.css", "utf8");

function declarationsIn(css: string, selectorPattern: RegExp): string[] {
  const blocks = [...css.matchAll(new RegExp(`${selectorPattern.source}\\s*\\{([^}]*)\\}`, "g"))];
  return blocks.flatMap((block) => (block[1] ?? "").split(";").map((line) => line.trim()).filter(Boolean));
}

describe("important 锁单源化", () => {
  it("≤740 成员面板的 display 锁只住在 14 号（关闭态 :not 锁 + 开态开关同层按特异性裁决）", () => {
    const stray = declarationsIn(shard("13-whisper-mobile"), /\.app-shell \.member-panel(?!\.)/)
      .filter((line) => /^display:.*!important/.test(line));
    expect(stray, "13 号不得再持有 display !important（会以早层身份压掉 14 号开态开关）").toEqual([]);

    const lock = shard("14-responsive-2").includes(".app-shell .member-panel:not(.mobile-section-visible)");
    expect(lock, "14 号必须保留关闭态 :not 锁（皮肤防护语义）").toBe(true);
  });

  it("≤740 成员菜单的 bottom 锁只住在 mobile 层（键盘感知锚定）", () => {
    for (const name of ["12-join-card", "14-responsive-2"]) {
      const stray = declarationsIn(shard(name), /\.member-context-menu/)
        .filter((line) => /^bottom:.*!important/.test(line));
      expect(stray, `${name} 不得持有 bottom !important（早层胜会压掉 mobile 层键盘避让锁）`).toEqual([]);
    }
    const lockBlock = mobileCss.match(/\.member-context-menu\s*\{[^}]*\}/)?.[0] ?? "";
    expect(lockBlock, "mobile 层必须保留键盘感知 bottom 锁（--ws-viewport-height 参与 calc）")
      .toMatch(/bottom:[^;]*!important/);
    expect(lockBlock).toContain("--ws-viewport-height");
  });

  it("≤740 成员菜单的 left 锁只住在 14 号（10px 为后批意图）", () => {
    const stray = declarationsIn(shard("12-join-card"), /\.member-context-menu/)
      .filter((line) => /^left:.*!important/.test(line));
    expect(stray, "12 号不得再持有 left !important").toEqual([]);
    expect(shard("14-responsive-2"), "14 号必须保留 left: 10px 锁").toMatch(/\.member-context-menu\s*\{[^}]*left:\s*10px\s*!important/s);
  });

  it("设备设置 36px 规则住在 21 号（晚于 18 号 ≤420 flex 短式），07 号不再重复", () => {
    const migrated = shard("21-components").includes('.device-setup > [data-ws-part="home.device-setup.open"]');
    expect(migrated, "36px 规则必须迁入 21 号按层序压过 18 号").toBe(true);
    expect(shard("07-connected").includes('data-ws-part="home.device-setup.open"'), "07 号不得残留旧副本").toBe(false);
  });

  it("switcher 项的杀灭规则不带 :focus-visible（键盘焦点环归还 12 号全局 2px 环）", () => {
    const css = shard("21-components");
    expect(css).not.toMatch(/\.member-server-switcher-item[^{]*:focus-visible[^{]*\{[^}]*outline:\s*none/);
  });
});
