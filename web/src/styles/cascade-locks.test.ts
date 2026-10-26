import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * important 锁单源化回归锁：同一元素族的重要锁若散居多处，层间/层内
 * 裁决会随位置漂移（历史三连：≤740 成员面板开关失效、成员菜单软键盘
 * 避让失效、菜单左锚回退）。原则：同一锁面只允许住在一个文件；
 * 新增 important 锁前先查与既有锁面是否同族。
 *
 * 读文件而非 ?raw 导入：vitest 对 CSS 走 stub（?raw 返回空串）；
 * web 测试恒经 `npm --prefix web` 运行，cwd = web/ 根。
 */

const shard = (name: string): string => readFileSync(`src/styles/web-client/${name}.css`, "utf8");

function declarationsIn(css: string, selectorPattern: RegExp): string[] {
  const blocks = [...css.matchAll(new RegExp(`${selectorPattern.source}\\s*\\{([^}]*)\\}`, "g"))];
  return blocks.flatMap((block) => (block[1] ?? "").split(";").map((line) => line.trim()).filter(Boolean));
}

describe("important 锁单源化", () => {
  it("≤740 成员面板的 display 锁只住在 room.css（关闭态 :not 锁 + 开态开关同文件按源序裁决）", () => {
    const room = shard("room");
    const lockOpen = room.includes(".app-shell .member-panel.mobile-section-visible");
    expect(lockOpen, "room.css 必须持有开态 display 锁").toBe(true);
    const lockClosed = room.includes(".app-shell .member-panel:not(.mobile-section-visible)");
    expect(lockClosed, "room.css 必须保留关闭态 :not 锁").toBe(true);
    // display 锁不散居其它文件
    for (const name of ["join", "chrome", "dialogs", "menus", "mobile"]) {
      const stray = declarationsIn(shard(name), /\.app-shell \.member-panel(?!\.)/)
        .filter((line) => /^display:.*!important/.test(line));
      expect(stray, `${name}.css 不得持有 .app-shell .member-panel 的 display !important`).toEqual([]);
    }
  });

  it("≤740 成员菜单的 bottom 锁只住在 mobile.css（键盘感知锚定）", () => {
    for (const name of ["join", "chrome", "room", "dialogs", "menus"]) {
      const stray = declarationsIn(shard(name), /\.member-context-menu/)
        .filter((line) => /^bottom:.*!important/.test(line));
      expect(stray, `${name}.css 不得持有 bottom !important（键盘避让锁住在 mobile 终局层）`).toEqual([]);
    }
    const mobile = readFileSync("src/styles/web-client/mobile.css", "utf8");
    const lockBlock = mobile.match(/\.member-context-menu\s*\{[^}]*\}/)?.[0] ?? "";
    expect(lockBlock, "mobile 层必须保留键盘感知 bottom 锁（--ws-viewport-height 参与 calc）")
      .toMatch(/bottom:[^;]*!important/);
    expect(lockBlock).toContain("--ws-viewport-height");
  });

  it("≤740 成员菜单的 left 锁只住在 menus.css（10px 为后批意图）", () => {
    for (const name of ["join", "chrome", "room", "dialogs", "mobile"]) {
      const stray = declarationsIn(shard(name), /\.member-context-menu/)
        .filter((line) => /^left:.*!important/.test(line));
      expect(stray, `${name}.css 不得持有 .member-context-menu 的 left !important`).toEqual([]);
    }
    expect(shard("menus"), "menus.css 必须保留 left: 10px 锁").toMatch(/\.member-context-menu\s*\{[^}]*left:\s*10px\s*!important/s);
  });

  it("设备设置 36px 规则住在 join.css（同文件晚于基础规则），room.css 不再重复", () => {
    const migrated = shard("join").includes('.device-setup > [data-ws-part="home.device-setup.open"]');
    expect(migrated, "36px 规则必须住在 join.css 与 device-setup 族同文件").toBe(true);
    expect(shard("room").includes('data-ws-part="home.device-setup.open"'), "room.css 不得残留旧副本").toBe(false);
  });
});
