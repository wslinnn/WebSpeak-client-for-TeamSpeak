import assert from "node:assert/strict";
import { test } from "vitest";
import { webClientTranslations } from "./i18n/web-client";
import { copy, germanCopy, japaneseCopy, russianCopy } from "./i18n/admin";
import { createWebClientMessages } from "./i18n/messages";

// The zh dictionary is the editing baseline; every other locale must cover it.
// de/ru/ja legitimately superset via the en spread, so the check is
// inclusion, not strict equality.
test("every web-client locale covers the zh key set", () => {
  const base = Object.keys(webClientTranslations.zh!);
  assert.ok(base.length > 300, "the zh baseline looks implausibly small");
  for (const [locale, dict] of Object.entries(webClientTranslations)) {
    const keys = new Set(Object.keys(dict!));
    const missing = base.filter((key) => !keys.has(key));
    assert.deepEqual(missing, [], `locale ${locale} is missing keys`);
  }
});

test("every admin locale covers the zh key set", () => {
  const base = Object.keys(copy.zh) as string[];
  assert.ok(base.length > 100, "the zh baseline looks implausibly small");
  for (const [name, dict] of Object.entries({ en: copy.en, de: germanCopy, ru: russianCopy, ja: japaneseCopy })) {
    const keys = new Set(Object.keys(dict as Record<string, string>));
    const missing = base.filter((key) => !keys.has(key));
    assert.deepEqual(missing, [], `locale ${name} is missing keys`);
  }
});

test("the message layer substitutes {{variables}} and falls back en → zh → key", () => {
  const zh = createWebClientMessages("zh");
  const ja = createWebClientMessages("ja");
  const en = createWebClientMessages("en");
  const sample = Object.entries(webClientTranslations.zh!).find(([, value]) => value.includes("{{"));
  assert.ok(sample, "the zh baseline contains at least one templated key");
  const [key] = sample!;
  const variables = [...sample![1].matchAll(/\{\{(\w+)\}\}/g)].map(match => match[1]!);
  const rendered = zh.t(key, Object.fromEntries(variables.map(name => [name, "X"])) as Record<string, string>);
  assert.doesNotMatch(rendered, /\{\{\w+\}\}/, "variables must be substituted");
  assert.equal(ja.t("nonexistent-key"), webClientTranslations.en?.["nonexistent-key"] ?? "nonexistent-key",
    "missing keys fall back through en/zh to the key itself");
  assert.equal(typeof en.t(key), "string");
});
