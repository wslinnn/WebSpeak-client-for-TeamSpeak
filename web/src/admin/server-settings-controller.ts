import { createStore } from "zustand/vanilla";

import type { AdminSettings } from "@shared/admin-responses";
import { DEFAULT_WELCOME_TEXTS, type SiteLanguage } from "@shared/site-copy";

import { isAdminRequestCancelled, type AdminApi } from "@/services/admin-api";
import { createAdminRequests } from "@/services/admin-requests";
import { combineTeamSpeakTarget, splitTeamSpeakTarget, suggestedTeamSpeakPort } from "@/services/teamspeak-target";

export type SecretAction = "keep" | "replace" | "remove";

export interface ProbeState {
  ok: boolean;
  checkType?: "network" | "protocol";
  latencyMs?: number;
  serverName?: string | null;
  packetLossPercent?: number;
  code?: string;
  errorCode?: string;
}

export interface ServerForm {
  address: string;
  port: string;
  serverPassword: string;
  passwordAction: SecretAction;
  hasPassword: boolean;
  accessMode: "fixed" | "open";
  siteName: string;
  welcomeText: string;
  welcomeTextEn: string;
  welcomeTextDe: string;
  welcomeTextRu: string;
  welcomeTextJa: string;
  welcomeDefaults: Record<SiteLanguage, string>;
  webRtcPublicHost: string;
  webRtcIpv6Enabled: boolean;
  webRtcStunServer: string;
  webRtcEnabled: boolean;
  webRtcUdpStart: number;
  webRtcUdpEnd: number;
  lastTestAt: string | null;
  lastTestLatencyMs: number | null;
}

export function emptyServerForm(): ServerForm {
  return {
    address: "", port: "9987", serverPassword: "", passwordAction: "keep", hasPassword: false,
    accessMode: "fixed", siteName: "WebSpeak", welcomeText: "", welcomeTextEn: "", welcomeTextDe: "", welcomeTextRu: "", welcomeTextJa: "",
    welcomeDefaults: { ...DEFAULT_WELCOME_TEXTS }, webRtcPublicHost: "", webRtcIpv6Enabled: false, webRtcStunServer: "", webRtcEnabled: false, webRtcUdpStart: 40000, webRtcUdpEnd: 41999,
    lastTestAt: null, lastTestLatencyMs: null,
  };
}

export type EditableServerField = Exclude<keyof ServerForm, "serverPassword" | "passwordAction" | "hasPassword" | "welcomeDefaults" | "lastTestAt" | "lastTestLatencyMs">;
const editable: readonly EditableServerField[] = ["address", "port", "accessMode", "siteName", "welcomeText", "welcomeTextEn", "welcomeTextDe", "welcomeTextRu", "welcomeTextJa", "webRtcEnabled", "webRtcPublicHost", "webRtcIpv6Enabled", "webRtcStunServer", "webRtcUdpStart", "webRtcUdpEnd"];
// 探针作废监听的字段（旧版 flush:sync watch 的显式化）。
const probeSensitive: readonly EditableServerField[] = ["address", "port"];
const snapshot = (form: ServerForm): ServerForm => JSON.parse(JSON.stringify(form)) as ServerForm;

export interface ServerSettingsStore {
  form: ServerForm;
  saving: boolean;
  testing: boolean;
  testResult: ProbeState | null;
}

interface Options {
  api: AdminApi;
  clearError(): void;
  report(error: unknown): void;
  refreshOverview(): Promise<void>;
}

export function createServerSettingsController(options: Options) {
  const requests = createAdminRequests();
  const store = createStore<ServerSettingsStore>(() => ({ form: emptyServerForm(), saving: false, testing: false, testResult: null }));
  let probeRevision = 0;
  let applyingSettings = false;

  const state = () => store.getState();
  const patch = (partial: Partial<ServerSettingsStore>) => store.setState(partial);
  const patchForm = (partial: Partial<ServerForm>) => store.setState({ form: { ...state().form, ...partial } });

  function invalidateProbe() {
    probeRevision++;
    requests.cancel("probe");
    patch({ testing: false, testResult: null });
    patchForm({ lastTestAt: null, lastTestLatencyMs: null });
  }

  /**
   * 旧版两个 flush:sync watch 的显式化：地址变更带动端口建议；目标/凭据字段
   * 变更作废探针。合并响应期间（applyingSettings）不触发。
   */
  function setField<K extends EditableServerField>(key: K, value: ServerForm[K]) {
    const form = state().form;
    if (form[key] === value) return;
    if (key === "address" && !applyingSettings) {
      const port = suggestedTeamSpeakPort(form.address, value as string, form.port);
      patchForm({ address: value as string, ...(port === form.port ? {} : { port }) });
      invalidateProbe();
      return;
    }
    patchForm({ [key]: value } as Partial<ServerForm>);
    if (probeSensitive.includes(key) && !applyingSettings) invalidateProbe();
  }

  function setSecretField(serverPassword: string, passwordAction: SecretAction) {
    const form = state().form;
    const changed = form.serverPassword !== serverPassword || form.passwordAction !== passwordAction;
    patchForm({ serverPassword, passwordAction });
    if (changed && !applyingSettings) invalidateProbe();
  }

  function cancelRequests() {
    requests.reset();
    patch({ saving: false, testing: false });
  }
  function reset() {
    cancelRequests();
    patch({ form: emptyServerForm(), testResult: null });
  }

  /** 保存挂起期间的编辑保留：仅「相对基线未动过」的字段被服务端响应覆盖（SPEC §12）。 */
  function mergeSettings(value: AdminSettings, baseline: ServerForm, observedProbeRevision: number): void {
    const target = splitTeamSpeakTarget(value.target);
    const next: ServerForm = { ...emptyServerForm(), ...value, address: target.address, port: target.port,
      welcomeDefaults: { ...DEFAULT_WELCOME_TEXTS, ...value.welcomeDefaults } };
    const applyProbeMetadata = observedProbeRevision === probeRevision;
    const previousAddress = state().form.address;
    const previousPort = state().form.port;
    // 清空已提交过的秘密输入不等于改了被测凭据。
    applyingSettings = true;
    try {
      const merged: Partial<ServerForm> = {};
      for (const key of editable) {
        if (state().form[key] === baseline[key]) (merged as Record<string, unknown>)[key] = next[key];
      }
      patchForm(merged);
      if (state().form.address !== previousAddress || state().form.port !== previousPort) invalidateProbe();
      if (state().form.serverPassword === baseline.serverPassword && state().form.passwordAction === baseline.passwordAction) {
        patchForm({ serverPassword: "", passwordAction: "keep" });
      }
      patchForm({ hasPassword: next.hasPassword, welcomeDefaults: next.welcomeDefaults });
      if (applyProbeMetadata && state().form.address === next.address && state().form.port === next.port) {
        patchForm({ lastTestAt: next.lastTestAt, lastTestLatencyMs: next.lastTestLatencyMs });
      }
    } finally {
      applyingSettings = false;
    }
  }

  function serverPayload() {
    const form = state().form;
    return {
      target: combineTeamSpeakTarget(form.address, form.port),
      serverPassword: form.passwordAction === "replace" ? form.serverPassword : undefined,
      passwordAction: form.passwordAction, accessMode: form.accessMode, siteName: form.siteName,
      welcomeText: form.welcomeText, welcomeTextEn: form.welcomeTextEn, welcomeTextDe: form.welcomeTextDe, welcomeTextRu: form.welcomeTextRu, welcomeTextJa: form.welcomeTextJa,
      webRtcPublicHost: form.webRtcPublicHost, webRtcIpv6Enabled: form.webRtcIpv6Enabled, webRtcStunServer: form.webRtcStunServer,
      webRtcEnabled: form.webRtcEnabled, webRtcUdpStart: form.webRtcUdpStart, webRtcUdpEnd: form.webRtcUdpEnd,
    };
  }

  async function loadServerSettings() {
    const request = requests.begin("load");
    const baseline = snapshot(state().form);
    const observedProbeRevision = probeRevision;
    try {
      const value = await options.api.settings(request.signal);
      if (request.isCurrent()) mergeSettings(value, baseline, observedProbeRevision);
    } catch (error) {
      if (request.isCurrent()) options.report(error);
    } finally {
      request.finish();
    }
  }

  async function saveServerSettings() {
    if (state().saving) return;
    requests.cancel("load");
    const request = requests.begin("save");
    const baseline = snapshot(state().form);
    const observedProbeRevision = probeRevision;
    patch({ saving: true });
    options.clearError();
    try {
      const result = await options.api.saveSettings(serverPayload(), request.signal);
      if (!request.isCurrent()) return;
      mergeSettings(result.settings, baseline, observedProbeRevision);
      await options.refreshOverview();
    } catch (error) {
      if (request.isCurrent()) options.report(error);
    } finally {
      if (request.isCurrent()) patch({ saving: false });
      request.finish();
    }
  }

  async function testServerConnection() {
    probeRevision++;
    const request = requests.begin("probe");
    patch({ testing: true, testResult: null });
    options.clearError();
    try {
      const result = await options.api.probe(serverPayload(), request.signal);
      if (!request.isCurrent()) return;
      patch({ testResult: result });
      patchForm({ lastTestAt: new Date().toISOString(), lastTestLatencyMs: result.ok ? result.latencyMs ?? null : null });
      await options.refreshOverview();
    } catch (error) {
      if (request.isCurrent() && !isAdminRequestCancelled(error)) {
        patch({ testResult: { ok: false, code: (error as { code?: string }).code } });
      }
    } finally {
      if (request.isCurrent()) patch({ testing: false });
      request.finish();
    }
  }

  return {
    store,
    setField,
    setSecretField,
    loadServerSettings,
    saveServerSettings,
    testServerConnection,
    cancelRequests,
    reset,
  };
}

export type ServerSettingsController = ReturnType<typeof createServerSettingsController>;
