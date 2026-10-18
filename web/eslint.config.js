import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "src/components/ui/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "warn",
    },
  },
  {
    rules: {
      // 跨根依赖白名单：从 src 内逃出仓库根、或沿用旧的相对路径摸 src/shared，一律禁止；
      // 唯一合法通道是 @shared/* 别名（docs/DECISIONS.md #3 门禁 2/3 条）。
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["../../**", "**/src/shared/**"], message: "跨根代码只允许经 @shared/* 别名（依赖白名单）。" },
          ],
        },
      ],
    },
  },
  {
    // 分层方向（随 P3 拆分落地）：voice/ 是框架无关核心，UI 与装配层不得反向依赖；
    // 后续模块从门面拆出时，本规则即刻生效。
    files: ["src/voice/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["../../**", "**/src/shared/**"], message: "跨根代码只允许经 @shared/* 别名（依赖白名单）。" },
            { group: ["@/web-client/*", "@/components/*", "@/views/*", "@/hooks/*"],
              message: "voice/ 是框架无关核心：UI 与装配层不得反向依赖（共享类型走 session-model 等显式契约）。" },
          ],
        },
      ],
    },
  },
  {
    // 分层方向：web-client/ 是控制器层，视图经 props 注入；返回 JSX 的装配 hook
    // 归 components/（先例：use-audio-settings）。
    files: ["src/web-client/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["../../**", "**/src/shared/**"], message: "跨根代码只允许经 @shared/* 别名（依赖白名单）。" },
            { group: ["@/components/*", "@/views/*"],
              message: "web-client/ 是控制器层：控制器不 import 组件，视图经 props 注入。" },
          ],
        },
      ],
    },
  },
  {
    // 分层方向：组件层不依赖页面装配层。
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["../../**", "**/src/shared/**"], message: "跨根代码只允许经 @shared/* 别名（依赖白名单）。" },
            { group: ["@/views/*"],
              message: "组件层不依赖页面装配层（views/ 单向向下引组件）。" },
          ],
        },
      ],
    },
  },
  {
    // 门禁 §3.5-1：单文件 400 行（跳过空行与注释）。
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      // 下划线前缀 = 有意弃用（解构剔除字段、未消费的回调参数）。
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  {
    // 400 行豁免：i18n 字典、测试、shadcn 生成代码（已整体 ignores）。
    files: ["src/i18n/**", "src/**/*.test.*"],
    rules: { "max-lines": "off" },
  },
  {
    // 存量平移巨石豁免（拆解后即从清单移除；新代码不得进清单）。
    // screen-share：信令/协商/状态三职责待拆。
    files: ["src/voice/screen-share.ts"],
    rules: { "max-lines": "off" },
  },
  {
    // 门禁 §3.5-2：纯逻辑层禁 React；响应式用 zustand/vanilla，只有 hooks 薄层订阅。
    files: ["src/services/**", "src/voice/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "react", message: "纯逻辑层禁 React：需要响应式用 zustand/vanilla，UI 订阅放 hooks 层。" },
            { name: "react-dom", message: "纯逻辑层禁 react-dom。" },
            { name: "zustand", message: "纯逻辑层用 'zustand/vanilla'（零 React 依赖），React 绑定只在 hooks 层。" },
          ],
          patterns: [
            { group: ["../../**", "**/src/shared/**"], message: "跨根代码只允许经 @shared/* 别名（依赖白名单）。" },
          ],
        },
      ],
    },
  },
  {
    // 门禁 §3.5-4：禁裸值——任意色值、任意字号、任意 z-index（z 只走 --ws-z-* 阶梯的语义类）。
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/-\\[(#|rgb|rgba|hsl|hsla|oklch|oklab|color\\()/]",
          message: "禁裸色值：颜色走 token/语义类（DESIGN.md），任意色值不允许进 TSX。",
        },
        {
          selector: "Literal[value=/\\btext-\\[[0-9.]+(?:px|rem|em)\\]/]",
          message: "禁裸字号：字号只走六级 token 与 text-mobile-input-safe。",
        },
        {
          selector: "Literal[value=/\\bz-\\[/]",
          message: "禁裸 z-index：浮层层级只走 --ws-z-* 阶梯的语义类（raised/header/dropdown/menu-mask/menu/modal-mask/toast）。",
        },
        {
          selector: "Property[key.name='zIndex'] > Literal[raw=/^-?[0-9]/]",
          message: "禁裸 zIndex 数值：style 对象里 z 层级用字符串 var(--ws-z-*)，或改用 z-raised…z-toast 语义类。",
        },
        {
          selector: "Property[key.name='zIndex'] > UnaryExpression[argument.raw=/^[0-9]/]",
          message: "禁裸 zIndex 数值（负数字面量）：style 对象里 z 层级用字符串 var(--ws-z-*)。",
        },
      ],
    },
  },
);
