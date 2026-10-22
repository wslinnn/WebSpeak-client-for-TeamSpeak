/*
 * 样式声明纪律（P4 落地）。三件事交给机器，改 CSS 不再靠记忆：
 * 1. 浮层层级只准取 --ws-z-* 变量；0–3 是 isolation:isolate 容器内的局部小阶梯，
 *    不与本阶梯比较（历史上裸 z-index:40 曾压在弹窗遮罩上）。
 * 2. transition 禁 all、禁 width/height/top/left/right/bottom/margin/padding/gap
 *    ——布局属性过渡必致回流；grid-template-* 的过渡是工作区折叠动画的刻意
 *    设计，保留。
 * 3. 颜色使用点（hex/rgba/rgb）一律走命名变量：web-client 与 admin 双面同规；
 *    唯一豁免是 custom property 定义行（--xxx: 值）。
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
};
