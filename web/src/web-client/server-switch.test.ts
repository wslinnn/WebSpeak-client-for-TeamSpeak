// @vitest-environment node
// 旧 web/test/voice-server-switch.test.mjs 平移（4 用例）；无关错误帧甄别与
// 「connected → settle」接线用例为报告 21 P0-2/L3 新增。
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createStore, type StoreApi } from "zustand/vanilla";

import { createVoiceServerSwitch, settleSwitchOnConnected } from "./server-switch";

let voiceStore: StoreApi<{ connectionFailureCode: string; errorCode: string }>;
let machine: ReturnType<typeof createVoiceServerSwitch>;

beforeEach(() => {
  voiceStore = createStore(() => ({ connectionFailureCode: "", errorCode: "" }));
  machine = createVoiceServerSwitch({ voiceStore });
});

afterEach(() => {
  machine.dispose();
  vi.useRealTimers();
});

describe("语音内切服横幅状态机", () => {
  test("a switch stays pending through password prompts and fails on other errors", () => {
    machine.begin("Game Server");
    expect(machine.store.getState().pending).toBe("Game Server");
    voiceStore.setState({ connectionFailureCode: "SERVER_PASSWORD_REQUIRED" });
    voiceStore.setState({ connectionFailureCode: "INVALID_SERVER_PASSWORD" });
    expect(machine.store.getState().pending).toBe("Game Server");
    expect(machine.store.getState().failed).toBeNull();
    voiceStore.setState({ connectionFailureCode: "IDENTITY_REJECTED" });
    expect(machine.store.getState().pending).toBeNull();
    expect(machine.store.getState().failed).toBe("Game Server");
  });

  test("an ordinary error frame does not fail a pending switch", () => {
    machine.begin("Game Server");
    // 普通命令错误落 errorCode（连接来源之外）：挂起横幅必须原样保留。
    voiceStore.setState({ errorCode: "REQUEST_FAILED" });
    expect(machine.store.getState().pending).toBe("Game Server");
    expect(machine.store.getState().failed).toBeNull();
  });

  test("a connect settles the switch and clears a stale failure banner", () => {
    machine.begin("Game Server");
    machine.fail();
    expect(machine.store.getState().failed).toBe("Game Server");
    machine.begin("Other Server");
    expect(machine.store.getState().failed).toBeNull();
    expect(machine.store.getState().pending).toBe("Other Server");
    machine.settle();
    expect(machine.store.getState().pending).toBeNull();
    expect(machine.store.getState().failed).toBeNull();
    expect(machine.active()).toBe(false);
  });

  test("a gateway that never answers flips the banner to failed after 20s", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    machine.begin("Game Server");
    vi.advanceTimersByTime(19_999);
    expect(machine.store.getState().pending).toBe("Game Server");
    vi.advanceTimersByTime(1);
    expect(machine.store.getState().pending).toBeNull();
    expect(machine.store.getState().failed).toBe("Game Server");
  });

  test("settling cancels the safety timer and later failures are no-ops", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    machine.begin("Game Server");
    machine.settle();
    vi.advanceTimersByTime(60_000);
    expect(machine.store.getState().failed).toBeNull();
    machine.fail();
    expect(machine.store.getState().failed).toBeNull();
    expect(machine.store.getState().pending).toBeNull();
  });
});

describe("settleSwitchOnConnected 接线", () => {
  test("a connected transition settles the pending switch; kept and re-armed states do not", () => {
    const connectedStore = createStore(() => ({ connected: false }));
    const stop = settleSwitchOnConnected(connectedStore, machine);
    machine.begin("Game Server");
    connectedStore.setState({ connected: true });
    expect(machine.store.getState().pending).toBeNull();
    expect(machine.store.getState().failed).toBeNull();

    // 已处于连接态时的同值写入、以及未连接方向的翻转，都不触发结算。
    machine.begin("Other Server");
    connectedStore.setState({ connected: true });
    connectedStore.setState({ connected: false });
    expect(machine.store.getState().pending).toBe("Other Server");

    // 退订后连接翻转不再结算（控制器生命周期外的写入不得影响横幅）。
    stop();
    machine.settle();
    machine.begin("Third Server");
    connectedStore.setState({ connected: true });
    expect(machine.store.getState().pending).toBe("Third Server");
  });
});
