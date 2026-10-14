// @vitest-environment node
// 旧 web/test/voice-server-switch.test.mjs 平移（4 用例）。
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createStore, type StoreApi } from "zustand/vanilla";

import { createVoiceServerSwitch } from "./server-switch";

let voiceStore: StoreApi<{ errorCode: string }>;
let machine: ReturnType<typeof createVoiceServerSwitch>;

beforeEach(() => {
  voiceStore = createStore(() => ({ errorCode: "" }));
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
    voiceStore.setState({ errorCode: "SERVER_PASSWORD_REQUIRED" });
    voiceStore.setState({ errorCode: "INVALID_SERVER_PASSWORD" });
    expect(machine.store.getState().pending).toBe("Game Server");
    expect(machine.store.getState().failed).toBeNull();
    voiceStore.setState({ errorCode: "IDENTITY_REJECTED" });
    expect(machine.store.getState().pending).toBeNull();
    expect(machine.store.getState().failed).toBe("Game Server");
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
