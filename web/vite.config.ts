import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // compiler: React Compiler 构建转换（oxc-transform-react）——组件自动 memo 化；
  // 移植全程按其规则编写（DECISIONS #36/#42/#45/#47），异常组件可逐个 "use no compiler" 豁免。
  plugins: [react({ compiler: { logDiagnostics: true } }), tailwindcss()],
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
      // changeOrigin:false 保留原始 Host：网关 /api/join-ticket 用 Origin===Host
      // 做同源校验（vite 8 代理默认改写 Host，会被 ORIGIN_REJECTED 拒绝）。
      "/api": { target: "http://localhost:3040", changeOrigin: false },
      "/avatars": { target: "http://localhost:3040", changeOrigin: false },
      "/ws": {
        target: "ws://localhost:3040",
        ws: true,
        changeOrigin: false,
      },
    },
  },
});
