import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { ConfirmDialogHost } from "./components/app/confirm-host";
import { confirmDialog } from "./lib/confirm";

afterEach(cleanup);

test("确认弹窗按 Promise 结算：确认 → true", async () => {
  render(<ConfirmDialogHost />);
  expect(screen.queryByRole("alertdialog")).toBeNull();
  const pending = confirmDialog({ title: "删除收藏？", confirmLabel: "删除", cancelLabel: "取消", danger: true });
  expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "删除" }));
  await expect(pending).resolves.toBe(true);
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
});

test("确认弹窗取消 → false", async () => {
  render(<ConfirmDialogHost />);
  const pending = confirmDialog({ title: "断开连接？", confirmLabel: "断开", cancelLabel: "留下" });
  fireEvent.click(await screen.findByRole("button", { name: "留下" }));
  await expect(pending).resolves.toBe(false);
});

test("新请求顶替挂起请求：旧 Promise 按取消结算", async () => {
  render(<ConfirmDialogHost />);
  const first = confirmDialog({ title: "第一个", confirmLabel: "A", cancelLabel: "B" });
  const second = confirmDialog({ title: "第二个", confirmLabel: "C", cancelLabel: "D" });
  await expect(first).resolves.toBe(false);
  expect(screen.getByText("第二个")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "C" }));
  await expect(second).resolves.toBe(true);
});
