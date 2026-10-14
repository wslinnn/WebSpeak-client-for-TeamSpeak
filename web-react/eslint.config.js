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
    // 门禁 §3.5-1：单文件 400 行（跳过空行与注释）。
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // 400 行豁免：i18n 字典、测试、shadcn 生成代码（已整体 ignores）。
    files: ["src/i18n/**", "src/**/*.test.*"],
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
      ],
    },
  },
);
