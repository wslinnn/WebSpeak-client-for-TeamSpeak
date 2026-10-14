import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test } from "vitest";

import { AppRoutes } from "./App";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.wsRoute;
});

test("默认路由渲染 WebClient 壳：皮肤根锚点 + data-ws-page=home + data-ws-route=webclient", async () => {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  const root = await screen.findByText("WebSpeak");
  expect(root).toBeInTheDocument();
  const shell = document.querySelector(".web-client.ws-skin-root");
  expect(shell).not.toBeNull();
  expect(shell?.getAttribute("data-ws-page")).toBe("home");
  // 挂载后补的 applyTheme 会把内置皮肤 id 钉到根元素（内置皮肤 CSS 的作用域锚点）。
  expect(shell?.getAttribute("data-ws-skin")).toMatch(/^builtin\.(light|dark)$/);
  await waitFor(() => expect(document.documentElement.dataset.wsRoute).toBe("webclient"));
});

test("/join 与 / 同壳", async () => {
  render(
    <MemoryRouter initialEntries={["/join"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  expect(await screen.findByText("WebSpeak")).toBeInTheDocument();
});

test("/download 渲染 DownloadView 壳并标记 data-ws-route=download", async () => {
  render(
    <MemoryRouter initialEntries={["/download"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Download")).toBeInTheDocument();
  expect(document.querySelector(".download-page.ws-skin-root")).not.toBeNull();
  await waitFor(() => expect(document.documentElement.dataset.wsRoute).toBe("download"));
});

test("/admin/* 渲染 AdminView 壳：无皮肤根、data-ws-route=admin", async () => {
  render(
    <MemoryRouter initialEntries={["/admin/login"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Admin")).toBeInTheDocument();
  expect(document.querySelector(".app-shell")).not.toBeNull();
  expect(document.querySelector(".ws-skin-root")).toBeNull();
  await waitFor(() => expect(document.documentElement.dataset.wsRoute).toBe("admin"));
});
