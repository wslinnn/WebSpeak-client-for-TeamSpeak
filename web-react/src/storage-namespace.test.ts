// @vitest-environment node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

// Namespace guard for web storage: every localStorage/sessionStorage key the
// client writes must live under the `webspeak:` prefix, because the "clear
// local data" wipe sweeps the whole namespace rather than an enumerated key
// list (enumerated lists are how new settings survived the wipe). This test
// statically scans the client source for storage calls — direct literals and
// upper-snake key constants alike — and fails on the first off-namespace key.
const SOURCE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)));
const NAMESPACE = "webspeak:";

function* walkSourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walkSourceFiles(full);
    else if ((name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) yield full;
  }
}

async function scanSource() {
  const keyConstants = new Map<string, { value: string; file: string; line: number }>();
  const storageCallSites: Array<{ file: string; line: number; key: string | null; constant: string | null }> = [];
  for (const file of walkSourceFiles(SOURCE_ROOT)) {
    const lines = (await readFile(file, "utf8")).split(/\r?\n/);
    const relative = path.relative(SOURCE_ROOT, file);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/\bconst\s+([A-Z][A-Z0-9_]+)\s*=\s*"([^"]+)"/g)) {
        keyConstants.set(match[1]!, { value: match[2]!, file: relative, line: index + 1 });
      }
      for (const match of line.matchAll(/\b(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*("([^"]+)"|([A-Z][A-Z0-9_]+))/g)) {
        const literal = match[2];
        const constant = match[3];
        storageCallSites.push({ file: relative, line: index + 1, key: literal ?? null, constant: constant ?? null });
      }
    });
  }
  return { keyConstants, storageCallSites };
}

test("every web storage key lives under the webspeak namespace", async () => {
  const { keyConstants, storageCallSites } = await scanSource();
  assert.ok(storageCallSites.length >= 10, `the scan should see the real storage call sites (found ${storageCallSites.length})`);

  const offenders: string[] = [];
  for (const site of storageCallSites) {
    const key = site.key ?? keyConstants.get(site.constant ?? "")?.value;
    if (key === undefined) {
      offenders.push(`${site.file}:${site.line} references unknown key constant "${site.constant}"`);
      continue;
    }
    if (!key.startsWith(NAMESPACE)) offenders.push(`${site.file}:${site.line} uses off-namespace key "${key}"`);
  }
  assert.deepEqual(offenders, []);

  // The known guard targets keep their exact names so a silent rename cannot
  // drop them out of the sweep's coverage.
  for (const required of ["webspeak:voice-session", "webspeak:mobile-gate", "webspeak:desktop-notifications"]) {
    assert.ok(
      storageCallSites.some((site) => (site.key ?? keyConstants.get(site.constant ?? "")?.value) === required),
      `the wipe-relevant key "${required}" must remain a webspeak-namespaced storage key`,
    );
  }
});
