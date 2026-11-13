import assert from "node:assert/strict";
import test from "node:test";
import { ScreenShareCoordinator, type ScreenShareParticipant } from "./screen-share-coordinator.js";
import { parseServerMessage, type ServerMessage } from "../shared/server-messages.js";
import { MAX_SCREEN_SHARE_STREAMS } from "../shared/screen-share.js";

/** 目的单一的夹具：这里只关心「频道里的流多于协议上限时服务端发什么」。
 *  send 会先过一遍共享校验器，所以一条超限列表（客户端会整条判为畸形而丢弃）
 *  在测试里必然当场失败。 */
function fixture() {
  const entries = new Map<string, ScreenShareParticipant>();
  const messages: ServerMessage[] = [];
  const send = (to: string, message: ServerMessage) => {
    assert.ok(parseServerMessage(JSON.parse(JSON.stringify(message))), `invalid message: ${message.type}`);
    messages.push(message);
  };
  const coordinator = new ScreenShareCoordinator(entries, send, { debug() {}, info() {}, warn() {} });
  const participant = (id: string, clientId: number): ScreenShareParticipant => {
    const entry: ScreenShareParticipant = {
      id, nickname: id, screenPeerId: `peer-${id}`, target: { host: "first.example", port: 9987 },
      members: new Map([[clientId, {}]]),
      channelTree: [{ id: "1", parentID: "0", name: "Room", members: [{ id: clientId, nickname: id }] }],
      tsClient: {
        getClientId: () => clientId, getChannelId: () => 1n, isConnected: () => true,
        sendProtocolCommand: async () => {},
      },
    };
    entries.set(id, entry);
    return entry;
  };
  const start = (entry: ScreenShareParticipant): void => {
    coordinator.handleMessage(entry, { type: "screenShareStart", requestId: "start", name: "Screen", audio: false }, message => send(entry.id, message));
  };
  const list = (entry: ScreenShareParticipant): ServerMessage & { type: "screenShareList" } => {
    coordinator.handleMessage(entry, { type: "screenShareList" }, message => send(entry.id, message));
    const message = messages.at(-1);
    assert.ok(message?.type === "screenShareList");
    return message;
  };
  return { participant, start, list };
}

test("a channel with more streams than the protocol cap is truncated, not dropped", () => {
  const f = fixture();
  const viewer = f.participant("viewer", 2);
  // 66 个共享者同频道（极端拓扑）：整条超限列表会被客户端校验器判为畸形，
  // 用户一张共享卡都看不到，所以服务端必须按同一上限截断。
  for (let index = 0; index < 66; index++) f.start(f.participant(`owner-${index}`, index + 10));
  assert.equal(f.list(viewer).streams.length, MAX_SCREEN_SHARE_STREAMS);
});
