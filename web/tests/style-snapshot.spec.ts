import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// 样式金样门禁（拍板 A）：按 data-ws-part 注册部件录计算样式金样，任何覆盖
// 致渲染变化都会 diff 爆红——「确认覆盖有意」的动作被强制为显式更新快照
// （UPDATE_STYLE_SNAPSHOTS=1 npm run smoke 重新录制）。死类清退等纯 CSS 手术
// 以「金样零漂移」为最硬安全网。结构对齐 smoke.spec（fixture page + init 脚本），
// 属性白名单只收布局/涂装/层级/光标等稳定值，不收内容文本；可见部件才入样。

const PROPS = [
  "display", "position", "flexDirection", "alignItems", "justifyContent", "gap",
  "backgroundColor", "color", "borderColor", "borderRadius",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "padding", "margin", "fontSize", "fontWeight", "lineHeight",
  "overflowX", "overflowY", "cursor", "visibility", "zIndex",
  "minHeight", "maxHeight", "boxShadow",
];
const DIR = join(process.cwd(), "tests", "__style-snapshots__");
const GATEWAY_LOG = join(process.env.TEMP ?? "/tmp", "webspeak-smoke-gateway.log");

declare global {
  interface Window {
    __wsTestHooks?: { seedRoomState(): void; resetState(): void };
  }
}

type Snapshot = Record<string, Record<string, string | number>>;

async function capture(page: import("@playwright/test").Page): Promise<Snapshot> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(450);
  return page.evaluate((props) => {
    const seen = new Map<string, number>();
    const out: Snapshot = {};
    for (const el of [...document.querySelectorAll<HTMLElement>("[data-ws-part]")]) {
      const part = el.dataset.wsPart!;
      if (!el.offsetParent && getComputedStyle(el).position !== "fixed") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const n = seen.get(part) ?? 0;
      seen.set(part, n + 1);
      const key = n === 0 ? part : `${part}#${n}`;
      const cs = getComputedStyle(el);
      const rec: Record<string, string | number> = { w: Math.round(r.width), h: Math.round(r.height) };
      for (const p of props) rec[p] = cs.getPropertyValue(p);
      out[key] = rec;
    }
    return out;
  }, PROPS);
}

function checkOrUpdate(key: string, snap: Snapshot): void {
  // 三项目（视口档）各自成样：同 surface 的几何在 375/768/1280 下本就不同。
  const file = join(DIR, `${test.info().project.name}-${key}.json`);
  if (process.env.UPDATE_STYLE_SNAPSHOTS === "1") {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(snap, null, 1));
    return;
  }
  expect(existsSync(file), `金样缺失：${key}（UPDATE_STYLE_SNAPSHOTS=1 npm run smoke 重录）`).toBe(true);
  const golden: Snapshot = JSON.parse(readFileSync(file, "utf8"));
  const diffs: string[] = [];
  for (const part of new Set([...Object.keys(golden), ...Object.keys(snap)])) {
    const g = golden[part];
    const s = snap[part];
    if (!g || !s) { diffs.push(`${part}: ${g ? "消失" : "新增"}`); continue; }
    for (const prop of new Set([...Object.keys(g), ...Object.keys(s)])) {
      if (g[prop] !== s[prop]) diffs.push(`${part}.${prop}: ${g[prop]} -> ${s[prop]}`);
    }
  }
  expect(diffs, `样式金样漂移（${key}）——覆盖若属有意，UPDATE_STYLE_SNAPSHOTS=1 npm run smoke 重录并随改动同批提交：\n` + diffs.slice(0, 40).join("\n")).toEqual([]);
}

async function boot(page: import("@playwright/test").Page, theme: "day" | "night"): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("webspeak:e2e", "1");
    localStorage.setItem("webspeak:language", "zh");
    localStorage.setItem("webspeak:mobile-gate", "continue");
  });
  await page.goto("/");
  if (theme === "night") {
    await page.locator('[data-ws-part="theme.toggle"]').click();
    await page.waitForTimeout(500);
  }
}

for (const theme of ["day", "night"] as const) {
  test(`首页 · ${theme}`, async ({ page }) => {
    await boot(page, theme);
    checkOrUpdate(`home-${theme}`, await capture(page));
  });

  test(`房间 · ${theme}`, async ({ page }) => {
    await boot(page, theme);
    // 种子前必须等根挂载：goto 返回早于 effects，钩子可能尚未注册（静默空转）。
    await page.waitForSelector('[data-ws-part="home.form"]');
    await page.evaluate(() => window.__wsTestHooks?.seedRoomState());
    await page.waitForSelector('[data-ws-part="voice.shell"]');
    if (test.info().project.name === "mobile") {
      await page.locator('[data-ws-part="voice.mobile-nav"] button').nth(1).click();
      await page.waitForTimeout(300);
    }
    checkOrUpdate(`room-${theme}`, await capture(page));
  });

  test(`admin · ${theme}`, async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "admin 金样只在桌面项目录");
    const token = existsSync(GATEWAY_LOG)
      ? readFileSync(GATEWAY_LOG, "utf8").match(/ws-setup-[A-Za-z0-9_-]+/)?.[0]
      : undefined;
    test.skip(!token, "网关日志无 setup token");
    await page.addInitScript(() => {
      localStorage.setItem("webspeak:language", "zh");
    });
    await page.goto("/admin");
    const user = page.locator('input[autocomplete="username"]');
    if (await user.count()) {
      await user.fill("admin");
      // 同一编排里日趟已改密：先试既知密码，失败回落 token 首启流程。
      await page.locator('input[autocomplete="current-password"]').fill("style-golden-pass-1");
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(900);
      if ((await page.locator('input[autocomplete="current-password"]').count()) > 0) {
        await page.locator('input[autocomplete="current-password"]').fill(token!);
        await page.locator('button[type="submit"]').click();
        await page.waitForTimeout(1000);
      }
    }
    const newPw = page.locator('input[autocomplete="new-password"]');
    if ((await newPw.count()) >= 1) {
      await newPw.first().fill("style-golden-pass-1");
      const confirm = page.locator('input[autocomplete="new-password"]').nth(1);
      if (await confirm.count()) await confirm.fill("style-golden-pass-1");
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(1000);
    }
    await page.goto("/admin");
    checkOrUpdate(`admin-${theme}`, await capture(page));
    await page.goto("/admin/server");
    checkOrUpdate(`admin-server-${theme}`, await capture(page));
  });
}
