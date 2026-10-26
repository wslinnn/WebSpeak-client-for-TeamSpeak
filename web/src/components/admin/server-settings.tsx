import { ActivityIcon, CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { AdminMessages } from "@/i18n/admin-messages";
import type { ServerSettingsController } from "@/admin/server-settings-controller";
import { DEFAULT_WELCOME_TEXTS, type SiteLanguage } from "@shared/site-copy";

const WELCOME_LANGUAGE_OPTIONS: Array<{ value: SiteLanguage; label: string }> = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "ru", label: "Русский" },
  { value: "ja", label: "日本語" },
];
const WELCOME_TEXT_FIELD = { zh: "welcomeText", en: "welcomeTextEn", de: "welcomeTextDe", ru: "welcomeTextRu", ja: "welcomeTextJa" } as const;
const PROBE_FAILURE_NAMES = {
  INVALID_TARGET: "serverAddress", INVALID_NICKNAME: "invalidNicknameError", HOST_NOT_FOUND: "hostNotFoundError",
  UNREACHABLE: "networkUnreachableError", CONNECTION_REFUSED: "connectionRefusedError", CONNECTION_RESET: "connectionResetError",
  TIMEOUT: "networkTimeoutError", PASSWORD_REQUIRED: "serverPasswordRequiredError", INVALID_PASSWORD: "invalidServerPasswordError",
  PROTOCOL_NEGOTIATION_FAILED: "protocolFailureError", SERVER_REJECTED: "serverRejectedError", PING_UNAVAILABLE: "pingUnavailableError",
} as const;

// 旧 AdminServerSettings.vue 平价：类名与结构保留，样式由 admin.css 提供。
export function AdminServerSettings({ model, messages, onWebRtcToggle }: {
  model: ServerSettingsController;
  messages: AdminMessages;
  onWebRtcToggle(): void;
}) {
  const { tr, formatDate, connectionFailureText } = messages;
  const { form, saving, testing, testResult } = useStore(model.store);
  const [welcomeLanguage, setWelcomeLanguage] = useState<SiteLanguage>("zh");
  const welcomeField = WELCOME_TEXT_FIELD[welcomeLanguage];

  const testResultTitle = (() => {
    if (!testResult) return "";
    if (testResult.ok) return testResult.checkType === "network" ? tr("networkReachable") : tr("connectionReady");
    const key = PROBE_FAILURE_NAMES[(testResult.code ?? testResult.errorCode ?? "") as keyof typeof PROBE_FAILURE_NAMES];
    return tr(key ?? "connectionFailed");
  })();
  const testResultText = (() => {
    if (!testResult) return "";
    const result = testResult;
    const toolUnavailable = result.errorCode === "PING_UNAVAILABLE";
    const loss = toolUnavailable || result.packetLossPercent == null ? null : `${tr("packetLoss")} ${result.packetLossPercent}%`;
    if (!result.ok) return [connectionFailureText(result.code ?? result.errorCode), loss].filter(Boolean).join(" · ");
    if (result.checkType === "network") return [tr("networkReachableHint"), result.latencyMs == null ? null : `${result.latencyMs} ms`, loss].filter(Boolean).join(" · ");
    return [result.serverName, result.latencyMs == null ? null : `${result.latencyMs} ms`, loss].filter(Boolean).join(" · ");
  })();

  const numberField = (key: "webRtcUdpStart" | "webRtcUdpEnd", raw: string) => {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) model.setField(key, parsed);
  };

  return (
    <section className="page-content server-page">
      <div className="page-heading">
        <div>
          <h2>{tr("serverSettings")}</h2>
          <p>{tr("serverSettingsLead")}</p>
        </div>
        <Button type="button" disabled={saving} onClick={() => void model.saveServerSettings()}>
          {saving ? tr("saving") : tr("saveChanges")}
        </Button>
      </div>
      <div className="settings-grid">
        <details className="settings-card settings-accordion target-accordion" open>
          <summary className="settings-accordion-header">
            <span className="settings-accordion-heading">
              <strong>{tr("teamSpeakTarget")}</strong>
              <small>{form.address || "—"} · {form.port || "—"}</small>
            </span>
            <ChevronDownIcon size={18} aria-hidden="true" />
          </summary>
          <div className="settings-accordion-content">
            <div className="target-settings-layout">
              <div className="target-fields">
                <label>
                  <span>{tr("serverAddress")}</span>
                  <Input value={form.address} placeholder={tr("serverPlaceholder")}
                    onChange={(event) => model.setField("address", event.target.value.trim())} />
                </label>
                <label>
                  <span>{tr("serverPort")}</span>
                  <Input value={form.port} inputMode="numeric" type="text" maxLength={5} placeholder={tr("serverPortPlaceholder")}
                    onChange={(event) => model.setField("port", event.target.value.trim())} />
                </label>
              </div>
              <div className="password-row">
                <label>
                  <span>{tr("serverPassword")}</span>
                  <Input value={form.serverPassword} type="password" autoComplete="off" disabled={form.passwordAction !== "replace"}
                    placeholder={form.hasPassword ? tr("passwordConfigured") : tr("optionalPassword")}
                    onChange={(event) => model.setSecretField(event.target.value, form.passwordAction)} />
                </label>
                <div className="password-actions">
                  <Button variant="ghost" type="button" className={form.passwordAction === "replace" ? "active" : undefined}
                    onClick={() => model.setSecretField(form.serverPassword, "replace")}>{tr("change")}</Button>
                  {form.hasPassword && (
                    <Button variant="ghost" type="button" className={form.passwordAction === "remove" ? "danger" : undefined}
                      onClick={() => model.setSecretField(form.serverPassword, "remove")}>{tr("remove")}</Button>
                  )}
                </div>
              </div>
              <Button type="button" variant="outline" className="target-test-button" disabled={testing}
                onClick={() => void model.testServerConnection()}>
                {testing ? <span className="spinner small" aria-hidden="true" /> : <ActivityIcon size={17} aria-hidden="true" />}
                {testing ? tr("testing") : tr("testConnection")}
              </Button>
              {testResult && (
                <div className={["test-result", "target-test-result", testResult.ok ? "success" : "error"].join(" ")}>
                  {testResult.ok ? <CheckIcon size={18} aria-hidden="true" /> : <XIcon size={18} aria-hidden="true" />}
                  <div>
                    <strong>{testResultTitle}</strong>
                    <small>{testResultText}</small>
                  </div>
                </div>
              )}
              <div className="target-runtime-block">
                <h4>{tr("runtimeFacts")}</h4>
                <dl className="target-runtime-facts">
                  <div>
                    <dt>{tr("lastTest")}</dt>
                    <dd>{formatDate(form.lastTestAt)}</dd>
                  </div>
                  <div>
                    <dt>{tr("latency")}</dt>
                    <dd>{form.lastTestLatencyMs == null ? "—" : `${form.lastTestLatencyMs} ms`}</dd>
                  </div>
                  <div>
                    <dt>{tr("internalPort")}</dt>
                    <dd>3040</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </details>

        <details className="settings-card settings-accordion">
          <summary className="settings-accordion-header">
            <span className="settings-accordion-heading">
              <strong>{tr("accessAndIdentity")}</strong>
              <small>{form.accessMode === "fixed" ? tr("fixedMode") : tr("openMode")} · {form.siteName || "WebSpeak"}</small>
            </span>
            <ChevronDownIcon size={18} aria-hidden="true" />
          </summary>
          <div className="settings-accordion-content">
            <div className="access-settings-layout">
              <fieldset className="access-mode-fieldset">
                <legend>{tr("accessMode")}</legend>
                {(["fixed", "open"] as const).map((mode) => (
                  <label key={mode} className={`choice${form.accessMode === mode ? " selected" : ""}`}>
                    <input type="radio" name="access-mode" value={mode} checked={form.accessMode === mode}
                      onChange={() => model.setField("accessMode", mode)} />
                    <span>
                      <strong>{mode === "fixed" ? tr("fixedMode") : tr("openMode")}</strong>
                      <small>{mode === "fixed" ? tr("fixedModeLead") : tr("openModeLead")}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="site-identity-fields">
                <label>
                  <span>{tr("siteName")}</span>
                  <Input value={form.siteName} maxLength={80} onChange={(event) => model.setField("siteName", event.target.value.trim())} />
                </label>
                <div className="welcome-editor">
                  <div className="welcome-editor-heading">
                    <label>
                      <span>{tr("welcomeLanguage")}</span>
                      <Select value={welcomeLanguage} onValueChange={(value) => setWelcomeLanguage(value as SiteLanguage)}>
                        <SelectTrigger aria-label={tr("welcomeLanguage")}><SelectValue /></SelectTrigger>
                        <SelectContent position="popper">
                          {WELCOME_LANGUAGE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <small>{tr("welcomeLanguageHint")}</small>
                  </div>
                  <label>
                    <span>{tr("welcomeText")} · {WELCOME_LANGUAGE_OPTIONS.find((option) => option.value === welcomeLanguage)?.label}</span>
                    <Textarea value={form[welcomeField]} maxLength={500} rows={4} className="field-sizing-fixed"
                      placeholder={form.welcomeDefaults[welcomeLanguage] || DEFAULT_WELCOME_TEXTS[welcomeLanguage]}
                      onChange={(event) => model.setField(WELCOME_TEXT_FIELD[welcomeLanguage], event.target.value)} />
                  </label>
                  <small className="field-help">{tr("welcomeFallbackHint")}</small>
                </div>
              </div>
            </div>
          </div>
        </details>

        <details className="settings-card settings-accordion advanced-card">
          <summary className="settings-accordion-header">
            <span className="settings-accordion-heading">
              <strong>{tr("advancedSettings")}</strong>
              <small>{tr("advancedSettingsLead")}</small>
            </span>
            <span className="settings-accordion-statuses">
              <span className="settings-summary-chip">
                <i className={form.webRtcEnabled ? "active" : undefined} />
                {tr("webrtcSettings")} · {form.webRtcEnabled ? tr("enabledStatus") : tr("disabledStatus")}
              </span>
            </span>
            <ChevronDownIcon size={18} aria-hidden="true" />
          </summary>
          <div className="settings-accordion-content">
            <div className="advanced-settings-grid">
              <section className="settings-subsection webrtc-card">
                <header className="settings-subsection-heading">
                  <div>
                    <h4>{tr("webrtcSettings")}</h4>
                    <p className="card-help">{tr("webrtcLead")}</p>
                  </div>
                </header>
                <label className={`choice toggle-choice${form.webRtcEnabled ? " selected" : ""}`}>
                  <Checkbox checked={form.webRtcEnabled} aria-label={tr("webrtcEnabled")}
                    onCheckedChange={(value) => { model.setField("webRtcEnabled", value === true); onWebRtcToggle(); }} />
                  <span><strong>{tr("webrtcEnabled")}</strong><small>{tr("webrtcEnabledLead")}</small></span>
                </label>
                <div className="webrtc-port-fields">
                  <div className="port-fields-heading">
                    <strong>{tr("webrtcPortRange")}</strong>
                    <small>{tr("webrtcPortRangeLead")}</small>
                  </div>
                  <div className="port-inputs">
                    <label>
                      <span>{tr("webrtcPortStart")}</span>
                      <Input type="number" inputMode="numeric" min={1024} max={65535} value={form.webRtcUdpStart} disabled={form.webRtcEnabled}
                        onChange={(event) => numberField("webRtcUdpStart", event.target.value)} />
                    </label>
                    <label>
                      <span>{tr("webrtcPortEnd")}</span>
                      <Input type="number" inputMode="numeric" min={1024} max={65535} value={form.webRtcUdpEnd} disabled={form.webRtcEnabled}
                        onChange={(event) => numberField("webRtcUdpEnd", event.target.value)} />
                    </label>
                  </div>
                </div>
                <label className="webrtc-network-field">
                  <span>{tr("webrtcPublicHost")}</span>
                  <Input value={form.webRtcPublicHost} type="text" maxLength={253} autoComplete="off" spellCheck={false} placeholder="media.example.com"
                    onChange={(event) => model.setField("webRtcPublicHost", event.target.value)} />
                  <small className="field-help">{tr("webrtcPublicHostLead")}</small>
                </label>
                <label className={`choice toggle-choice${form.webRtcIpv6Enabled ? " selected" : ""}`}>
                  <Checkbox checked={form.webRtcIpv6Enabled} aria-label={tr("webrtcIpv6")}
                    onCheckedChange={(value) => model.setField("webRtcIpv6Enabled", value === true)} />
                  <span><strong>{tr("webrtcIpv6")}</strong><small>{tr("webrtcIpv6Lead")}</small></span>
                </label>
                <label className="webrtc-network-field">
                  <span>{tr("webrtcStunServer")}</span>
                  <Input value={form.webRtcStunServer} type="text" maxLength={300} autoComplete="off" spellCheck={false} placeholder="stun:turn.teamspeak.com:3478"
                    onChange={(event) => model.setField("webRtcStunServer", event.target.value)} />
                  <small className="field-help">{tr("webrtcStunServerLead")}</small>
                </label>
                <small className="field-help">{tr("webrtcApplyHint")}</small>
              </section>
              <section className="settings-subsection ice-card">
                <header className="settings-subsection-heading">
                  <div>
                    <h4>{tr("screenShareIceTitle")}</h4>
                    <p className="card-help">{tr("screenShareIceHelp")}</p>
                  </div>
                </header>
                <Textarea value={form.screenShareIceServers} rows={4} className="field-sizing-fixed" spellCheck={false}
                  placeholder={`[{"urls":"stun:stun.example.com:3478"}]`}
                  onChange={(event) => model.setField("screenShareIceServers", event.target.value)} />
                <small className="field-help">{tr("screenShareIceHint")}</small>
              </section>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
