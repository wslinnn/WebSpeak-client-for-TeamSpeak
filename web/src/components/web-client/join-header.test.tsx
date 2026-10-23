import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { JoinHeader } from "./join-header";
import { TooltipProvider } from "@/components/ui/tooltip";

// RTL 视图测试增厚：首页头的可达性与部件钩子契约。切换器交互归组件自身
// 测试与真机走查，这里只钉静态结构。

function renderHeader() {
  return render(
    <TooltipProvider>
      <JoinHeader
        brandName="WebSpeak"
        brandSubtitle="TEAMSPEAK 第三方网页客户端"
        gatewayStatus="网关在线"
        downloadLabel="下载页"
        adminLabel="管理控制台"
        moreLabel="更多"
        language="zh"
        onLanguageChange={() => {}}
        languageMenuLabel="切换语言"
        theme={{ dark: false, onToggle: () => {}, label: "切换到深色主题" }}
      />
    </TooltipProvider>,
  );
}

afterEach(() => {
  cleanup();
});

test("header parts and gateway status are wired for assistive tech", () => {
  renderHeader();
  expect(document.querySelector('[data-ws-part="home.header"]')).not.toBeNull();
  expect(document.querySelector('[data-ws-part="home.brand"]')).not.toBeNull();
  expect(document.querySelector('[data-ws-part="home.header-tools"]')).not.toBeNull();
  expect(document.querySelector('[data-ws-part="home.gateway-status"]')).toHaveTextContent("网关在线");
  expect(screen.getByRole("link", { name: "下载页" })).toHaveAttribute("href", "/download");
  expect(screen.getByRole("link", { name: "管理控制台" })).toHaveAttribute("href", "/admin");
  expect(document.querySelector('[data-ws-part="theme.toggle"]')).not.toBeNull();
});

test("guide links render through the shared Button primitive (asChild)", () => {
  renderHeader();
  for (const link of screen.getAllByRole("link")) {
    expect(link.getAttribute("data-slot")).toBe("button");
    expect(link.className).toContain("guide-button");
  }
});
