import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * 声明纪律棘轮（stylelint 的测试侧补充）：
 * 1. 裸 hex 债务——web-client 组件级一次性色值存量按文件钉顶，只许降不许涨
 *    （≤ 断言，还清后可从基线移除）；清偿路径是收敛到 tokens.css 的 --wsd-*。
 *    tokens.css 是令牌定义点，不计。
 * 2. --ws-z-* 阶梯单源——只允许定义在 index.css :root，防副本复活。
 * 3. !important 锁面盘点——每文件数量钉顶，新增锁必须有意更新基线；
 *    锁面单源约束见 cascade-locks.test.ts。
 *
 * 读文件而非 ?raw 导入：vitest 对 CSS 走 stub；web 测试恒经 `npm --prefix web`
 * 运行，cwd = web/ 根。
 */

const stylesDir = "src/styles";
const read = (p: string): string => readFileSync(p, "utf8");

/** src/index.css + styles 顶层 + 两个子目录，全部相对 src/ 的键。 */
function allCssKeys(): string[] {
  const keys = ["index.css"];
  for (const name of readdirSync(stylesDir)) if (name.endsWith(".css")) keys.push(`styles/${name}`);
  for (const sub of ["web-client", "admin"]) {
    for (const name of readdirSync(join(stylesDir, sub))) if (name.endsWith(".css")) keys.push(`styles/${sub}/${name}`);
  }
  return keys;
}

const countMatches = (css: string, re: RegExp): number => (css.match(re) ?? []).length;

describe("声明纪律棘轮", () => {
  it("web-client 裸 hex 债务只许降不许涨", () => {
    const baseline: Record<string, number> = {
      "styles/web-client/chrome.css": 30,
      "styles/web-client/dialogs.css": 7,
      "styles/web-client/join.css": 2,
      "styles/web-client/menus.css": 32,
      "styles/web-client/mobile.css": 1,
      "styles/web-client/night.css": 1,
      "styles/web-client/room.css": 24,
      "styles/web-client/ui.css": 3,
    };
    for (const [file, max] of Object.entries(baseline)) {
      const n = countMatches(read(join("src", file)), /#[0-9a-fA-F]{3,8}\b/g);
      expect(n, `${file} 裸 hex ${n} > 基线 ${max}；新颜色一律走 --wsd-* 令牌`).toBeLessThanOrEqual(max);
    }
  });

  it("--ws-z-* 阶梯单源：只定义在 index.css :root", () => {
    for (const key of allCssKeys()) {
      if (key === "index.css") continue;
      const n = countMatches(read(join("src", key)), /--ws-z-[a-z-]+:/g);
      expect(n, `${key} 不得重复定义 --ws-z-*（唯一事实源是 index.css :root）`).toBe(0);
    }
    expect(countMatches(read("src/index.css"), /--ws-z-[a-z-]+:/g)).toBeGreaterThanOrEqual(7);
  });

  it("!important 锁面盘点：新增锁必须有意更新基线", () => {
    const baseline: Record<string, number> = {
      "index.css": 6,
      "styles/web-client.css": 1, // 头注释里的字面量，非规则
      "styles/admin/base-auth.css": 2,
      "styles/admin/settings.css": 6,
      "styles/web-client/chrome.css": 2,
      "styles/web-client/menus.css": 7,
      "styles/web-client/mobile.css": 2,
      "styles/web-client/room.css": 2,
    };
    for (const key of allCssKeys()) {
      const n = countMatches(read(join("src", key)), /!important/g);
      const max = baseline[key] ?? 0;
      expect(n, `${key} !important ${n} > 基线 ${max}；新增锁前先确认同一锁面没有更早层持有，并登记本基线`).toBeLessThanOrEqual(max);
    }
  });
});
