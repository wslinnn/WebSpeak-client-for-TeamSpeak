import { defineConfig } from "@playwright/test";

// 冒烟门禁：三视口打同一份 e2e 构建 + 一次性网关。三个视口对应三档布局带
// （≤740 移动 / 741-980 中带 / ≥981 四栏工作区），断言只认 data-ws-part 锚点，
// 不依赖会重构的样式类名。
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3041",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "node ../scripts/smoke-server.mjs",
    url: "http://127.0.0.1:3041/health",
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
