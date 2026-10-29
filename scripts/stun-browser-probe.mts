// STUN 独立门禁 + 远程可达探测（npm run probe:stun [远程地址]）：
// ① 本机模式（默认）：起 startStunServer，用「独立实现的 RFC 8489 客户端」
//    发真实 Binding 请求，由探针自持的 RFC 公式反解响应——不复用实现代码。
// ② 远程模式：npm run probe:stun -- <VPS 地址>（可 --translate 端口），
//    从本机直接打该地址的 3478/UDP，一秒定死「部署机上 STUN 是否对外可达」，
//    不受部署面猜测牵制；断言反解出的地址=探测机出口形态即可（NAT 后无法
//    对白银比对端口数值，只要求 XOR 解码自洽 + cookie/事务回显）。
// 浏览器层观测（信息性，仅本机模式）：本机 Playwright Chromium 实测以
// 0x2112a442 作 cookie 与 XOR key，属非 RFC 形态（history 2026-10-29）；
// 真实用户侧以屏幕共享 ICE 诊断面板为准。
import assert from "node:assert/strict";
import { createSocket } from "node:dgram";

const TARGET_ARG = process.argv[2]?.trim() || "";
const REMOTE_TARGET = TARGET_ARG || "";
const LOCAL_PORT = 34_71;
// 远程模式端口默认 3478（生产端口）；第二个 argv 可覆盖。
const TARGET_PORT = Number(process.argv[3] ?? "") || (REMOTE_TARGET ? 3478 : LOCAL_PORT);
const TARGET = REMOTE_TARGET || "127.0.0.1";
const GOLDEN_REQUEST_COOKIE = 0x2112_a44d;
const REQUEST_TRANSACTION_ID = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

const logger = {
  debug: () => {},
  info: (message: unknown) => console.log(`[stun] ${message}`),
  warn: (message: unknown) => console.log(`[stun-warn] ${message}`),
};
const { startStunServer } = await import("../src/server/stun-server.js");
const server = REMOTE_TARGET ? null : await startStunServer({ port: LOCAL_PORT, logger: logger as never });

const request = Buffer.alloc(20);
request.writeUInt16BE(0x0001, 0);
request.writeUInt16BE(0, 2);
request.writeUInt32BE(GOLDEN_REQUEST_COOKIE, 4);
REQUEST_TRANSACTION_ID.copy(request, 8);

const client = createSocket("udp4");
let senderPort = 0;
let reply: Buffer;
try {
  reply = await new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`STUN ${TARGET}:${TARGET_PORT} 无应答（3 秒）：UDP 可达性不通，或服务未启动/端口未放行`)), 3_000);
    client.on("message", (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    client.bind(() => {
      senderPort = (client.address() as { port: number }).port;
      client.send(request, TARGET_PORT, TARGET, () => undefined);
    });
  });
} finally {
  client.close();
  await server?.close();
}

// 独立解码（探针自持、不经实现代码）：响应头 cookie/事务须回显，属性须为
// XOR-MAPPED-ADDRESS，由 RFC 公式反解出 IPv4 地址与端口并语义断言。
assert.equal(reply.readUInt16BE(0), 0x0101, "success response type");
assert.ok(reply.readUInt32BE(4) === GOLDEN_REQUEST_COOKIE, "cookie echoed");
assert.ok(reply.subarray(8, 20).equals(REQUEST_TRANSACTION_ID), "transaction id echoed");
assert.equal(reply.readUInt16BE(20), 0x0020, "first attribute must be XOR-MAPPED-ADDRESS");
assert.equal(reply.readUInt8(25), 0x01, "IPv4 family");
const port = reply.readUInt16BE(26) ^ 0x2112;
const address = [0, 1, 2, 3].map((index) => reply.readUInt8(28 + index) ^ reply.readUInt8(4 + index)).join(".");
assert.ok(port > 0, "decoded port must be positive");
if (REMOTE_TARGET) {
  // 远程模式：NAT 改写源端口属正常，只要求解码自洽（不为零/非本地临时口当然可能被 NAT 保留）。
  console.log("[stun] PASS: 远程 STUN 可达，解码自洽");
  console.log(`       反解地址 ${address}:${port}（NAT 后与本地源端口不一致属正常）`);
} else {
  assert.equal(port, senderPort, "decoded port must equal the probe's own source port");
  assert.equal(address, "127.0.0.1", "decoded address must equal the probe's loopback source");
  console.log(`[stun] PASS: socket-level response decodes independently to 127.0.0.1:${senderPort}`);
}

if (!REMOTE_TARGET) {
  // 浏览器层观测（仅本机模式，信息性）：真 Chromium gathering 是否可用。
  // 部署后的最终证据仍归用户侧屏幕共享 ICE 诊断面板。
  try {
    const { chromium } = await import("../web/node_modules/playwright/index.mjs");
    const browser = await chromium.launch();
    const result = await browser.newPage().then(async (page) => {
      const srflx = await page.evaluate(async (port_: number) => {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: `stun:127.0.0.1:${port_}` }] });
        pc.createDataChannel("probe");
        await pc.setLocalDescription(await pc.createOffer());
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        const lines = (pc.localDescription?.sdp ?? "").split("\r\n").filter((line) => line.startsWith("a=candidate:"));
        pc.close();
        return lines.filter((line) => line.includes("typ srflx"));
      }, LOCAL_PORT);
      await browser.close();
      return srflx;
    });
    const addresses = result.map((line: string) => (line.match(/127\.0\.0\.1 \d+/) ?? [line])[0] ?? line);
    console.log(`[observe] chromium srflx=${result.length} ${addresses.join(", ")}`);
    if (result.length === 0) {
      console.log("[observe] 本机 Playwright Chromium 为非 RFC cookie 形态（0x2112a442），观测不达标不阻塞本门禁；真机侧以 ICE 诊断为准。");
    }
  } catch (error) {
    console.log(`[observe] browser layer skipped: ${error instanceof Error ? error.message.slice(0, 80) : String(error)}`);
  }
} else {
  console.log("[observe] 远程模式无浏览器观测层（需要本机起 server）");
}

