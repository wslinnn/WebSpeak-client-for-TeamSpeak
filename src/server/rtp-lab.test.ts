import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { pino } from "pino";
import { mountRtpLabIfEnabled } from "./rtp-lab.js";

test("the RTP lab mounts only under WEBSPEAK_RTP_DEBUG=1", async t => {
  const previous = process.env.WEBSPEAK_RTP_DEBUG;
  delete process.env.WEBSPEAK_RTP_DEBUG;
  t.after(() => {
    if (previous !== undefined) process.env.WEBSPEAK_RTP_DEBUG = previous;
  });
  const app = express();
  mountRtpLabIfEnabled(app, { logger: pino({ enabled: false }) });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => {
    server.closeAllConnections?.();
    server.close();
  });
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const page = await fetch(`${base}/_rtp-lab`);
  assert.equal(page.status, 404, "no lab routes exist when the env flag is off");
  await page.body?.cancel();
});

test("lab posts require same origin and the offer endpoint is per-peer budgeted (报告 21 S7)", async t => {
  const previous = process.env.WEBSPEAK_RTP_DEBUG;
  process.env.WEBSPEAK_RTP_DEBUG = "1";
  t.after(() => {
    if (previous === undefined) delete process.env.WEBSPEAK_RTP_DEBUG;
    else process.env.WEBSPEAK_RTP_DEBUG = previous;
  });
  const app = express();
  mountRtpLabIfEnabled(app, { logger: pino({ enabled: false }) });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => {
    server.closeAllConnections?.();
    server.close();
  });
  await new Promise<void>((resolve) => server.on("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  // GET 页面与脚本保持开放（调试页本身）。
  const page = await fetch(`${base}/_rtp-lab`);
  assert.equal(page.status, 200);
  await page.body?.cancel();

  // 跨源 offer/mode 一律 403，不进限流记账。
  const crossOrigin = await fetch(`${base}/_rtp-lab/offer`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.example" },
    body: "{}",
  });
  assert.equal(crossOrigin.status, 403);
  await crossOrigin.body?.cancel();
  const crossOriginMode = await fetch(`${base}/_rtp-lab/mode`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.example" },
    body: "{}",
  });
  assert.equal(crossOriginMode.status, 403);
  await crossOriginMode.body?.cancel();

  // 同源 offer（origin 与 URL host 一致）：非法 offer 也算一次尝试，第 7 次 429。
  let tooMany = 0;
  for (let attempt = 0; attempt < 7; attempt++) {
    const response = await fetch(`${base}/_rtp-lab/offer`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: "{}",
    });
    if (response.status === 429) tooMany++;
    else {
      assert.equal(response.status, 400, "shape-invalid offers are rejected before any peer is built");
      await response.body?.cancel();
    }
  }
  assert.equal(tooMany, 1, "the 7th same-origin offer hits the per-peer budget");
});
