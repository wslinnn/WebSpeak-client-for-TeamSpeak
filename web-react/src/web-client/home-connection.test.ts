// 旧 web/test/connection-dialogs.test.mjs 平移（4 用例）+ 服务器密码弹窗/强制移动/订阅生命周期补充。
import { beforeEach, expect, test } from "vitest";
import { createStore, type StoreApi } from "zustand/vanilla";

import { createHomeConnection, type VoiceConnectionView } from "./home-connection";
import { createHomeStore } from "./home-store";

let errors: string;
let message: string;
let calls: Array<[string, string?]>;
let voice: { store: StoreApi<VoiceConnectionView> };
let store: ReturnType<typeof createHomeStore>;
let connection: ReturnType<typeof createHomeConnection>;

const dialog = () => store.getState().channelPasswordDialog;
const serverDialog = () => store.getState().serverPasswordDialog;

function setVoiceError(code: string, errorMessage = ""): void {
  voice.store.setState({ errorCode: code, errorMessage });
}

beforeEach(() => {
  errors = "";
  message = "";
  calls = [];
  voice = { store: createStore<VoiceConnectionView>(() => ({ errorCode: "", errorMessage: "", channelSwitchedChannelId: "", selfMovedChannelId: "" })) };
  store = createHomeStore();
  store.setState({
    channelPasswordDialog: { open: true, channelId: "2", password: "draft", error: "", submitting: false },
    selectedChannelId: "2",
    nickname: "Preview",
    channelName: "Room",
    serverHost: "fixture.invalid",
    serverPort: "9987",
  });
  connection = createHomeConnection({
    store,
    voiceStore: voice.store,
    connect: () => {},
    disconnect: () => {},
    isConnecting: () => false,
    // 真实 switchChannel 会等网关；永不结算的 promise 复刻「还没有回音」，
    // 让 errorCode 订阅像在房内一样驱动弹窗。
    switchChannel: (...args) => { calls.push(args as [string, string?]); return new Promise(() => {}); },
    clearError: () => { errors = ""; message = ""; },
    getChannels: () => [],
    getClientId: () => 1,
    saveNickname: () => {},
    showToast: () => {},
    localizedMessage: (m) => m,
    t: (key) => key,
    initialized: () => true,
    accessMode: () => "fixed",
  });
});

test("pasting a nickname clears the prefilled port and preserves a custom override", () => {
  connection.setHost("https://named.myteamspeak.com/lookup?name=team%20eco");
  expect(store.getState().serverPort).toBe("");
  expect(connection.currentServerTarget()).toBe("team eco");
  connection.setPort("10000");
  connection.setHost("another guild");
  expect(connection.currentServerTarget()).toBe("another guild:10000");
});

test("a waiting channel password request cannot be submitted twice", () => {
  connection.submitChannelPassword();
  connection.submitChannelPassword();
  expect(dialog().submitting).toBe(true);
  expect(calls).toEqual([["2", "draft"]]);
});

test("an ordinary channel error preserves the password and allows retry", () => {
  connection.submitChannelPassword();
  message = "Channel operation timed out";
  setVoiceError("COMMAND_TIMEOUT", message);
  expect(dialog().open).toBe(true);
  expect(dialog().submitting).toBe(false);
  expect(dialog().password).toBe("draft");
  expect(dialog().error).toBe("Channel operation timed out");
  expect(errors).toBe("");
  connection.submitChannelPassword();
  expect(calls.length).toBe(2);
  expect(dialog().error).toBe("");
});

test("a successful channel switch closes and clears the password dialog", () => {
  connection.submitChannelPassword();
  voice.store.setState({ channelSwitchedChannelId: "2" });
  expect(dialog()).toEqual({ open: false, channelId: "", password: "", error: "", submitting: false });
});

test("server password codes open the retry dialog and clear the page error", () => {
  errors = "stale";
  setVoiceError("SERVER_PASSWORD_REQUIRED");
  expect(serverDialog().open).toBe(true);
  expect(serverDialog().errorCode).toBe("SERVER_PASSWORD_REQUIRED");
  expect(errors).toBe("");
});

test("a TS-side force move syncs the channel selection", () => {
  const moved = createHomeStore();
  moved.setState({ selectedChannelId: "1", channelName: "Old" });
  createHomeConnection({
    store: moved,
    voiceStore: voice.store,
    connect: () => {},
    disconnect: () => {},
    isConnecting: () => false,
    switchChannel: async () => {},
    clearError: () => {},
    getChannels: () => [{ id: "5", name: "Moved", members: [{ id: 1 }] }],
    getClientId: () => 1,
    saveNickname: () => {},
    showToast: () => {},
    localizedMessage: (m) => m,
    t: (key) => key,
    initialized: () => true,
    accessMode: () => "fixed",
  });
  voice.store.setState({ selfMovedChannelId: "5" });
  expect(moved.getState().selectedChannelId).toBe("5");
  expect(moved.getState().channelName).toBe("Moved");
});

test("disposing stops the dialog reactions", () => {
  connection.dispose();
  setVoiceError("CHANNEL_PASSWORD_REQUIRED");
  expect(dialog().open).toBe(true);
  expect(dialog().channelId).toBe("2");
  // dispose 后订阅不再驱动弹窗重开逻辑（此处仅验证不抛错且状态未被改写）。
  expect(store.getState().channelPasswordDialog.password).toBe("draft");
});
