// @vitest-environment node
// 门禁规则有效性自证（计划 Phase 1 验证门的持久化形态）：每条机检规则——
// 故意违规的探针文件必须被拦，等价合法写法必须放行。规则本体在 eslint.config.js。
import { ESLint } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: fileURLToPath(new URL("../..", import.meta.url)) });

async function probe(filePath: string, code: string): Promise<ESLint.LintResult> {
  const [result] = await eslint.lintText(code, { filePath });
  if (!result) throw new Error(`lintText produced no result for ${filePath}`);
  return result;
}

function messagesFor(result: ESLint.LintResult): string[] {
  return result.messages.map((message) => `${message.ruleId}: ${message.message}`);
}

describe("防劣化门禁探针", () => {
  // 编程式 ESLint（带类型感知规则）单次 lintText 可达数秒，整跑并行负载下更慢；
  // 全 describe 统一 20s 超时，只放宽计时上限不放宽断言。
  const lintTimeout = 20_000;

  it("门禁 1：单文件 400 行（跳过空行与注释）——401 行实体代码被拦", async () => {
    const body = Array.from({ length: 401 }, (_, i) => `const pad${i} = ${i};`).join("\n");
    const result = await probe("src/probe-too-long.ts", body);
    expect(messagesFor(result).join("\n")).toContain("max-lines");
  }, lintTimeout);

  it("门禁 1：401 行中大部分是注释则放行", async () => {
    const body = [
      ...Array.from({ length: 380 }, (_, i) => `// 注释行 ${i}`),
      ...Array.from({ length: 20 }, (_, i) => `const pad${i} = ${i};`),
    ].join("\n");
    const result = await probe("src/probe-comments-only.ts", body);
    expect(messagesFor(result).filter((m) => m.startsWith("max-lines"))).toEqual([]);
  });

  it("门禁 2：services 层 import react 被拦", async () => {
    const result = await probe("src/services/probe-react.ts", `import { useState } from "react";\nexport const x = 1;\n`);
    expect(messagesFor(result).join("\n")).toContain("纯逻辑层禁 React");
  });

  it("门禁 2：services 层 import zustand 根入口被拦（只允许 zustand/vanilla）", async () => {
    const result = await probe("src/services/probe-zustand.ts", `import { createStore } from "zustand";\nexport const x = 1;\n`);
    expect(messagesFor(result).join("\n")).toContain("zustand/vanilla");
  });

  it("门禁 3：相对路径摸仓库根 src/shared 被拦，@shared 别名放行", async () => {
    const bad = await probe("src/probe-escape.ts", `import { x } from "../src/shared/client-commands.js";\nexport const y = x;\n`);
    expect(messagesFor(bad).join("\n")).toContain("@shared");
    const good = await probe("src/probe-alias.ts", `export const y = 1;\n`);
    expect(messagesFor(good).filter((m) => m.includes("@shared"))).toEqual([]);
  });

  it("门禁 4：TSX 裸色值/裸字号/裸 z 层被拦，语义类与 var() 放行", async () => {
    const bad = await probe(
      "src/probe-bare-values.tsx",
      [
        `export function Badge() {`,
        `  const cls = "text-[#ff0000] text-[13px] z-[500]";`,
        `  return <div style={{ color: "#123456", zIndex: 500 }} className={cls} />;`,
        `}`,
        `export function Badge2() {`,
        `  return <div style={{ zIndex: -1 }} />;`,
        `}`,
      ].join("\n"),
    );
    const messages = messagesFor(bad).join("\n");
    expect(messages).toContain("禁裸色值");
    expect(messages).toContain("禁裸字号");
    expect(messages).toContain("禁裸 z-index");
    expect(messages).toContain("禁裸 zIndex 数值");
  });

  it("门禁 4：语义 token 写法（z 语义类/var 颜色/zIndex var 字符串）放行", async () => {
    const good = await probe(
      "src/probe-clean-values.tsx",
      [
        `export function Badge() {`,
        `  return (`,
        `    <div`,
        `      style={{ color: "var(--foreground)", zIndex: "var(--ws-z-toast)" }}`,
        `      className="text-sm text-muted-foreground z-toast" />`,
        `  );`,
        `}`,
      ].join("\n"),
    );
    expect(messagesFor(good)).toEqual([]);
  });

  it("下划线前缀豁免 unused-vars；未加前缀仍报错", async () => {
    const bad = await probe("src/probe-unused.ts", `export function f(unused: number) { return 1; }\n`);
    expect(messagesFor(bad).join("\n")).toContain("no-unused-vars");
    const good = await probe("src/probe-unused-ok.ts", `export function f(_ignored: number) { return 1; }\n`);
    expect(messagesFor(good)).toEqual([]);
  });

  it("components/ui 整体豁免门禁（shadcn 生成代码不受限）", async () => {
    const result = await probe(
      "src/components/ui/probe-generated.tsx",
      `export const cls = "text-[#fff] z-[60]";\n`,
    );
    // 被全局忽略时 lintText 返回一条 ruleId=null 的提示，真实规则消息应为空。
    expect(result.messages.filter((message) => message.ruleId !== null)).toEqual([]);
  });

  it("测试与 i18n 字典豁免 max-lines", async () => {
    const body = Array.from({ length: 420 }, (_, i) => `const pad${i} = ${i};`).join("\n");
    const dict = await probe("src/i18n/probe-dict.ts", body);
    expect(messagesFor(dict).filter((m) => m.startsWith("max-lines"))).toEqual([]);
    const test = await probe("src/probe.test.ts", body);
    expect(messagesFor(test).filter((m) => m.startsWith("max-lines"))).toEqual([]);
  });
});
