import assert from "node:assert/strict";
import test from "node:test";
import { webClientTranslations } from "../src/i18n/web-client.js";
import { copy, germanCopy, japaneseCopy, russianCopy } from "../src/i18n/admin.js";

// The zh dictionary is the editing baseline; every other locale must cover it.
// de/ru/ja legitimately supersets via the en spread, so the check is
// inclusion, not strict equality.
test("every web-client locale covers the zh key set", () => {
  const base = Object.keys(webClientTranslations.zh);
  assert.ok(base.length > 300, "the zh baseline looks implausibly small");
  for (const [locale, dict] of Object.entries(webClientTranslations)) {
    const keys = new Set(Object.keys(dict));
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
