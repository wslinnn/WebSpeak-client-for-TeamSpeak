import assert from "node:assert/strict";
import { test } from "vitest";
import { webClientTranslations } from "./i18n/web-client";
import { copy } from "./i18n/admin";
import { createWebClientMessages } from "./i18n/messages";

// The zh dictionary is the editing baseline; en must cover it. The check is
// inclusion (en may legitimately carry extra keys), not strict equality.
test("every web-client locale covers the zh key set", () => {
  const base = Object.keys(webClientTranslations.zh!);
  assert.ok(base.length > 300, "the zh baseline looks implausibly small");
  for (const [locale, dict] of Object.entries(webClientTranslations)) {
    const keys = new Set(Object.keys(dict!));
    const missing = base.filter((key) => !keys.has(key));
    assert.deepEqual(missing, [], `locale ${locale} is missing keys`);
  }
});

test("the admin en locale covers the zh key set", () => {
  const base = Object.keys(copy.zh) as string[];
  assert.ok(base.length > 100, "the zh baseline looks implausibly small");
  const keys = new Set(Object.keys(copy.en));
  const missing = base.filter((key) => !keys.has(key));
  assert.deepEqual(missing, [], "the en locale is missing keys");
});

test("the message layer substitutes {{variables}} and falls back to the key", () => {
  const zh = createWebClientMessages("zh", webClientTranslations.zh!);
  const en = createWebClientMessages("en", webClientTranslations.en!);
  const sample = Object.entries(webClientTranslations.zh!).find(([, value]) => value.includes("{{"));
  assert.ok(sample, "the zh baseline contains at least one templated key");
  const [key] = sample!;
  const variables = [...sample![1].matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]!);
  const rendered = zh.t(key, Object.fromEntries(variables.map(name => [name, "X"])) as Record<string, string>);
  assert.doesNotMatch(rendered, /\{\{\w+\}\}/, "variables must be substituted");
  // 缺键兜底到键名本身（pack 键集由对齐测试保证完整）。
  assert.equal(en.t("nonexistent-key"), "nonexistent-key", "missing keys fall back to the key itself");
  assert.equal(typeof en.t(key), "string");
});
