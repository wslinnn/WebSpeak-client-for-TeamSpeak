import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { EventEmitter, once } from "node:events";
import { createServer } from "node:http";
import { setImmediate as nextTurn } from "node:timers/promises";
import { WebSocket } from "ws";
import pino from "pino";
import { generateIdentity } from "@echosixhiya/teamspeak-client";
import { VoiceBridge } from "./voice-bridge.js";
import { JoinTicketStore } from "./join-ticket.js";
import { normalizeTeamSpeakKickedReason } from "../errors.js";
import type { TSClient, TSDirectorySnapshot } from "./ts-client.js";

/*
 * connection-handler 的特征化测试：钉准入、身份租约、失败码与重连预算的
 * 当前行为，为后续拆分兜底。真实回环 HTTP/WebSocket + 原生编解码，只有
 * TeamSpeak SDK 被替身（同 voice-bridge.integration.test 的口径）。
 */

class TeamSpeakStub extends EventEmitter {
  disconnected = false;
  directory: TSDirectorySnapshot = { channels: [], clients: [] };
  connectImpl: () => Promise<void> = async () => {
    this.disconnected = false;
    this.emit("directorySnapshot", this.directory);
  };
  async connect() { await this.connectImpl(); }
  async disconnect() { this.disconnected = true; }
  getClientId() { return 1; }
  getChannelId() { return 1n; }
  isConnected() { return !this.disconnected; }
  async sendProtocolCommand() {}
  async setAccompanimentActive() {}
  sendVoice() {}
  sendWhisper() {}
  async getClientAvatar() { return null; }
  getIdentityString() { return "stub-identity"; }
}

interface BridgeHarness {
  bridge: VoiceBridge;
  sdk: TeamSpeakStub;
  tickets: JoinTicketStore;
  port: number;
  entries: Map<string, { id: string; ws: WebSocket; identityLeaseKey?: string }>;
  close(): Promise<void>;
}

async function startBridge(t: TestContext, configure?: (sdk: TeamSpeakStub) => void): Promise<BridgeHarness> {
  const sdk = new TeamSpeakStub();
  configure?.(sdk);
  const tickets = new JoinTicketStore();
  const bridge = new VoiceBridge({ joinTickets: tickets }, pino({ enabled: false }), undefined, {
    createTeamSpeakClient: () => sdk as unknown as TSClient,
  });
  const server = createServer();
  bridge.attach(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  return {
    bridge, sdk, tickets,
    port: address.port,
    entries: (bridge as unknown as { entries: BridgeHarness["entries"] }).entries,
    async close() {
      const wss = (bridge as unknown as { wss: { clients: Set<WebSocket> } }).wss;
      for (const peer of wss.clients) peer.terminate();
      wss.clients.clear();
      await bridge.shutdown();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

type OpenSocket = {
  socket: WebSocket;
  messages: Array<{ type: string; [key: string]: unknown }>;
  closed: Promise<number>;
};

function openSocket(harness: BridgeHarness, path = "/ws/voice"): OpenSocket {
  const socket = new WebSocket(`ws://127.0.0.1:${harness.port}${path}`);
  const messages: Array<{ type: string; [key: string]: unknown }> = [];
  socket.on("message", (data) => {
    try { messages.push(JSON.parse(data.toString())); } catch { /* 非 JSON 忽略 */ }
  });
  const closed = once(socket, "close").then(([code]) => code as number);
  return { socket, messages, closed };
}

/** 打开并等到 `connected` 快照（桩 connect 即发 directorySnapshot）。 */
async function join(harness: BridgeHarness, ticketOverrides: Record<string, unknown> = {}): Promise<OpenSocket> {
  const ticket = harness.tickets.create({
    target: { host: "voice.example.invalid", port: 9987 },
    nickname: "Tester",
    serverPassword: "",
    ...ticketOverrides,
  });
  const view = openSocket(harness, `/ws/voice?ticket=${ticket}`);
  const first = await Promise.race([
    once(view.socket, "message").then(() => view),
    once(view.socket, "close").then(() => view),
  ]);
  assert.equal(first, view);
  return view;
}

function waitFor(harness: BridgeHarness, view: OpenSocket, type: string, timeoutMs = 8_000): Promise<{ type: string; [key: string]: unknown }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`等待 ${type} 超时；已收：${view.messages.map((m) => m.type).join(",")}`)), timeoutMs);
    const check = () => {
      const found = view.messages.find((m) => m.type === type);
      if (found) { clearTimeout(timer); resolve(found); return true; }
      return false;
    };
    if (check()) return;
    view.socket.on("message", () => { check(); });
    void harness;
  });
}

test("无票据的 socket 被 4001 拒绝", { timeout: 5_000 }, async t => {
  const h = await startBridge(t);
  t.after(() => h.close());
  const view = openSocket(h);
  assert.equal(await view.closed, 4001);
});

test("无效记忆身份以结构化 IDENTITY_INVALID 失败（4003）", { timeout: 5_000 }, async t => {
  const h = await startBridge(t);
  t.after(() => h.close());
  const view = await join(h, { identity: "@@not-a-valid-identity@@" });
  assert.equal(view.messages[0]?.type, "connectionFailed");
  assert.equal(view.messages[0]?.code, "IDENTITY_INVALID");
  assert.equal(await view.closed, 4003);
});

test("同对端第 11 条并发会话被 4006 PEER_SESSION_LIMIT 拒绝", { timeout: 15_000 }, async t => {
  const h = await startBridge(t);
  t.after(() => h.close());
  const views: OpenSocket[] = [];
  for (let i = 0; i < 10; i++) views.push(await join(h, { nickname: `Peer-${i}` }));
  assert.equal(h.bridge.getActiveCount(), 10);
  const eleventh = openSocket(h, `/ws/voice?ticket=${h.tickets.create({
    target: { host: "voice.example.invalid", port: 9987 }, nickname: "Peer-10", serverPassword: "",
  })}`);
  assert.equal(await eleventh.closed, 4006);
});

test("同记忆身份的第二条连接逐出第一条（切服跟随连接成败）", { timeout: 10_000 }, async t => {
  // generateIdentity(1)：级别 1 一次研磨即达——不传参会在 SDK 的研磨循环里
  // 以 undefined 目标级纯 CPU 打转（本文件曾因此整体挂死）。
  const identity = String(generateIdentity(1));
  const h = await startBridge(t);
  t.after(() => h.close());
  const first = await join(h, { identity, rememberIdentity: true });
  const second = await join(h, { identity, rememberIdentity: true });
  await waitFor(h, second, "connected");
  await nextTurn();
  assert.equal(h.entries.size, 1);
  const surviving = [...h.entries.values()][0]!;
  assert.notEqual(surviving.ws, first.socket);
  assert.notEqual(await Promise.race([first.closed.then(() => "closed"), new Promise((r) => setTimeout(() => r("open"), 2_000))]), "open");
});

test("首连 TeamSpeak 失败以结构化错误码失败并释放槽位（4003）", { timeout: 5_000 }, async t => {
  const h = await startBridge(t, (sdk) => {
    sdk.connectImpl = async () => { throw new Error("read ECONNREFUSED 203.0.113.1:9987"); };
  });
  t.after(() => h.close());
  const view = await join(h);
  assert.equal(view.messages[0]?.type, "connectionFailed");
  assert.equal(typeof view.messages[0]?.code, "string");
  assert.notEqual(view.messages[0]?.code, "");
  assert.equal(await view.closed, 4003);
  assert.equal(h.bridge.getActiveCount(), 0);
});

test("传输层掉线进入 1/2/4s 重连预算，恢复后回发 reconnected", { timeout: 15_000 }, async t => {
  const h = await startBridge(t);
  t.after(() => h.close());
  const view = await join(h);
  await waitFor(h, view, "connected");
  // 掉线后首次重拨仍失败，第二次（~3s）前恢复连接成功。
  h.sdk.connectImpl = async () => { throw new Error("read ECONNRESET"); };
  h.sdk.emit("disconnected", Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }));
  const reconnecting1 = await waitFor(h, view, "reconnecting");
  assert.equal(reconnecting1.attempt, 1);
  assert.equal(view.messages.find((m) => m.type === "disconnected")?.recoverable, true);
  setTimeout(() => {
    h.sdk.connectImpl = async () => {
      h.sdk.disconnected = false;
      h.sdk.emit("directorySnapshot", h.sdk.directory);
    };
  }, 1_500).unref?.();
  const reconnected = await waitFor(h, view, "reconnected");
  assert.ok(reconnected, "恢复成功必须回发 reconnected");
});

test("连接后被踢是终态：connectionFailed + 会话拆除", { timeout: 5_000 }, async t => {
  const h = await startBridge(t);
  t.after(() => h.close());
  const view = await join(h);
  await waitFor(h, view, "connected");
  h.sdk.emit("kicked", normalizeTeamSpeakKickedReason("you are not welcome", 4));
  const failure = await waitFor(h, view, "connectionFailed");
  assert.equal(typeof failure.code, "string");
  assert.notEqual(await Promise.race([view.closed.then(() => "closed"), new Promise((r) => setTimeout(() => r("open"), 3_000))]), "open");
  assert.equal(h.bridge.getActiveCount(), 0);
});

test("控制消息突发第 31 条起被限流且通知一秒内只发一条", { timeout: 8_000 }, async t => {
  const h = await startBridge(t);
  t.after(() => h.close());
  const view = await join(h);
  await waitFor(h, view, "connected");
  for (let i = 0; i < 40; i++) {
    view.socket.send(JSON.stringify({ type: "definitelyNotACommand" }));
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const limited = view.messages.filter((m) => m.type === "error" && m.error && (m.error as { code?: string }).code === "RATE_LIMITED");
  assert.ok(limited.length >= 1, "限流后必须发结构化通知");
  assert.ok(limited.length <= 2, `一秒合并窗口内通知不应超过 2 条，实际 ${limited.length}`);
});
