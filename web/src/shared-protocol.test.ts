import { adminResponses } from "@shared/admin-responses.js";
import { parseServerMessage } from "@shared/server-messages.js";
import { expect, test } from "vitest";

test("@shared 运行时解析器在 React 侧可用：合法消息放行、未知消息忽略、畸形拒绝", () => {
  const connected = parseServerMessage({ type: "connected", tsClientId: 7 });
  expect(connected?.type).toBe("connected");
  expect(parseServerMessage({ type: "a-future-message" })).toBeNull();
  expect(parseServerMessage({ type: "connected", tsClientId: 0 })).toBeNull();
  expect(parseServerMessage("not-an-object")).toBeNull();
});

test("@shared 管理台校验器：只投影声明字段、联合约束生效", () => {
  const session = adminResponses.session({
    authenticated: true,
    mustChangePassword: false,
    csrfToken: "test-csrf",
    injected: "字段被投影丢弃",
  });
  expect(session).toEqual({ authenticated: true, mustChangePassword: false, csrfToken: "test-csrf" });
  expect(() => adminResponses.session({ authenticated: true, csrfToken: "t" })).toThrow();
});
