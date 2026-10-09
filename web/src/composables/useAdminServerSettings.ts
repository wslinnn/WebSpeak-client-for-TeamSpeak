import { onScopeDispose, reactive, ref, watch, type Ref } from "vue";
import { DEFAULT_WELCOME_TEXTS } from "../../../src/site-copy.js";
import type { AdminSettings } from "../../../src/shared/admin-responses.js";
import { isAdminRequestCancelled, type AdminApi } from "../services/admin-api.js";
import { createAdminRequests } from "../services/admin-requests.js";
import { combineTeamSpeakTarget, splitTeamSpeakTarget, suggestedTeamSpeakPort } from "../services/teamspeak-target.js";

type SecretAction = "keep" | "replace" | "remove";
interface ProbeState { ok: boolean; checkType?: "network" | "protocol"; latencyMs?: number; serverName?: string | null; packetLossPercent?: number; code?: string; errorCode?: string }
interface Options { api: AdminApi; errorMessage: Ref<string>; errorText(code?: string): string; refreshOverview(): Promise<void> }

function emptyForm() {
  return { address: "", port: "9987", serverPassword: "", passwordAction: "keep" as SecretAction, hasPassword: false,
    accessMode: "fixed" as "fixed" | "open", siteName: "WebSpeak", welcomeText: "", welcomeTextEn: "", welcomeTextDe: "", welcomeTextRu: "", welcomeTextJa: "",
    welcomeDefaults: { ...DEFAULT_WELCOME_TEXTS }, webRtcPublicHost: "", webRtcIpv6Enabled: false, webRtcStunServer: "", webRtcEnabled: false, webRtcUdpStart: 40000, webRtcUdpEnd: 40099,
    lastTestAt: null as string | null, lastTestLatencyMs: null as number | null };
}
type ServerForm = ReturnType<typeof emptyForm>;
const editable = ["address", "port", "accessMode", "siteName", "welcomeText", "welcomeTextEn", "welcomeTextDe", "welcomeTextRu", "welcomeTextJa", "webRtcEnabled", "webRtcPublicHost", "webRtcIpv6Enabled", "webRtcStunServer", "webRtcUdpStart", "webRtcUdpEnd"] as const;
const snapshot = (form: ServerForm): ServerForm => JSON.parse(JSON.stringify(form));

export function useAdminServerSettings(options: Options) {
  const requests = createAdminRequests();
  const serverForm = reactive(emptyForm());
  const serverSaving = ref(false);
  const testing = ref(false);
  const testResult = ref<ProbeState | null>(null);
  let probeRevision = 0;
  let applyingSettings = false;

  watch(() => serverForm.address, (address, previousAddress) => {
    if (!applyingSettings) serverForm.port = suggestedTeamSpeakPort(previousAddress, address, serverForm.port);
  }, { flush: "sync" });

  function cancelRequests() {
    requests.reset();
    serverSaving.value = false;
    testing.value = false;
  }
  function reset() { cancelRequests(); Object.assign(serverForm, emptyForm()); testResult.value = null; }
  onScopeDispose(cancelRequests);
  function invalidateProbe() {
    probeRevision++;
    requests.cancel("probe");
    testing.value = false;
    testResult.value = null;
    serverForm.lastTestAt = null;
    serverForm.lastTestLatencyMs = null;
  }
  watch(() => [serverForm.address, serverForm.port, serverForm.serverPassword, serverForm.passwordAction], () => {
    if (!applyingSettings) invalidateProbe();
  }, { flush: "sync" });

  function mergeSettings(value: AdminSettings, baseline: ServerForm, observedProbeRevision: number): void {
    const target = splitTeamSpeakTarget(value.target);
    const next: ServerForm = { ...emptyForm(), ...value, address: target.address, port: target.port,
      welcomeDefaults: { ...DEFAULT_WELCOME_TEXTS, ...value.welcomeDefaults } };
    const applyProbeMetadata = observedProbeRevision === probeRevision;
    const previousAddress = serverForm.address, previousPort = serverForm.port;
    // Clearing acknowledged secret inputs does not change the tested credential.
    applyingSettings = true;
    try {
      for (const key of editable) {
        if (serverForm[key] === baseline[key]) Object.assign(serverForm, { [key]: next[key] });
      }
      if (serverForm.address !== previousAddress || serverForm.port !== previousPort) invalidateProbe();
      if (serverForm.serverPassword === baseline.serverPassword && serverForm.passwordAction === baseline.passwordAction) {
        serverForm.serverPassword = "";
        serverForm.passwordAction = "keep";
      }
      serverForm.hasPassword = next.hasPassword;
      serverForm.welcomeDefaults = next.welcomeDefaults;
      if (applyProbeMetadata && serverForm.address === next.address && serverForm.port === next.port) {
        serverForm.lastTestAt = next.lastTestAt;
        serverForm.lastTestLatencyMs = next.lastTestLatencyMs;
      }
    } finally { applyingSettings = false; }
  }

  function serverPayload() {
    return { target: combineTeamSpeakTarget(serverForm.address, serverForm.port), serverPassword: serverForm.passwordAction === "replace" ? serverForm.serverPassword : undefined,
      passwordAction: serverForm.passwordAction, accessMode: serverForm.accessMode, siteName: serverForm.siteName,
      welcomeText: serverForm.welcomeText, welcomeTextEn: serverForm.welcomeTextEn, welcomeTextDe: serverForm.welcomeTextDe, welcomeTextRu: serverForm.welcomeTextRu, welcomeTextJa: serverForm.welcomeTextJa,
      webRtcPublicHost: serverForm.webRtcPublicHost, webRtcIpv6Enabled: serverForm.webRtcIpv6Enabled, webRtcStunServer: serverForm.webRtcStunServer,
      webRtcEnabled: serverForm.webRtcEnabled, webRtcUdpStart: serverForm.webRtcUdpStart, webRtcUdpEnd: serverForm.webRtcUdpEnd };
  }
  function report(error: unknown) {
    if (!isAdminRequestCancelled(error)) options.errorMessage.value = options.errorText((error as { code?: string }).code);
  }
  async function loadServerSettings() {
    const request = requests.begin("load"), baseline = snapshot(serverForm), observedProbeRevision = probeRevision;
    try {
      const value = await options.api.settings(request.signal);
      if (request.isCurrent()) mergeSettings(value, baseline, observedProbeRevision);
    } catch (error) { if (request.isCurrent()) report(error); }
    finally { request.finish(); }
  }
  async function saveServerSettings() {
    if (serverSaving.value) return;
    requests.cancel("load");
    const request = requests.begin("save"), baseline = snapshot(serverForm), observedProbeRevision = probeRevision;
    serverSaving.value = true;
    options.errorMessage.value = "";
    try {
      const result = await options.api.saveSettings(serverPayload(), request.signal);
      if (!request.isCurrent()) return;
      mergeSettings(result.settings, baseline, observedProbeRevision);
      await options.refreshOverview();
    } catch (error) { if (request.isCurrent()) report(error); }
    finally { if (request.isCurrent()) serverSaving.value = false; request.finish(); }
  }
  async function testServerConnection() {
    probeRevision++;
    const request = requests.begin("probe");
    testing.value = true;
    testResult.value = null;
    options.errorMessage.value = "";
    try {
      const result = await options.api.probe(serverPayload(), request.signal);
      if (!request.isCurrent()) return;
      testResult.value = result;
      serverForm.lastTestAt = new Date().toISOString();
      serverForm.lastTestLatencyMs = result.ok ? result.latencyMs ?? null : null;
      await options.refreshOverview();
    } catch (error) {
      if (request.isCurrent() && !isAdminRequestCancelled(error)) testResult.value = { ok: false, code: (error as { code?: string }).code };
    } finally { if (request.isCurrent()) testing.value = false; request.finish(); }
  }
  return { serverForm, serverSaving, testing, testResult, loadServerSettings, saveServerSettings, testServerConnection, cancelRequests, reset };
}
