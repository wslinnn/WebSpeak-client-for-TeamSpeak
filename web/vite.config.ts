import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import postcss from "postcss";
import { defineConfig, type Plugin } from "vite";

/*
 * admin.css 作用域化（报告 24 @layer 化的连带修复）：admin 分片里有大量不带
 * .admin-root 的规则（.primary-button/.text-button/label > span/label small 等，
 * 与 web-client 共享类名/元素选择器）。@layer 化前靠「返回首页时 web-client
 * 样式表重新插入到 admin 之后」的加载顺序侥幸压住；层序化后未分层规则结构性
 * 胜过一切分层样式，泄漏变活性——管理台往返后首页表单/按钮被 admin 规则改写。
 * 此插件在 CSS 模块变换后（enforce post，@import 已内联）给所有选择器补
 * .admin-root 前缀；已作用域的、html[data-ws-route="admin"] 门控的、:root
 * token 定义层跳过。顶层逗号拆分尊重括号与引号（:is(a,b)/[attr="x,y] 不误拆）。
 */
const ADMIN_CSS_ID = /[\\/]styles[\\/]admin(\.css|[\\/])/;

function scopeAdminSelector(selector: string): string {
  const parts: string[] = [];
  let buffer = "";
  let depth = 0;
  let quote: string | null = null;
  for (const ch of selector) {
    if (quote) {
      buffer += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buffer += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(buffer);
      buffer = "";
      continue;
    }
    buffer += ch;
  }
  parts.push(buffer);
  return parts
    .map((raw) => {
      const selector = raw.trim();
      if (!selector) return raw;
      if (selector.includes(".admin-root")) return selector;
      if (selector.startsWith("html[")) return selector;
      if (selector === ":root" || selector.startsWith(":root")) return selector;
      return `.admin-root ${selector}`;
    })
    .join(", ");
}

function adminScope(): Plugin {
  const scopeCss = (code: string): string => {
    const root = postcss.parse(code);
    const walk = (nodes: postcss.ChildNode[]): void => {
      for (const node of nodes) {
        if (node.type === "atrule") {
          const atrule = node as postcss.AtRule;
          if (atrule.nodes?.length) walk(atrule.nodes);
        } else if (node.type === "rule") {
          const rule = node as postcss.Rule;
          rule.selector = scopeAdminSelector(rule.selector);
        }
      }
    };
    if (root.nodes) walk(root.nodes);
    return root.toString();
  };
  return {
    name: "webspeak-admin-scope",
    enforce: "post",
    // dev：vite:css 变换后的内联模块按文件作用域化。
    transform(code, id) {
      if (!id.endsWith(".css") || !ADMIN_CSS_ID.test(id)) return null;
      return { code: scopeCss(code), map: null };
    },
    // build：@import 内联发生在 vite:css-post（晚于任何 transform），须在最终
    // 产物上再兜底一次；选择器幂等（已含 .admin-root 的跳过），双重处理无害。
    generateBundle(_, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const file = bundle[fileName];
        if (file.type !== "asset" || !fileName.endsWith(".css") || !fileName.includes("admin-view")) continue;
        const source = typeof file.source === "string" ? file.source : Buffer.from(file.source).toString("utf8");
        file.source = scopeCss(source);
      }
    },
  };
}

export default defineConfig({
  // compiler: React Compiler 构建转换（oxc-transform-react）——组件自动 memo 化；
  // 移植全程按其规则编写（DECISIONS #36/#42/#45/#47）。两条硬约束（2026-10-23
  // 消息不上屏根因复盘）：零参方法调用按 props 缓存——跨 store 派生必须把订阅
  // 值作实参传入（chat.visibleMessages(chatMessages) 形态）；"use no compiler"
  // 指令在当前 oxc 版本不生效（产物保留指令字符串但缓存槽照注），勿依赖。
  // 此类回归 vitest 抓不到（无编译器转换），只有产物级冒烟能抓（chat-live-update.spec）。
  plugins: [react({ compiler: { logDiagnostics: true } }), tailwindcss(), adminScope()],
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
