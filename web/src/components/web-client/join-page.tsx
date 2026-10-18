import type { FavoriteServerDraft } from "./favorite-server-dialog";
import { Icon } from "./icon";
import { IdentityImportDialog } from "./identity-import-dialog";
import { JoinForm } from "./join-form";
import { JoinHeader } from "./join-header";
import { JoinNotices } from "./join-notices";
import { MobileGate } from "./mobile-gate";
import type { Language } from "@/i18n/web-client";
import type { FavoriteServer } from "@/services/local-persistence";

interface JoinPageConfig {
  siteName: string;
  accessMode: "open" | "fixed";
  initialized: boolean;
  serverConfigLoading: boolean;
  publicConfigFailed: boolean;
}

interface JoinPageVoice {
  error: string;
  errorCode: string;
  connecting: boolean;
}

interface JoinPageHome {
  serverHost: string;
  serverPort: string;
  serverPassword: string;
  nickname: string;
  channelName: string;
  rememberIdentity: boolean;
  favoriteServers: FavoriteServer[];
  identityMaterial: string;
  identityDialog: { open: boolean; text: string; busy: boolean; reading: boolean; error: string; exporting: boolean };
}

interface JoinPageConnection {
  setHost(value: string): void;
  setPort(value: string): void;
  setServerPassword(value: string): void;
  setNickname(value: string): void;
  setChannelName(value: string): void;
  doConnect(): void;
  doDisconnect(): void;
}

interface JoinPageProps {
  config: JoinPageConfig;
  language: Language;
  onLanguageChange(language: Language): void;
  mobileGateActive: boolean;
  onContinueMobile(): void;
  welcomeText: string;
  storageAvailable: boolean;
  browserError: string;
  browserWarning: string;
  voice: JoinPageVoice;
  retryWaiting: boolean;
  retrySeconds: number;
  isMobileViewport: boolean;
  joinDisabled: boolean;
  home: JoinPageHome;
  identity: {
    show(): void;
    close(): void;
    setText(value: string): void;
    submit(): Promise<void>;
    readFile(file: File): Promise<void>;
    exportIdentity(): Promise<void>;
  };
  connection: JoinPageConnection;
  onRememberIdentityChange(value: boolean): void;
  onSelectServer(server: FavoriteServer): void;
  onRemoveFavorite(server: FavoriteServer): void;
  onConnectServer(entry: { address: string; nickname?: string; channel?: string; password?: string }): void;
  onEditFavorite(server: FavoriteServer): void;
  onOpenFavoriteDialog(initial?: Partial<FavoriteServerDraft>): void;
  onOpenDeviceSettings(): void;
  onClearBrowserData(): void;
  onRetryConfig(): void;
  t(key: string, variables?: Record<string, string | number>): string;
  localizedMessage(message: string): string;
  visibleErrorCode(code: string): string;
  theme: { dark: boolean; onToggle(): void; label: string };
}

/** 连接/欢迎页（旧 WebClient.vue join 段平价）：header、手机门、hero、join 卡
 *  （通知区 + 表单）与 footer。身份导入弹窗在页内根部（进房壳不受它管辖）。 */
export function JoinPage(props: JoinPageProps) {
  const { config, t } = props;
  return (
    <section className="join-page" data-ws-part="home">
      <JoinHeader
        theme={props.theme}
        brandName={config.siteName}
        brandSubtitle={t("browserWorkspace")}
        gatewayStatus={t("secureGateway")}
        downloadLabel={t("downloadPage")}
        adminLabel={t("adminConsole")}
        moreLabel={t("mobileMore")}
        language={props.language}
        onLanguageChange={props.onLanguageChange}
        languageMenuLabel={t("languageMenu")}

      />

      {props.mobileGateActive ? (
        <MobileGate
          title={t("mobileGateTitle")}
          description={t("mobileGateDescription")}
          downloadLabel={t("mobileGateDownload")}
          continueLabel={t("mobileGateContinue")}
          hint={t("mobileGateHint")}
          onContinue={props.onContinueMobile}
        />
      ) : (
        <main className="join-content" data-ws-part="home.content">
          <div className="join-copy" data-ws-part="home.hero">
            <h1 data-ws-part="home.hero.title">
              {t("joinLine1")}
              <br />
              <em>{t("joinLine2")}</em>
            </h1>
            <p className="join-description" data-ws-part="home.hero.description">{props.welcomeText}</p>
          </div>

          <div className="join-card" data-ws-part="home.join-card">
            <div className="join-card-effects" aria-hidden="true">
              <span className="join-card-waveform" data-ws-part="home.join-card.waveform">
                {Array.from({ length: 9 }, (_, bar) => <i key={bar} />)}
              </span>
              <span className="join-card-sonar" data-ws-part="home.join-card.sonar">
                {Array.from({ length: 3 }, (_, ring) => <i key={ring} />)}
              </span>
            </div>
            <h2 data-ws-part="home.join-title">{t("welcomeBack")}</h2>
            <p className="card-lead" data-ws-part="home.join-description">{t("joinLead")}</p>

            <JoinNotices
              voiceError={props.voice.error}
              retryWaiting={props.retryWaiting}
              retrySeconds={props.retrySeconds}
              errorCode={props.voice.errorCode}
              browserError={props.browserError}
              browserWarning={props.browserWarning}
              unconfigured={!config.serverConfigLoading && !config.initialized && !config.publicConfigFailed}
              configLoadFailed={config.publicConfigFailed && !config.serverConfigLoading}
              storageUnavailable={!props.storageAvailable}
              onRetryConfig={props.onRetryConfig}
              t={t}
              localizedMessage={props.localizedMessage}
              visibleErrorCode={props.visibleErrorCode}
            />

            {config.initialized && (
              <JoinForm
                autofocusNickname={!props.isMobileViewport}
                accessMode={config.accessMode}
                serverHost={props.home.serverHost}
                serverPort={props.home.serverPort}
                serverPassword={props.home.serverPassword}
                nickname={props.home.nickname}
                channel={props.home.channelName}
                rememberIdentity={props.home.rememberIdentity}
                onServerHostChange={props.connection.setHost}
                onServerPortChange={props.connection.setPort}
                onServerPasswordChange={props.connection.setServerPassword}
                onNicknameChange={props.connection.setNickname}
                onChannelChange={props.connection.setChannelName}
                onRememberIdentityChange={props.onRememberIdentityChange}
                favoriteServers={props.home.favoriteServers}
                identityExportBusy={props.home.identityDialog.exporting}
                hasIdentity={Boolean(props.home.identityMaterial)}
                connecting={props.voice.connecting}
                joinDisabled={props.joinDisabled}
                joinRetrySeconds={props.retrySeconds}
                onOpenDeviceSettings={props.onOpenDeviceSettings}
                onConnect={props.connection.doConnect}
                onDisconnect={props.connection.doDisconnect}
                onConnectServer={props.onConnectServer}
                onSelectServer={props.onSelectServer}
                onEditFavorite={props.onEditFavorite}
                onRemoveFavorite={props.onRemoveFavorite}
                onOpenFavoriteDialog={props.onOpenFavoriteDialog}
                onImportIdentity={() => props.identity.show()}
                onExportIdentity={() => void props.identity.exportIdentity()}
                t={t}
              />
            )}
            <div className="join-meta" data-ws-part="home.security-note">
              <Icon name="lock" size={14} />
              {t("connectionAuthorized")}
            </div>
          </div>
        </main>
      )}

      {props.home.identityDialog.open && (
        <IdentityImportDialog
          text={props.home.identityDialog.text}
          onTextChange={props.identity.setText}
          busy={props.home.identityDialog.busy}
          reading={props.home.identityDialog.reading}
          error={props.home.identityDialog.error}
          closeLabel={t("close")}
          title={t("identityImportTitle")}
          description={t("identityImportDescription")}
          placeholder={t("identityImportPlaceholder")}
          dropZoneLabel={t("identityDropZone")}
          chooseFileLabel={t("identityChooseFile")}
          securityNote={t("identityImportSecurity")}
          cancelLabel={t("identityImportCancel")}
          connectingLabel={t("connecting")}
          submitLabel={t("identityImportSubmit")}
          onClose={props.identity.close}
          onSubmit={() => void props.identity.submit()}
          onFile={(file) => void props.identity.readFile(file)}
        />
      )}

      <footer className="join-footer" data-ws-part="home.footer">
        <span>{config.siteName}</span>
        <span className="footer-separator">·</span>
        <span>{t("teamSpeakClient")}</span>
        <span className="footer-spacer" />
        <button type="button" className="text-button clear-local-button" onClick={props.onClearBrowserData}>
          {t("clearLocalData")}
        </button>
      </footer>
    </section>
  );
}
