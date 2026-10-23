import postcss from "postcss";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

// 死类清退流水线 v2（postcss AST 版）。默认 dry；--apply 删除。
const EXTRA = ["mobile-view-", "voice-member-", "permission-", "language-"];
const APPLY = process.argv.includes("--apply");

const tsFiles = [], cssFiles = [], mdFiles = [];
const walk = (dir, isCss) => {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".css") && (isCss || p.includes("styles" + "\\"))) cssFiles.push(p);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) tsFiles.push(p);
    else if (p.endsWith(".md")) mdFiles.push(p);
  }
};
walk("src");
for (const p of ["src/styles/web-client", "src/styles/admin"]) walk(p);
walk("../web/tests");
walk("../web/docs");
const tsBlob = tsFiles.map((f) => readFileSync(f, "utf8")).join("\n");
const mdBlob = mdFiles.map((f) => readFileSync(f, "utf8")).join("\n");
const prefixes = [];
for (const m of tsBlob.matchAll(/["'`]([A-Za-z][\w-]*-)["'`]/g)) prefixes.push(m[1]);
for (const m of tsBlob.matchAll(/`([A-Za-z][\w-]*-)\$\{/g)) prefixes.push(m[1]);

const allClasses = new Set();
for (const f of cssFiles)
  for (const m of readFileSync(f, "utf8").matchAll(/\.([a-zA-Z][\w-]*)/g)) allClasses.add(m[1]);

const dead = new Set(), keep = new Set();
for (const cls of allClasses) {
  if (cls.includes("wsd-") || cls.startsWith("ws-")) continue;
  if (tsBlob.includes(cls)) { keep.add(cls); continue; }
  if (EXTRA.some((p) => cls.startsWith(p)) || prefixes.some((p) => cls.startsWith(p))) { keep.add(cls); continue; }
  if (mdBlob.includes(cls)) { console.log("DOC-ONLY:", cls); continue; }
  dead.add(cls);
}
console.log("死集数：", dead.size);
if (!APPLY) { console.log([...dead].sort().join("\n")); process.exit(0); }

// 逗号切分（忽略括号内逗号）
const splitSel = (sel) => {
  const out = [];
  let d = 0, cur = "";
  for (const ch of sel) {
    if (ch === "(" || ch === "[") d++;
    if (ch === ")" || ch === "]") d--;
    if (ch === "," && d === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
};
const chainDead = (chain) => { for (const m of chain.matchAll(/\.([a-zA-Z][\w-]*)/g)) if (dead.has(m[1])) return true; return false; };

let removed = 0;
for (const f of cssFiles) {
  const root = postcss.parse(readFileSync(f, "utf8"), { from: f });
  root.walkRules((rule) => {
    const sel = rule.selector;
    const live = splitSel(sel).map((s) => s.trim()).filter((s) => s && !chainDead(s));
    if (live.length === 0) { rule.remove(); removed++; }
    else if (live.length !== splitSel(sel).length) { rule.selector = live.join(",\n"); }
  });
  let swept = true;
  while (swept) {
    swept = false;
    root.walkAtRules((at) => {
      if ((at.name === "media" || at.name === "supports") && at.nodes.length === 0) { at.remove(); removed++; swept = true; }
    });
  }
  const out = root.toResult().css;
  if (out !== readFileSync(f, "utf8")) writeFileSync(f, out);
}
console.log("APPLY 完成，规则级移除：", removed);

// 定点重扫
const after = new Set();
for (const f of cssFiles)
  for (const m of readFileSync(f, "utf8").matchAll(/\.([a-zA-Z][\w-]*)/g)) {
    const cls = m[1];
    if (cls.includes("wsd-") || cls.startsWith("ws-")) continue;
    if (!tsBlob.includes(cls) && !EXTRA.some((p) => cls.startsWith(p)) && !prefixes.some((p) => cls.startsWith(p))) after.add(cls);
  }
console.log("定点重扫残留死类：", after.size ? [...after].join(", ") : "0");
if (after.size) process.exit(1);
