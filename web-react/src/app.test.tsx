import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";

import { AppRoutes } from "./App";
import { I18nProvider } from "./components/app/i18n-provider";

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

test("默认路由渲染 WebClient 壳：皮肤根锚点 + data-ws-page=home + data-ws-route=webclient", async () => {
  stubMatchMedia();
  renderRoutes("/");
  const shell = await waitFor(() => {
    const element = document.querySelector(".web-client.ws-skin-root");
    expect(element).not.toBeNull();
    return element;
  });
  expect(shell?.getAttribute("data-ws-page")).toBe("home");
  // 挂载后补的 applyTheme 会把内置皮肤 id 钉到根元素（内置皮肤 CSS 的作用域锚点）。
  expect(shell?.getAttribute("data-ws-skin")).toMatch(/^builtin\.(light|dark)$/);
  await waitFor(() => expect(document.documentElement.dataset.wsRoute).toBe("webclient"));
});

test("/join 与 / 同壳", async () => {
  stubMatchMedia();
  renderRoutes("/join");
  await waitFor(() => expect(document.querySelector(".web-client.ws-skin-root")).not.toBeNull());
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
