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
      // 颜色使用点禁裸色值（hex/rgba/rgb/named 扩展色）：一律走 --wsd-* 或组件
      // 根语义局部变量（定义行属性名带 -- 前缀，天然不在本名单）。transparent/
      // currentColor/inherit 保留。与 declaration-discipline.test.ts 同判据双轨。
      color: [/#[0-9a-f]{3,8}\b/i, /\brgba?\(/i],
      background: [/#[0-9a-f]{3,8}\b/i, /\brgba?\(/i],
      "background-color": [/#[0-9a-f]{3,8}\b/i, /\brgba?\(/i],
      "background-image": [/#[0-9a-f]{3,8}\b/i, /\brgba?\(/i],
      border: [/#[0-9a-f]{3,8}\b/i, /\brgba?\(/i],
      "border-color": [/#[0-9a-f]{3,8}\b/i, /\brgba?\(/i],
      outline: [/#[0-9a-f]{3,8}\b/i, /\brgba?\(/i],
      "outline-color": [/#[0-9a-f]{3,8}\b/i, /\brgba?\(/i],
      fill: [/#[0-9a-f]{3,8}\b/i, /\brgba?\(/i],
      stroke: [/#[0-9a-f]{3,8}\b/i, /\brgba?\(/i],
    },
    "no-empty-source": true,
  },
  overrides: [
    {
      // admin chunk 的色值单轨翻新另有批次（7 处 rgba 使用点待归槽），暂不套
      // 颜色新规；z 阶梯与 transition 纪律维持全仓一致。
      files: ["src/styles/admin/**/*.css"],
      rules: {
        "declaration-property-value-disallowed-list": {
          transition: [/(^|[\s,])all\b/, /(^|[\s,])(width|height|top|left|right|bottom|margin|padding|gap)\b/],
          "transition-property": [/(^|[\s,])all\b/, /(^|[\s,])(width|height|top|left|right|bottom|margin|padding|gap)\b/],
        },
      },
    },
  ],
};
