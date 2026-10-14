import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // 跨根依赖唯一白名单：@shared（协议/校验器）与 @domain（目标解析纯逻辑）。
      "@shared": fileURLToPath(new URL("../src/shared", import.meta.url)),
      "@domain": fileURLToPath(new URL("../src/domain", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
