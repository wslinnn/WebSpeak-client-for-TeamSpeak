// Discovers every *.test.{ts,mjs} in the repository and hands them to the
// node:test runner, so adding a test file never requires editing package.json.
// The old hand-maintained file list silently skipped new tests (and once
// shipped with duplicate JSON keys that disabled five files), which is why
// discovery lives in a script instead of an inline glob argument.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRECTORIES = new Set([
  "node_modules", "dist", "vendor", "data", "certs", "logs",
  "web/dist", "web/node_modules", ".git", ".github",
]);

function isSkipDirectory(name) {
  return (
    SKIP_DIRECTORIES.has(name)
    || name === "node_modules"
    || name === "dist"
    || name === ".git"
  );
}

function collectTestFiles(directory, relative = "") {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (isSkipDirectory(entry.name)) continue;
      found.push(...collectTestFiles(path.join(directory, entry.name), path.join(relative, entry.name)));
    } else if (/\.test\.(ts|mjs)$/.test(entry.name)) {
      found.push(path.join(relative, entry.name));
    }
  }
  return found;
}

const testFiles = collectTestFiles(ROOT).sort();
if (!testFiles.length) {
  console.error("No *.test.ts / *.test.mjs files found");
  process.exit(1);
}
console.error(`Running ${testFiles.length} test files…`);

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", ...testFiles],
  { stdio: "inherit", cwd: ROOT },
);
process.exit(result.status ?? 1);
