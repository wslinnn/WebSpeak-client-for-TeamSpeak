import tseslint from "typescript-eslint";

// Backend and maintenance scripts. The web workspace has its own config.
export default tseslint.config(
  {
    ignores: ["dist/**", "vendor/**", "web/**", "data/**"],
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ["src/**/*.ts", "scripts/**/*.mjs"],
  })),
  {
    files: ["src/**/*.ts", "scripts/**/*.mjs"],
    rules: {
      // Test files legitimately redeclare fixtures per test; the codebase
      // otherwise keeps declarations unique.
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "none",
      }],
    },
  },
  {
    // 门禁 §3.5：单文件 400 行（跳过空行与注释）。存量超限文件在下一块豁免，
    // 豁免清单只许减不许增——拆分时顺手摘除。
    files: ["src/**/*.ts"],
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // 存量超限（2026-10-19 复量）：ts-client 428 /
    // voice-bridge.integration.test 420（测试性长装配可接受，暂豁免）。
    // connection-handler（request/admission/socket/dial）、
    // screen-share-coordinator（relay/discovery）、database（migrations）
    // 拆分后摘除豁免。
    files: [
      "src/server/ts-client.ts",
      "src/server/voice-bridge.integration.test.ts",
    ],
    rules: { "max-lines": "off" },
  },
  {
    // 门禁：持久层不依赖组合根（server/）。共享常量下沉 constants，线上类型
    // 下沉 domain/shared——2026-10-19 起 persistence→server 为零豁免。
    files: ["src/persistence/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["../server/**", "./server/**"],
          message: "persistence 不得 import server/：常量入 constants、类型入 domain/shared。",
        }],
      }],
    },
  },
  {
    // 门禁：admin→server 只准消费既列服务（组合现实：探针/别名/网络探测由
    // server 层持有 TSClient）。清单只许减不许增；新依赖优先下沉
    // constants/domain/shared，确需 server 服务则把服务改为注入。
    files: ["src/admin/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: [
            "../server/**",
            "!../server/client-ip.js",
            "!../server/network-probe.js",
            "!../server/teamspeak-alias.js",
            "!../server/teamspeak-probe.js",
            "!../server/voice-bridge.js",
            "!../server/webrtc-audio.js",
            "!../server/webrtc-config.js",
          ],
          message: "admin→server 新依赖须评审：下沉 constants/domain/shared 或改注入，勿扩本清单。",
        }],
      }],
    },
  },
);
