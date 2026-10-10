// Namespace guard for web storage: every localStorage/sessionStorage key the
// client writes must live under the `webspeak:` prefix, because the "clear
// local data" wipe sweeps the whole namespace rather than an enumerated key
// list (enumerated lists are how new settings survived the wipe). This test
// statically scans the client source for storage calls — direct literals and
// upper-snake key constants alike — and fails on the first off-namespace key.
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const NAMESPACE = "webspeak:";

function* walkSourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walkSourceFiles(full);
    else if ((name.endsWith(".ts") || name.endsWith(".vue")) && !name.endsWith(".test.ts")) yield full;
  }
}

function scanSource() {
  const keyConstants = new Map();
  const storageCallSites = [];
  for (const file of walkSourceFiles(SOURCE_ROOT)) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    const relative = path.relative(SOURCE_ROOT, file);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(/\bconst\s+([A-Z][A-Z0-9_]+)\s*=\s*"([^"]+)"/g)) {
        keyConstants.set(match[1], { value: match[2], file: relative, line: index + 1 });
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

test("every web storage key lives under the webspeak namespace", () => {
  const { keyConstants, storageCallSites } = scanSource();
  assert.ok(storageCallSites.length >= 10, `the scan should see the real storage call sites (found ${storageCallSites.length})`);

  const offenders = [];
  for (const site of storageCallSites) {
    const key = site.key ?? keyConstants.get(site.constant)?.value;
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
      storageCallSites.some((site) => (site.key ?? keyConstants.get(site.constant)?.value) === required),
      `the wipe-relevant key "${required}" must remain a webspeak-namespaced storage key`,
    );
  }
});
