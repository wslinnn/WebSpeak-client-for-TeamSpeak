import { createStore } from "zustand/vanilla";

import type { SiteLanguage } from "@shared/site-copy";

import { createAdminMessages } from "@/i18n/admin-messages";
import { createAdminApi, isAdminRequestCancelled, type AdminApi } from "@/services/admin-api";
import { createAdminRequests } from "@/services/admin-requests";

import { createOperationsController, type OperationsController } from "./operations-controller";
import { createServerSettingsController, type ServerSettingsController } from "./server-settings-controller";

export type AdminScreen = "login" | "change-password" | "admin";

export interface AdminOverview {
  gateway: { version: string; uptimeSeconds: number };
  teamSpeak: { target: string; status: string; lastTestAt: string | null; latencyMs: number | null };
  sessions: { active: number; peak: number; limit: number };
  recentEvents: Array<{ event: string; createdAt: string }>;
  legacyConfigImported: boolean;
}

function emptyOverview(): AdminOverview {
  return {
    gateway: { version: "", uptimeSeconds: 0 },
    teamSpeak: { target: "", status: "unknown", lastTestAt: null, latencyMs: null },
    sessions: { active: 0, peak: 0, limit: 100 },
    recentEvents: [],
    legacyConfigImported: false,
  };
}

export interface AdminStore {
  loading: boolean;
  screen: AdminScreen;
  csrfToken: string;
  errorMessage: string;
  submitting: boolean;
  loggingOut: boolean;
  loginUsername: string;
  loginPassword: string;
  newPassword: string;
  confirmNewPassword: string;
  overview: AdminOverview;
  webrtcPortNoticeOpen: boolean;
}

interface Options {
  fetch?: typeof fetch;
  navigate(path: string): void;
  getCurrentPath(): string;
  getLanguage(): SiteLanguage;
}

export function createAdminController(initial: Options) {
  // bind：React 挂载后注入当次渲染的闭包（navigate/getCurrentPath/getLanguage 随渲染更新）。
  let options = initial;
  const requests = createAdminRequests();
  const store = createStore<AdminStore>(() => ({
    loading: true,
    screen: "login",
    csrfToken: "",
    errorMessage: "",
    submitting: false,
    loggingOut: false,
    loginUsername: "admin",
    loginPassword: "",
    newPassword: "",
    confirmNewPassword: "",
    overview: emptyOverview(),
    webrtcPortNoticeOpen: false,
  }));
  let currentPath = options.getCurrentPath();
  // 程序化导航（登录/登出/重定向）触发的路由副作用由动作自身负责，
  // 挡掉 handleRouteChange 的重复加载（旧版靠 submitting 窗口达成同一语义）。
  let suppressRouteEffect = false;

  const state = () => store.getState();
  const patch = (partial: Partial<AdminStore>) => store.setState(partial);
  const messages = () => createAdminMessages(options.getLanguage());
  const navigate = (path: string) => {
    suppressRouteEffect = true;
    options.navigate(path);
  };

  function clearError() {
    patch({ errorMessage: "" });
  }
  function report(error: unknown) {
    if (!isAdminRequestCancelled(error)) patch({ errorMessage: messages().errorText((error as { code?: string }).code) });
  }

  function resetPrivateState() {
    serverSettings.reset();
    operations.reset();
    patch({ overview: emptyOverview(), loginPassword: "", newPassword: "", confirmNewPassword: "", errorMessage: "", webrtcPortNoticeOpen: false });
  }

  function cancelPendingWork() {
    adminApi.invalidate();
    requests.reset();
    serverSettings.cancelRequests();
    operations.cancelRequests();
    patch({ loading: false, submitting: false, loggingOut: false });
  }

  const adminApi: AdminApi = createAdminApi({
    csrfToken: () => state().csrfToken,
    onUnauthorized: () => {
      // 当前会话的 401：页面整体重置回 login；旧会话的 401 经 invalidate 变为
      // REQUEST_CANCELLED，根本走不到这里（SPEC §12 双轨）。
      cancelPendingWork();
      resetPrivateState();
      patch({ csrfToken: "" });
      if (state().screen !== "login") {
        patch({ screen: "login" });
        navigate("/admin/login");
      }
    },
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  const serverSettings: ServerSettingsController = createServerSettingsController({
    api: adminApi,
    clearError,
    report,
    refreshOverview: () => loadOverview(),
  });
  const operations: OperationsController = createOperationsController({
    api: adminApi,
    clearError,
    report,
    confirmTerminate: (nickname) => window.confirm(messages().tr("confirmTerminate", { nickname })),
    refreshOverview: () => loadOverview(),
  });
  async function loadAdminData(request: { isCurrent(): boolean }, path: string) {
    await Promise.all([loadOverview(), serverSettings.loadServerSettings()]);
    if (!request.isCurrent()) return;
    if (path === "/admin/operations") await operations.loadOperations();
  }

  async function loadAdminView() {
    const path = options.getCurrentPath();
    currentPath = path;
    const request = requests.begin("auth");
    patch({ loading: true });
    try {
      const session = await adminApi.session(request.signal);
      if (!request.isCurrent()) return;
      if (!session.authenticated) {
        resetPrivateState();
        patch({ csrfToken: "", screen: "login" });
        if (path !== "/admin/login") navigate("/admin/login");
      } else {
        patch({ csrfToken: session.csrfToken || "" });
        if (session.mustChangePassword) {
          patch({ screen: "change-password" });
          navigate("/admin/change-password");
        } else {
          patch({ screen: "admin" });
          if (path === "/admin/login" || path === "/admin/change-password") navigate("/admin");
          if (request.isCurrent()) await loadAdminData(request, options.getCurrentPath());
        }
      }
    } catch (error) {
      if (request.isCurrent()) report(error);
    } finally {
      if (request.isCurrent()) patch({ loading: false });
      request.finish();
    }
  }

  async function login() {
    if (state().submitting) return;
    cancelPendingWork();
    const request = requests.begin("auth");
    patch({ submitting: true, errorMessage: "" });
    try {
      const result = await adminApi.login(state().loginUsername, state().loginPassword, request.signal);
      if (!request.isCurrent()) return;
      patch({ csrfToken: result.csrfToken, loginPassword: "" });
      if (result.mustChangePassword) {
        patch({ screen: "change-password" });
        navigate("/admin/change-password");
      } else {
        patch({ screen: "admin" });
        navigate("/admin");
        if (request.isCurrent()) await loadAdminData(request, options.getCurrentPath());
      }
    } catch (error) {
      if (request.isCurrent()) report(error);
    } finally {
      if (request.isCurrent()) patch({ submitting: false });
      request.finish();
    }
  }

  async function changePassword() {
    if (state().submitting) return;
    clearError();
    if (state().newPassword.length < 12) {
      patch({ errorMessage: messages().tr("setupPasswordShort") });
      return;
    }
    if (state().newPassword !== state().confirmNewPassword) {
      patch({ errorMessage: messages().tr("setupPasswordsMismatch") });
      return;
    }
    const request = requests.begin("auth");
    patch({ submitting: true });
    try {
      await adminApi.changePassword(state().newPassword, request.signal);
      if (!request.isCurrent()) return;
      patch({ newPassword: "", confirmNewPassword: "", screen: "admin" });
      navigate("/admin");
      if (request.isCurrent()) await loadAdminData(request, options.getCurrentPath());
    } catch (error) {
      if (request.isCurrent()) report(error);
    } finally {
      if (request.isCurrent()) patch({ submitting: false });
      request.finish();
    }
  }

  async function logout() {
    if (state().loggingOut) return;
    cancelPendingWork();
    const request = requests.begin("auth");
    patch({ loggingOut: true, errorMessage: "" });
    try {
      await adminApi.logout(request.signal);
      if (!request.isCurrent()) return;
      cancelPendingWork();
      resetPrivateState();
      patch({ csrfToken: "", screen: "login" });
      navigate("/admin/login");
    } catch (error) {
      if (request.isCurrent()) report(error);
    } finally {
      if (request.isCurrent()) patch({ loggingOut: false });
      request.finish();
    }
  }

  async function loadOverview() {
    const request = requests.begin("overview");
    try {
      const result = await adminApi.overview(request.signal);
      if (request.isCurrent()) patch({ overview: result });
    } catch (error) {
      if (request.isCurrent()) report(error);
    } finally {
      request.finish();
    }
  }

  async function dismissLegacyNotice() {
    const request = requests.begin("legacy-notice");
    try {
      await adminApi.dismissLegacyNotice(request.signal);
      if (request.isCurrent()) patch({ overview: { ...state().overview, legacyConfigImported: false } });
    } catch (error) {
      if (request.isCurrent()) report(error);
    } finally {
      request.finish();
    }
  }

  // 旧版 watch(route.path) 平价：跨区块丢弃 pending 读并清错误；回到管理态区块时重拉。
  function handleRouteChange(path: string) {
    if (suppressRouteEffect) {
      suppressRouteEffect = false;
      currentPath = path;
      return;
    }
    if (path === currentPath) return;
    const previous = currentPath;
    currentPath = path;
    clearError();
    requests.cancel("overview");
    if (previous === "/admin/server") serverSettings.cancelRequests();
    if (previous === "/admin/operations") operations.cancelRequests();
    const snapshot = state();
    if (snapshot.screen !== "admin" || snapshot.loading || snapshot.submitting || snapshot.loggingOut) return;
    if (path === "/admin/operations") void operations.loadOperations();
    else if (path === "/admin") void loadOverview();
  }

  function handleWebRtcToggle() {
    if (serverSettings.store.getState().form.webRtcEnabled) patch({ webrtcPortNoticeOpen: true });
  }

  function bind(next: Options) {
    options = next;
  }

  function dispose() {
    cancelPendingWork();
    resetPrivateState();
  }

  return {
    store,
    adminApi,
    serverSettings,
    operations,
    loadAdminView,
    login,
    logout,
    changePassword,
    loadOverview,
    dismissLegacyNotice,
    bind,
    handleRouteChange,
    handleWebRtcToggle,
    closeWebrtcPortNotice: () => patch({ webrtcPortNoticeOpen: false }),
    setLoginUsername: (value: string) => patch({ loginUsername: value }),
    setLoginPassword: (value: string) => patch({ loginPassword: value }),
    setNewPassword: (value: string) => patch({ newPassword: value }),
    setConfirmNewPassword: (value: string) => patch({ confirmNewPassword: value }),
    dispose,
  };
}

export type AdminController = ReturnType<typeof createAdminController>;
