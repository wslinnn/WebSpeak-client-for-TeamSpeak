// @vitest-environment jsdom
// fixed 模式房间内服务器面门控：switchServer 静默拒绝（网关会把切服改道回管理
// 员目标——假切换），open 模式切换照常开始，且门控读当次快照（模式热翻不粘滞）。
// serverLabel/rail 渲染门控由金样与冒烟覆盖（fixed 是冒烟网关的默认模式，收藏面
// 从此不在其基线里）。
import { cleanup, renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";

import { I18nContext } from "@/hooks/use-i18n";
import { VoiceSessionProvider } from "@/hooks/voice-session-provider";
import { useVoiceSession } from "@/hooks/useVoiceSession";
import { createHomeStore } from "./home-store";
import { useInRoomControllers } from "./use-inroom-controllers";
import type { FavoriteServer } from "@/services/local-persistence";
import type { HomeConnection } from "./home-connection";
import type { HomeStoreController } from "./home-store";

const otherServer: FavoriteServer = {
  id: "other.example.com:9987",
  label: "其他服",
  address: "other.example.com:9987",
};

let homeStore: HomeStoreController;
let connectCalls: string[];

function renderGating(isFixedMode: () => boolean) {
  function TestProviders({ children }: { children: ReactNode }) {
    return (
      <I18nContext.Provider value={{ language: "zh", setLanguage: () => undefined }}>
        <VoiceSessionProvider>{children}</VoiceSessionProvider>
      </I18nContext.Provider>
    );
  }
  return renderHook(
    (props: { isFixedMode: () => boolean }) => {
      const voice = useVoiceSession();
      return useInRoomControllers({
        voice,
        store: homeStore,
        connection: {
          canJoin: () => Boolean(homeStore.getState().nickname.trim()),
          doConnect: () => { connectCalls.push(homeStore.getState().serverHost); },
          cancelServerPassword: () => undefined,
        } as unknown as HomeConnection,
        isMobileViewport: false,
        viewportHeight: 800,
        getSettingsOpen: () => false,
        isFixedMode: props.isFixedMode,
        showToast: () => undefined,
        t: (key) => key,
        localizedMessage: (message) => message,
      });
    },
    { wrapper: TestProviders, initialProps: { isFixedMode } },
  );
}

beforeEach(() => {
  homeStore = createHomeStore();
  connectCalls = [];
  homeStore.setState({ serverHost: "voice.example.com", serverPort: "9987", nickname: "访客" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("fixed 模式下切服静默拒绝：不挂横幅、不改表单、不触发连接", () => {
  const { result } = renderGating(() => true);
  act(() => { result.current.switchServer(otherServer); });
  expect(result.current.switchState.pending).toBeNull();
  expect(homeStore.getState().serverHost).toBe("voice.example.com");
  expect(connectCalls).toEqual([]);
});

test("open 模式下切服照常开始：挂起横幅落地并发起连接", () => {
  const { result } = renderGating(() => false);
  act(() => { result.current.switchServer(otherServer); });
  expect(result.current.switchState.pending).toBe("其他服");
  expect(homeStore.getState().serverHost).toBe("other.example.com");
  expect(homeStore.getState().serverPort).toBe("9987");
  expect(connectCalls).toEqual(["other.example.com"]);
});

test("fixed 门控读的是当次快照：模式从 fixed 翻到 open 后切服恢复可用", () => {
  let fixed = true;
  const { result, rerender } = renderGating(() => fixed);
  act(() => { result.current.switchServer(otherServer); });
  expect(connectCalls).toEqual([]);
  fixed = false;
  rerender({ isFixedMode: () => fixed });
  act(() => { result.current.switchServer(otherServer); });
  expect(result.current.switchState.pending).toBe("其他服");
});
