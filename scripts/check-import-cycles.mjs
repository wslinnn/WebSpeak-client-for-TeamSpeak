// 后端 import 环检测：src/** 内相对引用建图，DFS 找环，发现即退出码 1。
// 只看相对路径（./ ../），包导入不入图。verify 链中的一道，防层间腐化。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const srcDir = join(root, "src");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

// NodeNext：相对导入写 .js，实际文件是 .ts
function resolveImport(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base.replace(/\.js$/, ".ts"), `${base}/index.ts`, base];
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return c; } catch { /* try next */ }
  }
  return null;
}

const files = walk(srcDir);
const graph = new Map();
for (const f of files) {
  const css = readFileSync(f, "utf8");
  const deps = [];
  for (const m of css.matchAll(/(?:import|export)\s+[^'"]*?from\s+["'](\.[^"']+)["']/g)) {
    const target = resolveImport(f, m[1]);
    if (target) deps.push(target);
  }
  for (const m of css.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g)) {
    const target = resolveImport(f, m[1]);
    if (target) deps.push(target);
  }
  graph.set(f, deps);
}

const color = new Map(); // 1 = 在栈，2 = 完成
const stack = [];
let cycles = 0;

function dfs(node) {
  color.set(node, 1);
  stack.push(node);
  for (const dep of graph.get(node) ?? []) {
    const c = color.get(dep) ?? 0;
    if (c === 1) {
      cycles++;
      const start = stack.indexOf(dep);
      const cyclePath = [...stack.slice(start), dep].map((p) => p.replace(srcDir + "\\", "").replaceAll("\\", " → "));
      console.error(`[cycle] ${cyclePath.join(" → ")}`);
    } else if (c === 0) {
      dfs(dep);
    }
  }
  stack.pop();
  color.set(node, 2);
}

for (const f of files) if (!(color.get(f) ?? 0)) dfs(f);

if (cycles > 0) {
  console.error(`发现 ${cycles} 处 import 环（src/ 内不允许循环依赖；共享声明下沉 domain/shared）`);
  process.exit(1);
}
console.log(`import 环检测通过（${files.length} 文件）`);
