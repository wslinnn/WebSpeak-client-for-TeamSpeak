import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { AppRoutes } from "./App";
import { I18nProvider } from "./components/app/i18n-provider";
import { loadWebClientMessages } from "@/hooks/use-i18n";

// 语言包按语言动态 import 在 vitest 里是按需转译（秒级），先于测试计时器预热
// 全部语言到进程缓存：useWebClientMessages 的 effect 命中已解析 promise，
// 微任务即渲染。
beforeAll(async () => {
  await Promise.all((["zh", "en"] as const).map((language) => loadWebClientMessages(language)));
}, 30000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.wsRoute;
});

function renderRoutes(initialPath: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppRoutes />
      </MemoryRouter>
    </I18nProvider>,
  );
}

/** jsdom 没有 matchMedia；WebClient 视图用 740 断点驱动移动态。 */
function stubMatchMedia(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }));
}

test("默认路由渲染 WebClient 壳：客户端根锚点 + data-ws-page=home + data-ws-route=webclient", async () => {
  stubMatchMedia();
  renderRoutes("/");
  // 整跑并行负载下模块图与首渲染可超默认 1s（/download 用例同款先例）。
  const shell = await waitFor(() => {
    const element = document.querySelector(".web-client.ws-skin-root");
    expect(element).not.toBeNull();
    return element;
  }, { timeout: 5000 });
  expect(shell?.getAttribute("data-ws-page")).toBe("home");
  await waitFor(() => expect(document.documentElement.dataset.wsRoute).toBe("webclient"));
});

test("/join 与 / 同壳", async () => {
  stubMatchMedia();
  renderRoutes("/join");
  await waitFor(() => expect(document.querySelector(".web-client.ws-skin-root")).not.toBeNull(), { timeout: 5000 });
});

test("/download 渲染 DownloadView 壳并标记 data-ws-route=download", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ release: null }), { status: 200 })));
  renderRoutes("/download");
  const shell = await waitFor(() => {
    const element = document.querySelector(".download-page.ws-skin-root");
    expect(element).not.toBeNull();
    return element;
  }, { timeout: 5000 });
  expect(shell?.getAttribute("data-ws-page")).toBe("download");
  await waitFor(() => expect(document.documentElement.dataset.wsRoute).toBe("download"));
});

test("/admin/* 渲染管理台（未认证 → login 屏）：无皮肤根、data-ws-route=admin", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ authenticated: false }), { status: 200 })));
  renderRoutes("/admin/login");
  const shell = await waitFor(() => {
    const element = document.querySelector(".admin-root .login-page");
    expect(element).not.toBeNull();
    return element;
  }, { timeout: 5000 });
  expect(shell).toBeInTheDocument();
  expect(document.querySelector(".ws-skin-root")).toBeNull();
  expect(document.querySelector("[data-ws-page]")).toBeNull();
  await waitFor(() => expect(document.documentElement.dataset.wsRoute).toBe("admin"));
});
