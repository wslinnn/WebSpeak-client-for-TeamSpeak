import assert from "node:assert/strict";
import test from "node:test";
import {
  desktopNotificationPermission,
  isDesktopNotificationSupported,
  readDesktopNotificationSetting,
  requestDesktopNotificationPermission,
  shouldShowBackgroundNotification,
  writeDesktopNotificationSetting,
} from "./desktop-notifications.js";

test("background notifications require opt-in, hidden tab and granted permission", () => {
  assert.equal(shouldShowBackgroundNotification({ settingEnabled: true, documentHidden: true, permission: "granted" }), true);
  assert.equal(shouldShowBackgroundNotification({ settingEnabled: true, documentHidden: false, permission: "granted" }), false);
  assert.equal(shouldShowBackgroundNotification({ settingEnabled: false, documentHidden: true, permission: "granted" }), false);
  assert.equal(shouldShowBackgroundNotification({ settingEnabled: true, documentHidden: true, permission: "default" }), false);
  assert.equal(shouldShowBackgroundNotification({ settingEnabled: true, documentHidden: true, permission: "denied" }), false);
});

test("without a Notification API the feature reports unsupported and never grants", async () => {
  if (isDesktopNotificationSupported()) return; // browser-style runtime: skip the Node-only assertions
  assert.equal(desktopNotificationPermission(), "unsupported");
  assert.equal(await requestDesktopNotificationPermission(), "unsupported");
});

test("the setting falls back to disabled when storage is unavailable", () => {
  if (typeof localStorage !== "undefined") return; // browser-style runtime: skip the Node-only assertions
  assert.equal(readDesktopNotificationSetting(), false);
  assert.doesNotThrow(() => writeDesktopNotificationSetting(true));
});
