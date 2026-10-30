// @vitest-environment jsdom
// 装配层接线集成测试（store slice 级断言，不逐组件单测）：use-web-client-controllers
// 里两段内联跨 store 订阅——「连接即收藏 + 通知音 / fixed 模式写独立密码键」与
// fixed 模式记忆密码预填。其余装配（settleSwitchOnConnected 等）已有独立接线测
// 试，见 server-switch.test。
import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import type { LocalPreferences } from "../services/local-persistence";

import { I18nContext } from "@/hooks/use-i18n";
import { VoiceSessionProvider } from "@/hooks/voice-session-provider";

const preferenceStore = vi.hoisted(() => ({ current: undefined as LocalPreferences | undefined }));
const savedFavorites = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock("../services/local-persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/local-persistence")>();
  type Preferences = Parameters<typeof actual.saveLocalPreferences>[0];
  return {
    ...actual,
    async listFavorites() { return []; },
    async saveFavorite(favorite: unknown) { savedFavorites.current.push(favorite); },
    async loadStoredIdentity() { return null; },
    async loadLocalPreferences(): Promise<Preferences> {
      return preferenceStore.current ?? { schemaVersion: 1, volumesByUid: {} };
    },
    async saveLocalPreferences(preferences: Preferences): Promise<void> {
      preferenceStore.current = { ...(preferenceStore.current ?? { schemaVersion: 1, volumesByUid: {} }), ...preferences };
    },
  };
});

import { useWebClientControllers } from "./use-web-client-controllers";

beforeEach(() => {
  localStorage.clear();
  savedFavorites.current = [];
  preferenceStore.current = undefined;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderControllers() {
  function TestProviders({ children }: { children: ReactNode }) {
    return (
      <I18nContext.Provider value={{ language: "zh", setLanguage: () => undefined }}>
        <VoiceSessionProvider>{children}</VoiceSessionProvider>
      </I18nContext.Provider>
    );
  }
  return renderHook(() => useWebClientControllers(), { wrapper: TestProviders });
}

test("连接成功的边沿触发连接即收藏与通知音，断开重连再触发", async () => {
  const { result } = renderControllers();
  const voice = result.current.voice;
  const notify = vi.spyOn(voice, "playNotification").mockImplementation(() => undefined);
  const { store, publicConfig } = result.current;
  act(() => {
    publicConfig.store.setState({ accessMode: "open" });
    store.setState({ serverHost: "voice.example.com", serverPort: "9987", nickname: "访客" });
    voice.store.setState({ connected: true });
  });
  await waitFor(() => expect(notify).toHaveBeenCalledWith("connected"));
  await waitFor(() => {
    const favorite = store.getState().favoriteServers.find((item) => item.address === "voice.example.com:9987");
    expect(favorite, "连接目标应 upsert 进收藏（连接即收藏）").toBeTruthy();
    expect(favorite?.nickname).toBe("访客");
  });
  // 通知音只在 false→true 边沿：保持 connected 不再触发。
  const edges = notify.mock.calls.length;
  act(() => {
    voice.store.setState({ reconnecting: true });
    voice.store.setState({ connected: false, reconnecting: false });
    voice.store.setState({ connected: true });
  });
  await waitFor(() => expect(notify.mock.calls.length).toBeGreaterThan(edges));
});

test("fixed 模式从独立键回填记忆密码，连接进行中不回填", async () => {
  const { result } = renderControllers();
  const voice = result.current.voice;
  const { store, publicConfig } = result.current;
  act(() => {
    localStorage.setItem("webspeak:fixed-server-password", "stored-pw");
    publicConfig.store.setState({ accessMode: "fixed" });
  });
  await waitFor(() => expect(store.getState().serverPassword).toBe("stored-pw"));
  // 连接进行中（含刷新恢复）不回填：open+屏蔽预填模式会把恢复意图带回的真实
  // 目标清空，覆盖即 member-server-header 裸奔事故的回归。
  act(() => {
    voice.store.setState({ connecting: true });
    store.setState({ serverPassword: "" });
  });
  expect(store.getState().serverPassword).toBe("");
});

test("fixed 连接成功写独立密码键且不建收藏", async () => {
  const { result } = renderControllers();
  const voice = result.current.voice;
  const { store, publicConfig } = result.current;
  act(() => {
    publicConfig.store.setState({ accessMode: "fixed" });
    store.setState({ serverHost: "voice.example.com", serverPort: "9987", nickname: "访客", serverPassword: "pw-fixed" });
    voice.store.setState({ connected: true });
  });
  await waitFor(() => expect(localStorage.getItem("webspeak:fixed-server-password")).toBe("pw-fixed"));
  expect(savedFavorites.current, "fixed 不再借收藏条目当密码键").toEqual([]);
});

test("open 模式连接成功仍走连接即收藏，不写独立密码键", async () => {
  const { result } = renderControllers();
  const voice = result.current.voice;
  const { store, publicConfig } = result.current;
  act(() => {
    publicConfig.store.setState({ accessMode: "open" });
    store.setState({ serverHost: "voice.example.com", serverPort: "9987", nickname: "访客", serverPassword: "pw-open" });
    voice.store.setState({ connected: true });
  });
  await waitFor(() => {
    const favorite = savedFavorites.current.find((item) => (item as { address: string }).address === "voice.example.com:9987");
    expect(favorite, "连接目标应 upsert 进收藏（连接即收藏）").toBeTruthy();
  });
  expect(localStorage.getItem("webspeak:fixed-server-password")).toBeNull();
});
