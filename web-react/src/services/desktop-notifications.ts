/** Desktop-notification opt-in for background-tab pokes. The boolean setting
 *  lives in localStorage; the permission prompt must be triggered from the
 *  toggle's own user gesture, so the page wires both through this module. */

const SETTING_STORAGE_KEY = "webspeak:desktop-notifications";

export type DesktopNotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

export function isDesktopNotificationSupported(): boolean {
  return typeof Notification !== "undefined";
}

export function readDesktopNotificationSetting(): boolean {
  try {
    return localStorage.getItem(SETTING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDesktopNotificationSetting(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(SETTING_STORAGE_KEY, "1");
    else localStorage.removeItem(SETTING_STORAGE_KEY);
  } catch {
    // Private-mode storage simply skips persistence.
  }
}

export function desktopNotificationPermission(): DesktopNotificationPermissionState {
  if (!isDesktopNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermissionState> {
  if (!isDesktopNotificationSupported()) return "unsupported";
  try {
    // Legacy Safari resolves the promise with undefined (callback API).
    const result = await Notification.requestPermission();
    return result ?? Notification.permission;
  } catch {
    return "denied";
  }
}

/** Pure policy core so tests can pin the decision without a Notification API. */
export function shouldShowBackgroundNotification(options: {
  settingEnabled: boolean;
  documentHidden: boolean;
  permission: string;
}): boolean {
  return options.settingEnabled && options.documentHidden && options.permission === "granted";
}

/** Foreground users already see the in-page banner; only a hidden tab raises a
 *  system notification, and only when the user opted in. */
export function showBackgroundTabNotification(settingEnabled: boolean, title: string, body: string): void {
  if (!shouldShowBackgroundNotification({
    settingEnabled,
    documentHidden: typeof document !== "undefined" && document.hidden,
    permission: isDesktopNotificationSupported() ? Notification.permission : "",
  })) return;
  try {
    new Notification(title, { body });
  } catch {
    // Mobile browsers without notification support throw on construction.
  }
}
