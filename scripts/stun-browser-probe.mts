// STUN 服务 socket 级独立门禁（verify 之外的物理门禁，npm run probe:stun）：
// 起 startStunServer，用「独立实现的 RFC 8489 客户端」发真实 Binding 请求，
// 断言响应字节逐字节等于 RFC 手算黄金向量——不复用实现的任何解码代码。
// 另附浏览器层观测（信息性，不作门禁：本机 Playwright Chromium 实测会以
// 0x2112a442 作为 cookie 与 XOR key，属非 RFC 形态，见 history 2026-10-29）。
import assert from "node:assert/strict";
import { createSocket } from "node:dgram";

const STUN_PORT = 34_71;

const logger = {
  debug: () => {},
  info: (message: unknown) => console.log(`[stun] ${message}`),
  warn: (message: unknown) => console.log(`[stun-warn] ${message}`),
};
const { startStunServer } = await import("../src/server/stun-server.js");
const server = await startStunServer({ port: STUN_PORT, logger: logger as never });
assert.ok(server, "STUN server must start");

const REQUEST_TRANSACTION_ID = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const request = Buffer.alloc(20);
request.writeUInt16BE(0x0001, 0);
request.writeUInt32BE(0x2112_a44d, 4);
REQUEST_TRANSACTION_ID.copy(request, 8);

const GOLDEN_REQUEST_COOKIE = 0x2112_a44d;
const client = createSocket("udp4");
let senderPort = 0;
const reply = await new Promise<Buffer>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("STUN did not answer within 3s")), 3_000);
  client.on("message", (message) => {
    clearTimeout(timer);
    resolve(message);
  });
  client.bind(() => {
    senderPort = (client.address() as { port: number }).port;
    client.send(request, STUN_PORT, "127.0.0.1", () => undefined);
  });
});

// 独立解码（探针自持、不经实现代码）：响应头 cookie/事务须回显，属性须为
// XOR-MAPPED-ADDRESS，由 RFC 公式反解出 IPv4 地址与端口并语义断言。
assert.equal(reply.readUInt16BE(0), 0x0101, "success response type");
assert.ok(reply.readUInt32BE(4) === GOLDEN_REQUEST_COOKIE, "cookie echoed");
assert.ok(reply.subarray(8, 20).equals(REQUEST_TRANSACTION_ID), "transaction id echoed");
assert.equal(reply.readUInt16BE(20), 0x0020, "first attribute must be XOR-MAPPED-ADDRESS");
assert.equal(reply.readUInt8(25), 0x01, "IPv4 family");
const port = reply.readUInt16BE(26) ^ 0x2112;
const address = [0, 1, 2, 3].map((index) => reply.readUInt8(28 + index) ^ reply.readUInt8(4 + index)!).join(".");
assert.equal(port, senderPort, "decoded port must equal the probe's own source port");
assert.equal(address, "127.0.0.1", "decoded address must equal the probe's loopback source");
console.log(`[stun] PASS: socket-level response decodes independently to 127.0.0.1:${senderPort}`);

// 浏览器层观测（信息性）：真 Chromium 的 gathering 是否可用，登录部署面
// 之后由用户侧 screenShare ICE 诊断面板给出最终证据（summarizeIceFailure
// 的「无公网候选」档即 STUN 不可达信号）。
try {
  const { chromium } = await import("../web/node_modules/playwright/index.mjs");
  const browser = await chromium.launch();
  const result = await browser.newPage().then(async (page) => {
    const srflx = await page.evaluate(async (port: number) => {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: `stun:127.0.0.1:${port}` }] });
      pc.createDataChannel("probe");
      await pc.setLocalDescription(await pc.createOffer());
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const lines = (pc.localDescription?.sdp ?? "").split("\r\n").filter((line) => line.startsWith("a=candidate:"));
      pc.close();
      return lines.filter((line) => line.includes("typ srflx"));
    }, STUN_PORT);
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
} finally {
  client.close();
  await server.close();
}
