import { expect, test } from "@playwright/test";

// 冒烟五步：首页渲染 / 中文文案 / 主题（皮肤日/夜）切换 / 种子进房态 / 控制台零错误。
// 锚点一律 data-ws-part（部件契约即注册表）；移动门、语言、测试桥运行期开关
// 在页面脚本之前经 addInitScript 写入。
// 桥形状与 src/web-client/test-hooks.ts 的 WebSpeakTestHooks 保持一致；tests/
// 不在 tsc 工程内（Playwright 自行编译），声明就地自带一份。

declare global {
  interface Window {
    __wsTestHooks?: { seedRoomState(): void; resetState(): void };
  }
}

let consoleErrors: string[];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  await page.addInitScript(() => {
    localStorage.setItem("webspeak:e2e", "1");
    localStorage.setItem("webspeak:language", "zh");
    localStorage.setItem("webspeak:mobile-gate", "continue");
  });
  await page.goto("/");
  await expect(page.locator('[data-ws-part="home.form"]')).toBeVisible();
});

test("首页渲染品牌与连接表单", async ({ page }) => {
  await expect(page.locator('[data-ws-part="home.brand"]')).toBeVisible();
  // 昵称为空时按钮 disabled，这里只断言可达与文案。
  await expect(page.locator('[data-ws-part="home.connect"]')).toBeVisible();
});

test("首页文案为中文基准", async ({ page }) => {
  await expect(page.locator('[data-ws-part="home.connect"]')).toContainText("进入语音空间");
});

test("主题切换翻转皮肤属性", async ({ page }) => {
  const root = page.locator(".ws-skin-root");
  // 皮肤控制器异步初始化（目录拉取后才 applyTheme），先等就绪标志。
  await expect(root).not.toHaveClass(/skin-initializing/);
  const before = await root.getAttribute("data-ws-skin");
  expect(before, "初始皮肤属性应已写入").toBeTruthy();
  await page.locator('[data-ws-part="skin.trigger"]').click();
  await page.locator(".skin-option", { hasText: "夜间" }).click();
  await expect(root).not.toHaveAttribute("data-ws-skin", before!);
});

test("种子进房态渲染房间壳", async ({ page }) => {
  await page.evaluate(() => window.__wsTestHooks?.seedRoomState());
  await expect(page.locator('[data-ws-part="voice.shell"]')).toBeVisible();
  if (test.info().project.name === "mobile") {
    // 移动端聊天在底部导航页签之后：切到聊天页签再断言输入框可达。
    await page.locator('[data-ws-part="voice.mobile-nav"] button').nth(1).click();
  }
  await expect(page.locator('[data-ws-part="voice.chat.composer"]')).toBeVisible();
  await page.evaluate(() => window.__wsTestHooks?.resetState());
  await expect(page.locator('[data-ws-part="home.form"]')).toBeVisible();
});

test("控制台零错误", async ({ page }) => {
  await page.evaluate(() => window.__wsTestHooks?.seedRoomState());
  await expect(page.locator('[data-ws-part="voice.shell"]')).toBeVisible();
  await page.evaluate(() => window.__wsTestHooks?.resetState());
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});
