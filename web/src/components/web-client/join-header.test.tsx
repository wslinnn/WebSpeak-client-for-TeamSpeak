import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { JoinHeader } from "./join-header";
import type { SkinOption } from "./skin-switcher";

// RTL 视图测试增厚（报告 22 §3.D.3 可自主切片）：首页头的可达性与部件钩子契约。
// 皮肤/语言切换器的下拉交互归组件自身测试与真机走查，这里只钉静态结构。

const skinOptions: SkinOption[] = [
  { value: "builtin.light", label: "亮色" },
  { value: "builtin.dark", label: "暗色" },
];

function renderHeader() {
  return render(
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
      skinValue="builtin.light"
      skinOptions={skinOptions}
      onSkinChange={() => {}}
      skinMenuLabel="切换皮肤"
    />,
  );
}

afterEach(() => {
  cleanup();
});

test("header parts and gateway status are wired for skins and assistive tech", () => {
  renderHeader();
  expect(document.querySelector('[data-ws-part="home.header"]')).not.toBeNull();
  expect(document.querySelector('[data-ws-part="home.brand"]')).not.toBeNull();
  expect(document.querySelector('[data-ws-part="home.header-tools"]')).not.toBeNull();
  expect(document.querySelector('[data-ws-part="home.gateway-status"]')).toHaveTextContent("网关在线");
  expect(screen.getByRole("link", { name: "下载页" })).toHaveAttribute("href", "/download");
  expect(screen.getByRole("link", { name: "管理控制台" })).toHaveAttribute("href", "/admin");
});

test("migrated guide buttons carry the shared pillar classes (报告 22 批 1)", () => {
  renderHeader();
  for (const link of screen.getAllByRole("link")) {
    expect(link.className).toContain("secondary-button");
    expect(link.className).toContain("size-sm");
  }
});
