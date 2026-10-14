import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { I18nProvider } from "@/components/app/i18n-provider";
import { createWebClientMessages } from "@/i18n/messages";

import DownloadView from "./download-view";

const jaTitle = createWebClientMessages("ja").t("downloadTitle");

function stubFetch(payload: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: ok ? 200 : 500 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderDownload() {
  localStorage.setItem("webspeak:language", "zh");
  return render(
    <I18nProvider>
      <DownloadView />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("加载中显示获取文案，release 到达后渲染版本/大小/SHA 与 APK 动作", async () => {
  stubFetch({ release: { version: "2.4.1", apkUrl: "/downloads/ts6droid.apk", apkSizeBytes: 1.5 * 1024 * 1024, apkSha256: "feedc0de" } });
  renderDownload();
  expect(screen.getByText("正在获取版本信息…")).toBeInTheDocument();
  expect(await screen.findByText("2.4.1")).toBeInTheDocument();
  expect(screen.getByText("1.5 MB")).toBeInTheDocument();
  expect(screen.getByText("feedc0de")).toBeInTheDocument();
  const action = screen.getByRole("link", { name: "下载 APK" });
  expect(action.getAttribute("href")).toBe("/downloads/ts6droid.apk");
});

test("apkSizeBytes 为 0 时不渲染大小行；apkSha256 缺失时不渲染 SHA 行", async () => {
  stubFetch({ release: { version: "3.0", apkUrl: "/a.apk" } });
  renderDownload();
  expect(await screen.findByText("3.0")).toBeInTheDocument();
  expect(screen.queryByText("大小")).toBeNull();
  expect(screen.queryByText("SHA256")).toBeNull();
});

test("响应非 2xx → 不可用态 + Releases 兜底链接", async () => {
  stubFetch({}, false);
  renderDownload();
  expect(await screen.findByText("暂时无法获取最新版本信息，可直接前往 Releases 页面。")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "查看全部版本" }).getAttribute("href")).toBe("https://github.com/wslinnn/TS6_Droid_CN/releases");
});

test("响应体畸形（缺 release / 缺 apkUrl）→ 不可用态", async () => {
  stubFetch({ release: { version: "9" } });
  renderDownload();
  expect(await screen.findByText(/暂时无法获取最新版本信息/)).toBeInTheDocument();
});

test("fetch 拒绝 → 不可用态且不抛未处理 rejection", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("gateway offline");
  }));
  renderDownload();
  expect(await screen.findByText(/暂时无法获取最新版本信息/)).toBeInTheDocument();
});

test("语言切换经切换器持久化 webspeak:language 且界面即时换语", async () => {
  stubFetch({ release: null });
  renderDownload();
  expect(await screen.findByText("下载客户端")).toBeInTheDocument();

  fireEvent.keyDown(screen.getByRole("button", { name: "语言" }), { key: "Enter" });
  const option = await screen.findByRole("menuitem", { name: /日本語/ });
  fireEvent.click(option);

  await waitFor(() => expect(localStorage.getItem("webspeak:language")).toBe("ja"));
  expect(screen.getByRole("heading", { name: jaTitle })).toBeInTheDocument();
});

test("页面锚点：皮肤根 + data-ws-page=download + 挂载后钉内置皮肤", async () => {
  stubFetch({ release: null });
  const { container } = renderDownload();
  const root = container.querySelector(".download-page");
  expect(root?.getAttribute("data-ws-page")).toBe("download");
  expect(root?.classList.contains("ws-skin-root")).toBe(true);
  await waitFor(() => expect(root?.getAttribute("data-ws-skin")).toMatch(/^builtin\.(light|dark)$/));
  expect(screen.getByRole("link", { name: /返回首页/ }).getAttribute("href")).toBe("/");
});
