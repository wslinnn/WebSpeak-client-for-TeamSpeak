import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "./icon";
import { ServerContextMenu } from "./server-context-menu";
import { useIsMobileViewport } from "@/hooks/use-mobile-viewport";
import { createLongPressContextMenu } from "@/services/long-press-context-menu";
import { combineTeamSpeakTarget } from "@/services/teamspeak-target";
import type { FavoriteServer } from "@/services/local-persistence";
import type { FavoriteServerDraft } from "./favorite-server-dialog";

interface JoinFormProps {
  autofocusNickname: boolean;
  accessMode: "fixed" | "open";
  serverHost: string;
  serverPort: string;
  serverPassword: string;
  nickname: string;
  channel: string;
  rememberIdentity: boolean;
  onServerHostChange(value: string): void;
  onServerPortChange(value: string): void;
  onServerPasswordChange(value: string): void;
  onNicknameChange(value: string): void;
  onChannelChange(value: string): void;
  onRememberIdentityChange(value: boolean): void;
  favoriteServers: readonly FavoriteServer[];
  identityExportBusy: boolean;
  hasIdentity: boolean;
  connecting: boolean;
  joinDisabled: boolean;
  joinRetrySeconds: number;
  /** 设备设置弹窗随 P4-5 音频设置回归；此前的点击是明确无操作。 */
  onOpenDeviceSettings(): void;
  onConnect(): void;
  onDisconnect(): void;
  onConnectServer(entry: { address: string; nickname?: string; channel?: string; password?: string }): void;
  onSelectServer(server: FavoriteServer): void;
  onEditFavorite(server: FavoriteServer): void;
  onRemoveFavorite(server: FavoriteServer): void;
  onOpenFavoriteDialog(initial?: Partial<FavoriteServerDraft>): void;
  onImportIdentity(): void;
  onExportIdentity(): void;
  t(key: string, variables?: Record<string, string | number>): string;
}

type MicPermission = "unknown" | "granted" | "denied" | "prompt";

/** Join 表单（旧 JoinForm.vue 平价）：目标字段（open 模式）+ 收藏行 + 服务器密码 +
 *  设备设置入口 + 昵称/频道 + 身份选项 + 连接/取消。收藏行长按/右键出编辑菜单。 */
export function JoinForm(props: JoinFormProps) {
  const { accessMode, favoriteServers, connecting, joinDisabled, joinRetrySeconds, t } = props;
  const currentTarget = combineTeamSpeakTarget(props.serverHost, props.serverPort);

  const [rowMenu, setRowMenu] = useState<{ server: FavoriteServer; x: number; y: number } | null>(null);
  const isMobileViewport = useIsMobileViewport();
  // 收藏行直接连接（存着的密码一起带上）；右键/长按共享编辑菜单（触屏没有原生 contextmenu）。
  const rowGestures = useMemo(
    () => createLongPressContextMenu<FavoriteServer>((open) => {
      if (open.context) setRowMenu({ server: open.context, x: open.x, y: open.y });
    }),
    [],
  );
  useEffect(() => () => rowGestures.dispose(), [rowGestures]);

  // iOS Safari 没有输出设备选择器；进房前就说清楚，而不是藏在房间设置里。
  const outputPickerSupported = typeof HTMLMediaElement === "undefined" || "setSinkId" in HTMLMediaElement.prototype;

  // 麦克风权限角标：在用户烧掉一次进房尝试之前解释空设备列表。
  // Firefox/Safari 缺 permission 名——unknown 就是不渲染角标。
  const [micPermission, setMicPermission] = useState<MicPermission>("unknown");
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let onchange: (() => void) | null = null;
    void (async () => {
      try {
        status = (await navigator.permissions?.query({ name: "microphone" as PermissionName })) ?? null;
        if (!status) return;
        setMicPermission(status.state as MicPermission);
        onchange = () => setMicPermission(status!.state as MicPermission);
        status.onchange = onchange;
      } catch { /* 该浏览器没有 "microphone" permission 名。 */ }
    })();
    return () => { if (status) status.onchange = null; };
  }, []);

  return (
    <form className="join-form" data-ws-part="home.form" onSubmit={(event) => { event.preventDefault(); props.onConnect(); }}>
      {accessMode === "open" && (
        <div className="field-grid target-fields" data-ws-part="home.server-target">
          <label className="field-label" data-ws-part="home.field-label" htmlFor="server-address">
            <span>{t("serverAddress")}</span>
            <div className="field-wrap" data-ws-part="home.field">
              <Icon name="server" size={17} />
              <input
                id="server-address"
                value={props.serverHost}
                onChange={(event) => props.onServerHostChange(event.target.value)}
                autoComplete="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                placeholder={t("serverAddressPlaceholder")}
              />
            </div>
          </label>
          <label className="field-label" data-ws-part="home.field-label" htmlFor="server-port">
            <span>{t("serverPort")}</span>
            <div className="field-wrap" data-ws-part="home.field">
              <Icon name="hash" size={17} />
              <input
                id="server-port"
                value={props.serverPort}
                onChange={(event) => props.onServerPortChange(event.target.value)}
                inputMode="numeric"
                enterKeyHint="next"
                type="text"
                maxLength={5}
                placeholder={t("serverPortPlaceholder")}
              />
            </div>
          </label>
        </div>
      )}
      {accessMode === "open" && favoriteServers.length > 0 && (
        <div className="local-servers" data-ws-part="home.server-history">
          {favoriteServers.map((server) => (
            <div key={server.id} className="local-server-item" data-ws-part="home.server-history.item" data-ws-state="favorite">
              <button
                type="button"
                className={server.address === currentTarget ? "local-server-select active" : "local-server-select"}
                title={server.label}
                onClick={() => props.onConnectServer({ address: server.address, nickname: server.nickname, channel: server.lastChannelHint?.name, password: server.password })}
                onPointerDown={(event) => rowGestures.pointerDown(event.nativeEvent, server)}
                onPointerMove={(event) => rowGestures.pointerMove(event.nativeEvent)}
                onPointerUp={() => rowGestures.pointerUp()}
                onPointerCancel={() => rowGestures.pointerCancel()}
                onClickCapture={(event) => rowGestures.clickCapture(event.nativeEvent)}
                onContextMenu={(event) => {
                  // 首页行没有长按菜单回调可借道：直接开共享编辑菜单。
                  event.preventDefault();
                  setRowMenu({ server, x: event.clientX, y: event.clientY });
                }}
              >
                {server.password && <Icon name="lock" size={12} className="server-tab-lock" />}
                {server.label}
              </button>
            </div>
          ))}
          <button type="button" className="local-server-add" data-ws-part="home.server-history.add" onClick={() => props.onOpenFavoriteDialog()}>
            <Icon name="plus" size={12} />
            {t("addFavoriteServer")}
          </button>
        </div>
      )}
      {rowMenu && (
        <ServerContextMenu
          server={rowMenu.server}
          position={rowMenu}
          part="home.server-context-menu"
          inRoom={false}
          isMobileViewport={isMobileViewport}
          t={t}
          onSwitch={() => {}}
          onEdit={(server) => props.onEditFavorite(server)}
          onRemoveFavorite={(server) => props.onRemoveFavorite(server)}
          onClose={() => setRowMenu(null)}
        />
      )}

      <label className="field-label" data-ws-part="home.field-label" htmlFor="server-password">
        {t("serverPassword")} <span>{t("optional")}</span>
      </label>
      <div className="field-wrap" data-ws-part="home.field">
        <Icon name="lock" size={17} />
        <input
          id="server-password"
          value={props.serverPassword}
          onChange={(event) => props.onServerPasswordChange(event.target.value)}
          type="password"
          autoComplete="new-password"
          placeholder={t("optionalPassword")}
        />
      </div>

      <div className="device-setup" data-ws-part="home.device-setup">
        <Button type="button" variant="outline" size="sm" className="identity-action-button" data-ws-part="home.device-setup.open" onClick={props.onOpenDeviceSettings}>
          <Icon name="mic" size={15} />
          {t("joinDeviceSetupAction")}
        </Button>
        {micPermission === "granted" && <p className="device-setup-hint ok" role="status">{t("micPermissionGranted")}</p>}
        {micPermission === "denied" && <p className="device-setup-hint denied" role="alert">{t("micPermissionDenied")}</p>}
        {!outputPickerSupported && <p className="device-setup-hint">{t("outputUnsupportedHint")}</p>}
      </div>

      <label className="field-label" data-ws-part="home.field-label" htmlFor="nickname">{t("nickname")}</label>
      <div className="field-wrap" data-ws-part="home.field">
        <Icon name="users" size={17} />
        <input
          id="nickname"
          value={props.nickname}
          onChange={(event) => props.onNicknameChange(event.target.value)}
          autoComplete="nickname"
          maxLength={30}
          placeholder={t("nicknamePlaceholder")}
          autoFocus={props.autofocusNickname || undefined}
        />
      </div>

      <div className="identity-options" data-ws-part="home.identity">
        <label className="field-label" data-ws-part="home.field-label" htmlFor="channel">
          {t("targetChannel")} <span>{t("optional")}</span>
        </label>
        <div className="field-wrap" data-ws-part="home.field">
          <Icon name="hash" size={17} />
          <input id="channel" value={props.channel} onChange={(event) => props.onChannelChange(event.target.value)} placeholder={t("emptyDefault")} />
        </div>
        <div className="identity-controls">
          <label className="remember-identity">
            <input
              type="checkbox"
              checked={props.rememberIdentity}
              onChange={(event) => props.onRememberIdentityChange(event.target.checked)}
            />
            <span>
              <strong>{t("rememberIdentity")}</strong>
              <small>{t("rememberIdentityHint")}</small>
            </span>
          </label>
          <div className="identity-actions" data-ws-part="home.identity-actions">
            <Button type="button" variant="outline" size="sm" className="identity-action-button" data-ws-part="home.identity-import.open" onClick={props.onImportIdentity}>
              {t("identityImport")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="identity-action-button"
              data-ws-part="home.identity-export.button"
              disabled={props.identityExportBusy || !props.rememberIdentity || !props.hasIdentity}
              onClick={props.onExportIdentity}
            >
              {t("identityExport")}
            </Button>
          </div>
        </div>
      </div>
      {props.rememberIdentity && <p className="identity-warning">{t("rememberIdentityConcurrentWarning")}</p>}

      <Button className="connect-button" data-ws-part="home.connect" disabled={joinDisabled} type="submit">
        {connecting && <span className="button-spinner" />}
        {joinRetrySeconds > 0
          ? <span>{t("retryLater", { seconds: joinRetrySeconds })}</span>
          : <span>{connecting ? t("connecting") : t("enterVoice")}</span>}
        {!connecting && <Icon name="chevron-right" size={17} />}
      </Button>
      {connecting && (
        <Button type="button" variant="ghost" className="cancel-connect-button" onClick={props.onDisconnect}>
          {t("cancel")}
        </Button>
      )}
    </form>
  );
}
