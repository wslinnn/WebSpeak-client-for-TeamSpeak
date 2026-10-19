/*
 * 样式声明纪律（P4 落地）。三件事交给机器，改 CSS 不再靠记忆：
 * 1. 浮层层级只准取 --ws-z-* 变量；0–3 是 isolation:isolate 容器内的局部小阶梯，
 *    不与本阶梯比较（历史上裸 z-index:40 曾压在弹窗遮罩上）。
 * 2. transition 禁 all、禁 width/height/top/left/right/bottom/margin/padding/gap
 *    ——布局属性过渡必致回流；grid-template-* 的过渡是工作区折叠动画的刻意
 *    设计，保留。
 * 3. 裸 hex 的存量债务（web-client 面约 100 处组件级一次性色值）由
 *    styles/color-debt.test.ts 棘轮看管：只许降不许涨；admin 面调色板独立
 *    （prefers-color-scheme 暗色），令牌单轨化属主题统一课题另行处理。
 */
export default {
  extends: [],
  plugins: [],
  ignoreFiles: ["src/styles/web-client/tokens.css"],
  rules: {
    "at-rule-no-unknown": [true, { ignoreAtRules: ["layer", "custom-variant", "utility", "theme", "apply", "tailwind", "config"] }],
    "block-no-empty": true,
    "declaration-property-value-allowed-list": {
      "z-index": [/^var\(--ws-z-[a-z-]+(, ?\d+)?\)$/, /^[0-3]$/],
    },
    "declaration-property-value-disallowed-list": {
      transition: [/(^|[\s,])all\b/, /(^|[\s,])(width|height|top|left|right|bottom|margin|padding|gap)\b/],
      "transition-property": [/(^|[\s,])all\b/, /(^|[\s,])(width|height|top|left|right|bottom|margin|padding|gap)\b/],
    },
    "no-empty-source": true,
  },
};
