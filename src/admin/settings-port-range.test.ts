import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AdminService, type AdminSettingsInput } from "./admin-service.js";
import type { Logger } from "../logger.js";
import { WebSpeakDatabase, type SettingsUpdate } from "../persistence/database.js";
import { DEFAULT_WEBRTC_UDP_PORT_RANGE, MIN_WEBRTC_UDP_PORT_RANGE_PORTS } from "../server/webrtc-config.js";

const noop = () => {};
const logger: Logger = { debug: noop, info: noop, warn: noop, error: noop, child: () => logger };

const input = (overrides: Partial<AdminSettingsInput> = {}): AdminSettingsInput => ({
  target: "8.8.8.8#9988", accessMode: "open", siteName: "WebSpeak", welcomeText: "",
  webRtcEnabled: false, serverPassword: "", passwordAction: "replace",
  ...overrides,
});

async function fixture(context: test.TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "webspeak-port-range-"));
  const database = new WebSpeakDatabase(path.join(directory, "webspeak.db"));
  const service = new AdminService(database, Buffer.alloc(32, 1), logger, path.join(directory, "missing-config.json"), async () => ({
    ok: true, protocol: "ts3", latencyMs: 1, serverName: "Test", requiresPassword: false,
  }));
  await service.initialize();
  context.after(async () => {
    database.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { database, service };
}

// 报告 21 F2：100 端口 ≈ 50 会话（每会话 2 枚 socket）会在会话上限内耗尽并静默丢候选，
// 默认值抬到能覆盖上限的跨度，管理台只允许「改动时」选更窄的范围。
test("the default UDP range covers the full session ceiling", async (context) => {
  const { service } = await fixture(context);
  const settings = service.getAdminSettings();
  assert.equal(settings.webRtcUdpStart, DEFAULT_WEBRTC_UDP_PORT_RANGE[0]);
  assert.equal(settings.webRtcUdpEnd, DEFAULT_WEBRTC_UDP_PORT_RANGE[1]);
  assert.ok(
    DEFAULT_WEBRTC_UDP_PORT_RANGE[1] - DEFAULT_WEBRTC_UDP_PORT_RANGE[0] + 1 >= MIN_WEBRTC_UDP_PORT_RANGE_PORTS,
    "the shipped default must span at least the session ceiling x sockets per session",
  );
});

test("a changed UDP range below the session-capacity span is rejected while unchanged legacy ranges still save", async (context) => {
  const { database, service } = await fixture(context);
  // 新库按 v11 迁移默认开启 WebRTC：改范围前先按真实流程关闭（范围不变，合法）。
  service.updateSettings(input({}));

  assert.throws(
    () => service.updateSettings(input({ webRtcUdpStart: 40000, webRtcUdpEnd: 40099 })),
    (error: unknown) => (error as { code?: string }).code === "INVALID_WEBRTC_PORT_RANGE",
    "narrowing the range below sessions x sockets per session must be refused",
  );
  assert.equal(database.getSettings().webRtcUdpEnd, DEFAULT_WEBRTC_UDP_PORT_RANGE[1], "a refused save must not persist");

  // 恰好达到最小跨度：接受。
  const minimumEnd = 40000 + MIN_WEBRTC_UDP_PORT_RANGE_PORTS - 1;
  service.updateSettings(input({ webRtcUdpStart: 40000, webRtcUdpEnd: minimumEnd }));
  assert.equal(database.getSettings().webRtcUdpEnd, minimumEnd);

  // 历史窄范围（迁移前保存的）沿用：只改其它字段的保存不得被跨度校验阻塞。
  const seeded = database.getSettings();
  const seed: SettingsUpdate = {
    siteName: seeded.siteName, welcomeText: seeded.welcomeText,
    accessMode: seeded.accessMode, tsHost: seeded.tsHost, tsPort: seeded.tsPort,
    tsTarget: seeded.tsTarget, tsPasswordEncrypted: seeded.tsPasswordEncrypted,
    webRtcEnabled: seeded.webRtcEnabled, webRtcUdpStart: 40000, webRtcUdpEnd: 40099,
  };
  database.updateSettings(seed, "TEST_SEED");
  service.updateSettings(input({ siteName: "Renamed" }));
  assert.equal(database.getSettings().siteName, "Renamed");
  assert.equal(database.getSettings().webRtcUdpEnd, 40099, "the legacy range is carried over untouched");
});
