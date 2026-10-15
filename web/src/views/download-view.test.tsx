import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { I18nProvider } from "@/components/app/i18n-provider";
import { loadTranslations } from "@/hooks/use-i18n";
import { createWebClientMessages } from "@/i18n/messages";

import DownloadView from "./download-view";

const jaTitle = createWebClientMessages("ja").t("downloadTitle");

function stubFetch(payload: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: ok ? 200 : 500 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// 语言包为模块级单例动态 import（就绪前视图渲染 null）：断言一律等待式。
function renderDownload() {
  localStorage.setItem("webspeak:language", "zh");
  return render(
    <I18nProvider>
      <DownloadView />
    </I18nProvider>,
  );
}

// 语言包首动态 import 在 vitest 里是按需转译（秒级），先于测试计时器预热到
// 进程单例：useWebClientMessages 的 effect 命中已解析 promise，微任务即渲染。
beforeAll(async () => { await loadTranslations(); }, 30000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

test("加载中显示获取文案，release 到达后渲染版本/大小/SHA 与 APK 动作", async () => {
  // fetch 由测试手动放行：语言包加载窗口内视图渲染 null 且 effect 已跑，
  // 只有压住 fetch 才能确定性地观察到 loading 态。
  let releaseFetch!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { releaseFetch = resolve; })));
  renderDownload();
  expect(await screen.findByText("正在获取版本信息…")).toBeInTheDocument();
  releaseFetch(new Response(JSON.stringify({ release: { version: "2.4.1", apkUrl: "/downloads/ts6droid.apk", apkSizeBytes: 1.5 * 1024 * 1024, apkSha256: "feedc0de" } }), { status: 200 }));
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

  fireEvent.click(screen.getByRole("button", { name: "语言" }));
  const option = await screen.findByRole("option", { name: /日本語/ });
  // 自绘切换器的选中发生在 pointerdown（旧版语义平价，见组件内注）。
  fireEvent.pointerDown(option);

  await waitFor(() => expect(localStorage.getItem("webspeak:language")).toBe("ja"));
  expect(screen.getByRole("heading", { name: jaTitle })).toBeInTheDocument();
});

test("页面锚点：皮肤根 + data-ws-page=download + 挂载后钉内置皮肤", async () => {
  stubFetch({ release: null });
  const { container } = renderDownload();
  // 语言包加载窗口内视图渲染 null：等根出现再断言锚点。
  const root = await waitFor(() => {
    const element = container.querySelector(".download-page");
    expect(element).not.toBeNull();
    return element;
  });
  expect(root?.getAttribute("data-ws-page")).toBe("download");
  expect(root?.classList.contains("ws-skin-root")).toBe(true);
  await waitFor(() => expect(root?.getAttribute("data-ws-skin")).toMatch(/^builtin\.(light|dark)$/));
  expect(screen.getByRole("link", { name: /返回首页/ }).getAttribute("href")).toBe("/");
});
