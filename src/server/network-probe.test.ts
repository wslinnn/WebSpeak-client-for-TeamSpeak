import assert from "node:assert/strict";
import test from "node:test";
import { buildPingInvocation } from "./network-probe.js";

test("the ping invocation keeps the hostname in its own argument slot", () => {
  assert.deepEqual(buildPingInvocation("voice.example.com", 1_000, "win32"), {
    command: "ping.exe", args: ["-n", "1", "-w", "1000", "voice.example.com"],
  });
  // POSIX 的 -W 以秒计并向上取整。
  assert.deepEqual(buildPingInvocation("voice.example.com", 1_500, "linux"), {
    command: "ping", args: ["-c", "1", "-W", "2", "voice.example.com"],
  });
});

test("a hostname starting with a dash is refused instead of becoming a ping option", () => {
  // ping 会把 "-f" 之类的实参当选项（无 shell，仅参数歧义）。目标解析器已拒绝
  // 前导 -，这里是 spawn 边界的第二道防线。
  assert.throws(() => buildPingInvocation("-f", 1_000, "linux"), /Invalid ping host/);
  assert.throws(() => buildPingInvocation("--help", 1_000, "win32"), /Invalid ping host/);
  assert.throws(() => buildPingInvocation("", 1_000, "linux"), /Invalid ping host/);
});
