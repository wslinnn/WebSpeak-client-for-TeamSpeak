// 冒烟网关编排：以 e2e 标志构建前端，再用一次性数据目录把网关拉起。
// 生命周期归 Playwright webServer：就绪探测 /health，测试结束随之终止，
// 临时数据目录在进程退出时清除，不触碰仓库 data/。
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.WEBSPEAK_SMOKE_PORT ?? "3041";
const dataDir = mkdtempSync(path.join(tmpdir(), "webspeak-smoke-"));
process.on("exit", () => rmSync(dataDir, { recursive: true, force: true }));
// 网关输出镜像到固定路径：样式金样的 admin 用例从这里取一次性 setup token
// （每次编排都是全新库，token 只存在于本次日志）。
const gatewayLogPath = path.join(tmpdir(), "webspeak-smoke-gateway.log");
const gatewayLog = createWriteStream(gatewayLogPath, { flags: "w" });

// 前端构建（生产同构产物；VITE_WS_E2E=1 让测试桥分支在产物中存活）。
const build = spawnSync("npm", ["run", "build"], {
  cwd: path.join(ROOT, "web"),
  env: { ...process.env, VITE_WS_E2E: "1" },
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const gateway = spawn("npx", ["tsx", "src/index.ts"], {
  cwd: ROOT,
  env: { ...process.env, WEBSPEAK_DATA_DIR: dataDir, WEBSPEAK_PORT: PORT, NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32",
});
gateway.stdout?.pipe(process.stdout);
gateway.stderr?.pipe(process.stderr);
gateway.stdout?.pipe(gatewayLog);
gateway.stderr?.pipe(gatewayLog);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => gateway.kill(signal));
gateway.on("exit", (code) => process.exit(code ?? 0));
