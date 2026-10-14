import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // 跨根依赖唯一白名单：协议类型/校验器（@shared）与目标解析纯逻辑（@domain），见 docs/SPEC.md §14。
      "@shared": fileURLToPath(new URL("../src/shared", import.meta.url)),
      "@domain": fileURLToPath(new URL("../src/domain", import.meta.url)),
    },
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3040",
      "/avatars": "http://localhost:3040",
      "/ws": {
        target: "ws://localhost:3040",
        ws: true,
      },
    },
  },
});
