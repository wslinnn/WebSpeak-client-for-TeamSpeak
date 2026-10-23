import { expect, test } from "@playwright/test";

// 消息实时刷新门禁：React Compiler 只在产物构建生效（vite react({compiler})，
// vitest 无此转换），「方法调用派生被按纯值缓存」类回归只能在冒烟产物级抓——
// 2026-10-23 用户报告「消息到达不上屏、切页签才可见」即漏网于此（行渲染侧
// 未像滚动侧一样手动依赖钉住）。桌面单跑即可：三个项目共用同一产物，缓存
// 行为与视口无关。种子与线上活体到达同形：session store 整数组替换（syncChat）。

declare global {
  interface Window {
    __wsTestHooks?: { seedRoomState(): void; seedChatMessages(count: number): void };
  }
}

test.beforeEach(({ }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "编译器缓存行为与视口无关，桌面单跑");
});

test("新消息到达即时上屏，无需切页签重挂", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("webspeak:e2e", "1");
    localStorage.setItem("webspeak:language", "zh");
    localStorage.setItem("webspeak:mobile-gate", "continue");
  });
  await page.goto("/");
  await page.waitForSelector('[data-ws-part="home.form"]');
  await page.evaluate(() => {
    window.__wsTestHooks?.seedRoomState();
    window.__wsTestHooks?.seedChatMessages(50);
  });
  await page.waitForSelector(".message-row");
  await expect(page.locator(".message-row")).toHaveCount(50);
  await page.evaluate(() => window.__wsTestHooks?.seedChatMessages(51));
  await expect(page.locator(".message-row")).toHaveCount(51, { timeout: 3000 });
  // 面板级派生（页签计数器）不随 TabsContent 重挂，同批钉住。
  await expect(page.locator(".chat-panel .section-counter")).toContainText("51");
});
