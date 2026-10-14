// @vitest-environment node
// 旧 web/test/admin-view.test.mjs 的 22 条 characterization 平移：无头 Vue 挂载 →
// 直接实例化框架无关控制器。HTTP 时序由 fetch 桩重排；不主张 DOM 布局与真实认证。
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { createAdminController, type AdminController } from "./admin-controller";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const settings = (extra: Record<string, unknown> = {}) => ({
  target: "voice.example:9987", hasPassword: false, accessMode: "fixed", siteName: "Original",
  welcomeText: "", welcomeTextEn: "", welcomeTextDe: "", welcomeTextRu: "", welcomeTextJa: "",
  welcomeDefaults: { zh: "", en: "", de: "", ru: "", ja: "" },
  lastTestAt: null, lastTestLatencyMs: null, lastTestError: null,
  webRtcEnabled: false, webRtcUdpStart: 40000, webRtcUdpEnd: 40099,
  internalPort: 3040, updatedAt: "2026-10-01T00:00:00Z", ...extra,
});
const overview = {
  gateway: { status: "running", version: "test", uptimeSeconds: 0 },
  teamSpeak: { target: "voice.example:9987", status: "unknown", lastTestAt: null, latencyMs: null, lastError: null },
  sessions: { active: 0, peak: 0, limit: 100 }, recentEvents: [], legacyConfigImported: false,
};
const sessionRecord = (nickname: string) => ({ id: nickname, nickname, target: "voice.example:9987", state: "connected", createdAt: "2026-10-01T00:00:00Z", ageSeconds: 0, tsClientId: 1, channelId: "1", memberCount: 1 });
const defaults = (path: string) => ({
  "/session": { authenticated: true, mustChangePassword: false, csrfToken: "test-csrf" },
  "/server": settings(), "/overview": overview, "/sessions": { sessions: [] },
  "/diagnostics": { gateway: { version: "test", node: "test", platform: "test", arch: "test" }, database: { schemaVersion: 1 }, sessions: { created: 0 } },
  "/logs?limit=100": { available: false, entries: [], sessions: [] }, "/audit?limit=50": { events: [] },
  "/skins": { skins: [], defaultSkinId: "builtin.light" },
})[path as "/session"];

let handler: (path: string, init?: RequestInit) => Promise<Response>;
let controller: AdminController;
let navigated: string[];
let currentPath: string;

function mount(path = "/admin/server") {
  currentPath = path;
  navigated = [];
  controller = createAdminController({
    navigate: (next) => { navigated.push(next); currentPath = next; },
    getCurrentPath: () => currentPath,
    getLanguage: () => "zh",
  });
}

/** 旧 mount() 平价：初始会话探测 + 数据装载完成后返回。 */
async function mountAndWait(path = "/admin/server") {
  mount(path);
  await controller.loadAdminView();
  expect(controller.store.getState().loading).toBe(false);
}

const serverState = () => controller.serverSettings.store.getState();
const operationsState = () => controller.operations.store.getState();
const skinsState = () => controller.skins.store.getState();
const view = () => controller.store.getState();

function deferred<T = unknown>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  handler = (path) => Promise.resolve(json(defaults(path)));
  vi.stubGlobal("fetch", ((url: string | URL, init?: RequestInit) =>
    handler(String(url).replace("/api/admin", ""), init)) as typeof fetch);
  vi.stubGlobal("window", { confirm: () => true });
});

afterEach(() => {
  controller?.dispose();
  vi.unstubAllGlobals();
});

test("nickname defaults load and save without forcing the voice port", async () => {
  handler = (path) => Promise.resolve(json(path === "/server" ? settings({ target: "team eco" }) : defaults(path)));
  await mountAndWait();
  expect(serverState().form.address).toBe("team eco");
  expect(serverState().form.port).toBe("");
  controller.serverSettings.setField("address", "voice.example.com");
  expect(serverState().form.port).toBe("9987");
  controller.serverSettings.setField("address", "another guild");
  expect(serverState().form.port).toBe("");
  let submittedTarget = "";
  handler = (path, init) => {
    if (path === "/server" && init?.method === "PUT") {
      submittedTarget = (JSON.parse(String(init.body)) as { target: string }).target;
      return Promise.resolve(json({ ok: true, settings: settings({ target: "another guild" }) }));
    }
    return Promise.resolve(json(defaults(path)));
  };
  await controller.serverSettings.saveServerSettings();
  expect(submittedTarget).toBe("another guild");
  expect(serverState().form.port).toBe("");
  expect(view().errorMessage).toBe("");
});

test("saving settings preserves edits made after the request started", async () => {
  await mountAndWait();
  const save = deferred<Response>();
  handler = (path, init) => path === "/server" && init?.method === "PUT" ? save.promise : Promise.resolve(json(defaults(path)));
  controller.serverSettings.setField("siteName", "Submitted");
  controller.serverSettings.setSecretField("submitted-test-password", "replace");
  const pending = controller.serverSettings.saveServerSettings();
  controller.serverSettings.setField("siteName", "New draft");
  controller.serverSettings.setSecretField("new-test-password", "replace");
  save.resolve(json({ ok: true, settings: settings({ siteName: "Submitted", hasPassword: true }) }) as Response);
  await pending;
  expect(serverState().form.siteName).toBe("New draft");
  expect(serverState().form.serverPassword).toBe("new-test-password");
  expect(serverState().form.passwordAction).toBe("replace");
  expect(serverState().form.hasPassword).toBe(true);
});

test("changing the target while probing discards the old server result", async () => {
  await mountAndWait();
  const probe = deferred<Response>();
  handler = (path) => path === "/server/test" ? probe.promise : Promise.resolve(json(defaults(path)));
  const pending = controller.serverSettings.testServerConnection();
  controller.serverSettings.setField("address", "replacement.example");
  probe.resolve(json({ ok: true, checkType: "protocol", passwordVerified: false, latencyMs: 20, serverName: "Old", requiresPassword: false }) as Response);
  await pending;
  expect(serverState().testResult).toBeNull();
  expect(serverState().form.lastTestAt).toBeNull();
});

test("an older operations refresh cannot overwrite the newer snapshot", async () => {
  await mountAndWait();
  const first = deferred<Response>();
  let queries = 0;
  handler = (path) => path === "/sessions"
    ? (++queries === 1 ? first.promise : Promise.resolve(json({ sessions: [sessionRecord("New")] })))
    : Promise.resolve(json(defaults(path)));
  const older = controller.operations.loadOperations();
  await controller.operations.loadOperations();
  first.resolve(json({ sessions: [sessionRecord("Old")] }) as Response);
  await older;
  expect(operationsState().sessions.map((item) => item.nickname)).toEqual(["New"]);
});

test("unmounting the admin page prevents late login from navigating back", async () => {
  handler = (path) => Promise.resolve(json(path === "/session" ? { authenticated: false } : defaults(path)));
  await mountAndWait("/admin/login");
  const login = deferred<Response>();
  handler = (path) => path === "/login" ? login.promise : Promise.resolve(json(defaults(path)));
  const pending = controller.login();
  controller.dispose();
  login.resolve(json({ ok: true, mustChangePassword: false, csrfToken: "new-test-csrf" }) as Response);
  await pending;
  expect(navigated).not.toContain("/admin");
  expect(view().screen).toBe("login");
});

test("refreshing skins preserves a default selection edited during the request", async () => {
  await mountAndWait("/admin/skins");
  const skins = deferred<Response>();
  handler = (path) => path === "/skins" ? skins.promise : Promise.resolve(json(defaults(path)));
  const pending = controller.skins.loadSkinCatalog();
  controller.skins.store.setState({ defaultId: "builtin.dark" });
  skins.resolve(json({ skins: [], defaultSkinId: "builtin.light" }) as Response);
  await pending;
  expect(skinsState().defaultId).toBe("builtin.dark");
});

test("a successful settings save clears submitted secrets and updates their stored status", async () => {
  await mountAndWait();
  controller.serverSettings.setSecretField("submitted-test-password", "replace");
  handler = (path, init) => Promise.resolve(json(path === "/server" && init?.method === "PUT"
    ? { ok: true, settings: settings({ hasPassword: true }) } : defaults(path)));
  await controller.serverSettings.saveServerSettings();
  expect(serverState().form.serverPassword).toBe("");
  expect(serverState().form.passwordAction).toBe("keep");
  expect(serverState().form.hasPassword).toBe(true);
  expect(serverState().saving).toBe(false);
  expect(view().errorMessage).toBe("");
});

test("ICE settings load, submit and preserve edits made during a pending save", async () => {
  await mountAndWait();
  const network = { webRtcPublicHost: "media.example.com", webRtcIpv6Enabled: true, webRtcStunServer: "stun:stun.example.com:3478" };
  handler = (path) => Promise.resolve(json(path === "/server" ? settings(network) : defaults(path)));
  await controller.serverSettings.loadServerSettings();
  for (const [key, value] of Object.entries(network)) {
    expect(serverState().form[key as keyof typeof network]).toBe(value);
  }
  let submitted: Record<string, unknown> = {};
  const save = deferred<Response>();
  handler = (path, init) => {
    if (path !== "/server" || init?.method !== "PUT") return Promise.resolve(json(defaults(path)));
    submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
    for (const [key, value] of Object.entries(network)) expect(submitted[key]).toBe(value);
    return save.promise;
  };
  const pending = controller.serverSettings.saveServerSettings();
  controller.serverSettings.setField("webRtcPublicHost", "new-media.example.com");
  controller.serverSettings.setField("webRtcIpv6Enabled", false);
  controller.serverSettings.setField("webRtcStunServer", "");
  save.resolve(json({ ok: true, settings: settings(network) }) as Response);
  await pending;
  expect(serverState().form.webRtcPublicHost).toBe("new-media.example.com");
  expect(serverState().form.webRtcIpv6Enabled).toBe(false);
  expect(serverState().form.webRtcStunServer).toBe("");
});

test("duplicate saves submit once and failed saves retain the draft", async () => {
  await mountAndWait();
  const save = deferred<Response>();
  let calls = 0;
  handler = (path, init) => path === "/server" && init?.method === "PUT"
    ? (++calls, save.promise) : Promise.resolve(json(defaults(path)));
  controller.serverSettings.setField("siteName", "Unsaved");
  controller.serverSettings.setSecretField("unsaved-test-password", "replace");
  const pending = controller.serverSettings.saveServerSettings();
  await controller.serverSettings.saveServerSettings();
  expect(calls).toBe(1);
  expect(serverState().saving).toBe(true);
  save.resolve(json({ code: "REQUEST_FAILED" }, 500) as Response);
  await pending;
  expect(serverState().saving).toBe(false);
  expect(serverState().form.siteName).toBe("Unsaved");
  expect(serverState().form.serverPassword).toBe("unsaved-test-password");
  expect(view().errorMessage).not.toBe("");
});

test("only the latest probe publishes its result and a valid probe still updates the timestamp", async () => {
  await mountAndWait();
  const older = deferred<Response>();
  let probes = 0;
  const result = (name: string) => ({ ok: true, checkType: "protocol", passwordVerified: false, latencyMs: 20, serverName: name, requiresPassword: false });
  handler = (path) => path === "/server/test" ? (++probes === 1 ? older.promise : Promise.resolve(json(result("New")))) : Promise.resolve(json(defaults(path)));
  const pending = controller.serverSettings.testServerConnection();
  controller.serverSettings.setField("address", "new.example");
  await controller.serverSettings.testServerConnection();
  older.resolve(json(result("Old")) as Response);
  await pending;
  expect(serverState().testResult?.serverName).toBe("New");
  expect(serverState().form.lastTestLatencyMs).toBe(20);
  expect(serverState().form.lastTestAt).not.toBeNull();
  expect(serverState().testing).toBe(false);
  expect(view().errorMessage).toBe("");
});

test("an obsolete refresh failure cannot clear a newer spinner or publish an error", async () => {
  await mountAndWait("/admin/operations");
  const older = deferred<Response>();
  const latest = deferred<Response>();
  let calls = 0;
  handler = (path) => path === "/sessions" ? (++calls === 1 ? older.promise : latest.promise) : Promise.resolve(json(defaults(path)));
  const first = controller.operations.loadOperations();
  const second = controller.operations.loadOperations();
  older.resolve(json({ code: "REQUEST_FAILED" }, 500) as Response);
  await first;
  expect(operationsState().loading).toBe(true);
  expect(view().errorMessage).toBe("");
  latest.resolve(json({ sessions: [sessionRecord("New")] }) as Response);
  await second;
  expect(operationsState().loading).toBe(false);
  expect(operationsState().sessions[0]?.nickname).toBe("New");
});

test("leaving a management section discards its pending read and returning loads fresh data", async () => {
  await mountAndWait("/admin/operations");
  const older = deferred<Response>();
  handler = (path) => path === "/sessions" ? older.promise : Promise.resolve(json(defaults(path)));
  const pending = controller.operations.loadOperations();
  controller.store.setState({ errorMessage: "Previous section error" });
  controller.handleRouteChange("/admin/server");
  older.resolve(json({ sessions: [sessionRecord("Old")] }) as Response);
  await pending;
  expect(operationsState().sessions).toEqual([]);
  expect(operationsState().loading).toBe(false);
  expect(view().errorMessage).toBe("");
  handler = (path) => Promise.resolve(json(path === "/sessions" ? { sessions: [sessionRecord("Current")] } : defaults(path)));
  controller.handleRouteChange("/admin/operations");
  await vi.waitFor(() => expect(operationsState().sessions[0]?.nickname).toBe("Current"));
});

test("a failed logout preserves the authenticated draft and a successful logout clears private state", async () => {
  await mountAndWait("/admin/operations");
  controller.serverSettings.setField("siteName", "Draft");
  controller.serverSettings.setSecretField("private-test-password", "replace");
  handler = (path) => Promise.resolve(path === "/logout" ? json({ code: "REQUEST_FAILED" }, 500) : json(defaults(path)));
  await controller.logout();
  expect(view().screen).toBe("admin");
  expect(serverState().form.siteName).toBe("Draft");
  expect(serverState().form.serverPassword).toBe("private-test-password");
  expect(view().loggingOut).toBe(false);
  expect(view().errorMessage).not.toBe("");
  handler = (path) => Promise.resolve(json(path === "/logout" ? { ok: true } : defaults(path)));
  await controller.logout();
  expect(view().screen).toBe("login");
  expect(view().csrfToken).toBe("");
  expect(serverState().form.serverPassword).toBe("");
  expect(operationsState().diagnostics.node).toBe("");
  expect(navigated.at(-1)).toBe("/admin/login");
});

test("an old 401 cannot log out a newly authenticated page", async () => {
  await mountAndWait("/admin/operations");
  const old = deferred<Response>();
  handler = (path) => path === "/sessions" ? old.promise : Promise.resolve(json(path === "/logout" ? { ok: true } : defaults(path)));
  const pending = controller.operations.loadOperations();
  await controller.logout();
  handler = (path) => Promise.resolve(json(path === "/login" ? { ok: true, mustChangePassword: false, csrfToken: "new-test-csrf" } : defaults(path)));
  await controller.login();
  old.resolve(json({ code: "AUTH_REQUIRED" }, 401) as Response);
  await pending;
  expect(view().screen).toBe("admin");
  expect(view().csrfToken).toBe("new-test-csrf");
  expect(navigated.at(-1)).toBe("/admin");
  expect(view().errorMessage).toBe("");
});

test("a current 401 resets the page without leaving an error or loading spinner", async () => {
  await mountAndWait("/admin/operations");
  controller.serverSettings.setSecretField("private-test-password", "replace");
  handler = () => Promise.resolve(json({ code: "AUTH_REQUIRED" }, 401));
  await controller.operations.loadOperations();
  expect(view().screen).toBe("login");
  expect(serverState().form.serverPassword).toBe("");
  expect(operationsState().diagnostics.version).toBe("");
  expect(operationsState().loading).toBe(false);
  expect(view().errorMessage).toBe("");
  expect(navigated.at(-1)).toBe("/admin/login");
});

test("unmounting during a backup download cannot trigger a late file download", async () => {
  await mountAndWait("/admin/operations");
  const backup = deferred<Blob>();
  let downloads = 0;
  vi.stubGlobal("document", { createElement: () => { downloads++; return { click() { /* noop */ } }; } });
  handler = (path) => path === "/backup" ? backup.promise.then(blob => new Response(blob)) : Promise.resolve(json(defaults(path)));
  const pending = controller.operations.downloadBackup();
  controller.dispose();
  backup.resolve(new Blob([new Uint8Array([0, 1, 255])]));
  await pending;
  expect(downloads).toBe(0);
  expect(view().errorMessage).toBe("");
});

test("skin mutations are serialized and failure restores the last saved default", async () => {
  await mountAndWait("/admin/skins");
  const save = deferred<Response>();
  let calls = 0;
  handler = (path) => path === "/skins/default" ? (++calls, save.promise) : Promise.resolve(json(defaults(path)));
  controller.skins.store.setState({ defaultId: "builtin.dark" });
  const pending = controller.skins.saveSkinDefault();
  await controller.skins.saveSkinDefault();
  expect(calls).toBe(1);
  expect(controller.skins.store.getState().defaultSaving).toBe(true);
  save.resolve(json({ code: "REQUEST_FAILED" }, 500) as Response);
  await pending;
  expect(skinsState().defaultId).toBe("builtin.light");
  expect(skinsState().defaultSaving).toBe(false);
  expect(skinsState().error).not.toBe("");
});

test("a settings response cannot restore probe metadata after the draft password changes", async () => {
  await mountAndWait();
  const save = deferred<Response>();
  handler = (path, init) => path === "/server" && init?.method === "PUT" ? save.promise : Promise.resolve(json(defaults(path)));
  const pending = controller.serverSettings.saveServerSettings();
  controller.serverSettings.setSecretField("new-test-password", "replace");
  save.resolve(json({ ok: true, settings: settings({ lastTestAt: "2020-01-01T00:00:00Z", lastTestLatencyMs: 30 }) }) as Response);
  await pending;
  expect(serverState().form.lastTestAt).toBeNull();
  expect(serverState().form.lastTestLatencyMs).toBeNull();
});

test("a settings response cannot overwrite a newer probe completed during the save", async () => {
  await mountAndWait();
  const save = deferred<Response>();
  handler = (path, init) => path === "/server" && init?.method === "PUT" ? save.promise : Promise.resolve(json(path === "/server/test"
    ? { ok: true, checkType: "protocol", passwordVerified: false, latencyMs: 10, serverName: "Current", requiresPassword: false } : defaults(path)));
  const pending = controller.serverSettings.saveServerSettings();
  await controller.serverSettings.testServerConnection();
  const testedAt = serverState().form.lastTestAt;
  save.resolve(json({ ok: true, settings: settings({ lastTestAt: "2020-01-01T00:00:00Z", lastTestLatencyMs: 30 }) }) as Response);
  await pending;
  expect(serverState().form.lastTestAt).toBe(testedAt);
  expect(serverState().form.lastTestLatencyMs).toBe(10);
});

test("a forced password change routes to the change-password screen without loading admin data", async () => {
  let overviewLoaded = false;
  handler = (path) => {
    if (path === "/session") return Promise.resolve(json({ authenticated: true, mustChangePassword: true, csrfToken: "forced-csrf" }));
    if (path === "/overview") overviewLoaded = true;
    return Promise.resolve(json(defaults(path)));
  };
  await mountAndWait("/admin");
  expect(view().screen).toBe("change-password");
  expect(view().csrfToken).toBe("forced-csrf");
  expect(navigated).toContain("/admin/change-password");
  expect(overviewLoaded).toBe(false);
});

test("a login that requires a password change lands on the change-password screen", async () => {
  handler = (path) => Promise.resolve(json(path === "/session" ? { authenticated: false } : defaults(path)));
  await mountAndWait("/admin/login");
  let submissions = 0;
  handler = (path) => {
    if (path === "/session") return Promise.resolve(json({ authenticated: false }));
    if (path === "/login") {
      submissions++;
      return Promise.resolve(json({ ok: true, mustChangePassword: true, csrfToken: "pending-csrf" }));
    }
    return Promise.resolve(json(defaults(path)));
  };
  await controller.login();
  expect(view().screen).toBe("change-password");
  expect(view().csrfToken).toBe("pending-csrf");
  expect(view().loginPassword).toBe("");
  expect(navigated).toContain("/admin/change-password");
  expect(submissions).toBe(1);
});

test("change-password validates locally, then submits once and enters the console", async () => {
  handler = (path) => Promise.resolve(json(path === "/session" ? { authenticated: true, mustChangePassword: true, csrfToken: "forced-csrf" } : defaults(path)));
  await mountAndWait("/admin");
  let submissions = 0;
  let submittedBody: unknown = null;
  controller.setNewPassword("short");
  await controller.changePassword();
  expect(view().errorMessage).not.toBe("");
  controller.setNewPassword("first-long-test-password");
  controller.setConfirmNewPassword("second-long-test-password");
  await controller.changePassword();
  expect(view().errorMessage).not.toBe("");
  handler = (path, init) => {
    if (path === "/session") return Promise.resolve(json({ authenticated: true, mustChangePassword: false, csrfToken: "rotated-csrf" }));
    if (path === "/change-password") {
      submissions++;
      submittedBody = JSON.parse(String(init?.body));
      return Promise.resolve(json({ ok: true }));
    }
    return Promise.resolve(json(defaults(path)));
  };
  controller.setNewPassword("final-long-test-password");
  controller.setConfirmNewPassword("final-long-test-password");
  await controller.changePassword();
  expect(submissions).toBe(1);
  expect(submittedBody).toEqual({ newPassword: "final-long-test-password" });
  expect(view().newPassword).toBe("");
  expect(view().confirmNewPassword).toBe("");
  expect(view().screen).toBe("admin");
  expect(navigated.at(-1)).toBe("/admin");
});

test("a rejected login keeps the login screen and reports the failure", async () => {
  handler = (path) => Promise.resolve(json(path === "/session" ? { authenticated: false } : defaults(path)));
  await mountAndWait("/admin/login");
  handler = (path) => Promise.resolve(json(path === "/session" ? { authenticated: false }
    : path === "/login" ? json({ code: "INVALID_PASSWORD" }, 401) : { authenticated: false }));
  await controller.login();
  expect(view().screen).toBe("login");
  expect(view().submitting).toBe(false);
  expect(view().csrfToken).toBe("");
  expect(view().errorMessage).not.toBe("");
});
