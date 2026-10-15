import { ChatPanel } from "./chat-panel";
import { Icon } from "./icon";
import { ScreenSharePlayer } from "./screen-share-player";
import { ScreenShareSettingsDialog } from "./screen-share-settings-dialog";
import { VoiceMembers } from "./voice-members";
import { WhisperControls } from "./whisper-controls";
import { speakingNowNames } from "@/web-client/view-utils";
import { screenShareErrorTextOf } from "@/web-client/screen-share-view";
import type { ScreenShareUi } from "@/web-client/use-screen-share";
import type { AudioControls } from "@/web-client/audio-controls";
import type { ChatController, ChatScrollerAspect } from "@/web-client/chat-controller";
import type { VoiceSessionController } from "@/voice/session-controller";
import type { WebClientChatTab } from "@/web-client/home-store";
import type { ChannelMember, ServerEvent } from "@shared/voice-models";
import type { Language } from "@/i18n/web-client";
import type { MobileSection } from "./voice-shell";

interface VoiceWorkspaceProps {
  voice: VoiceSessionController;
  chat: ChatController;
  chatTab: WebClientChatTab;
  audioControls: AudioControls;
  screenShare: ScreenShareUi;
  nickname: string;
  chatColumnActive: boolean;
  currentChannelName: string;
  currentMembers: ChannelMember[];
  speakingIds: ReadonlySet<number>;
  serverEvents: readonly ServerEvent[];
  sessionMembers: ChannelMember[];
  isMobileViewport: boolean;
  mobileSection: MobileSection;
  microphoneMuted: boolean;
  outputMuted: boolean;
  whisperTargets: ChannelMember[];
  whisperActive: boolean;
  whisperEnabled: boolean;
  onClearWhisperTargets(): void;
  language: Language;
  onChatListElement(element: ChatScrollerAspect | null): void;
  onCollapseChat(): void;
  chatCollapsed: boolean;
  onReopenChat(): void;
  onLeave(): void;
  onMemberActions(member: ChannelMember): void;
  t(key: string, variables?: Record<string, string | number>): string;
}

/** 工作区（旧 WebClient.vue workspace 段平价）：header（房间条/面包屑）、共享
 *  设置弹窗、语音区（共享内联错误/播放器/成员卡）、移动端音频控件、说话横条与
 *  非停靠聊天面板——说话横条与聊天面板是 workspace-content 的直接子级（移动页签
 *  显隐各归各，见 DECISIONS #38）。 */
export function VoiceWorkspace(props: VoiceWorkspaceProps) {
  const { chat, chatTab, chatColumnActive, currentChannelName, currentMembers, speakingIds, microphoneMuted, outputMuted, screenShare, t } = props;
  const isSpeaking = (member: { id: number }) => speakingIds.has(member.id);
  const speakingNames = speakingNowNames(currentMembers, speakingIds);
  const shareErrorText = screenShareErrorTextOf(screenShare.state.error, screenShare.state.errorCode, t);

  return (
    <main className="workspace" data-ws-part="voice.workspace">
      <header className="workspace-header" data-ws-part="voice.header">
        {chatColumnActive && (
          <div className="room-bar">
            <Icon name="volume" size={16} />
            <strong>{currentChannelName}</strong>
            <span>- {t("onlineShort", { count: currentMembers.length })}</span>
          </div>
        )}
        {!chatColumnActive && (
          <div className="breadcrumbs" data-ws-part="voice.breadcrumbs">
            <span className="mobile-brand">TeamSpeak <em>Web</em></span>
            <span className="crumb-muted">{t("serverBreadcrumb")}</span>
            <Icon name="chevron-right" size={14} />
            <strong>{currentChannelName}</strong>
          </div>
        )}
        <div className="workspace-actions" data-ws-part="voice.header-actions">
          {chatColumnActive && props.chatCollapsed && (
            <button
              type="button"
              className="header-action chat-reopen"
              data-ws-part="voice.chat.reopen"
              title={t("openChat")}
              aria-label={t("openChat")}
              onClick={props.onReopenChat}
            ><Icon name="message" size={17} /></button>
          )}
        </div>
      </header>

      {screenShare.settingsOpen && (
        <ScreenShareSettingsDialog
          presets={screenShare.presets}
          onPresetsChange={screenShare.onPresetsChange}
          onSubmit={screenShare.startWithSettings}
          onClose={() => screenShare.onSettingsOpenChange(false)}
          t={t}
        />
      )}

      <div className="workspace-scroll" data-ws-part="voice.scroll">
        <div className="workspace-content" data-ws-part="voice.content">
          <section
            className={props.mobileSection !== "voice" ? "voice-section mobile-section-hidden" : "voice-section"}
            data-ws-part="voice.activity"
          >
            <div className="voice-activity-artwork" data-ws-part="voice.activity.artwork" aria-hidden="true" />
            {!chatColumnActive && (
              <div className="section-heading" data-ws-part="voice.activity-heading">
                <div>
                  <span className="section-kicker">{t("voiceActivity")}</span>
                  <h2>{t("speakingNow")}</h2>
                </div>
                <span className="section-counter">{t("onlineShort", { count: currentMembers.length })}</span>
              </div>
            )}
            {screenShare.state.error && (
              <div className="screen-share-inline-error" data-ws-part="voice.screen-share-error" role="alert">
                <Icon name="info" size={15} />
                {" "}
                <span>{shareErrorText}</span>
              </div>
            )}
            {screenShare.state.viewing && (
              <ScreenSharePlayer
                ui={screenShare}
                onPlayerElement={screenShare.setPlayerElement}
                onVideoElement={screenShare.setVideoElement}
                nickname={props.nickname}
                t={t}
              />
            )}
            <VoiceMembers
              currentMembers={currentMembers}
              isMobileViewport={props.isMobileViewport}
              isSpeaking={isSpeaking}
              screenShareStreams={screenShare.state.streams}
              viewingStreamId={screenShare.state.viewingStreamId}
              onToggleScreenShare={screenShare.toggleForMember}
              t={t}
              onMemberActions={props.onMemberActions}
            />
            {props.whisperTargets.length > 0 && (
              <WhisperControls
                targets={props.whisperTargets}
                active={props.whisperActive}
                enabled={props.whisperEnabled}
                controls={props.audioControls}
                onClear={props.onClearWhisperTargets}
                t={t}
              />
            )}
            {props.isMobileViewport && (
              <div className="mobile-voice-controls">
                <button
                  type="button"
                  className="mobile-voice-toggle"
                  data-muted={microphoneMuted ? "true" : undefined}
                  aria-label={t("microphone")}
                  title={microphoneMuted ? t("microphoneMuted") : t("microphoneActive")}
                  aria-pressed={!microphoneMuted}
                  onClick={props.audioControls.toggleMicrophone}
                ><Icon name={microphoneMuted ? "mic-off" : "mic"} size={18} /></button>
                <button
                  type="button"
                  className="mobile-voice-toggle"
                  data-muted={outputMuted ? "true" : undefined}
                  aria-label={t("speaker")}
                  title={outputMuted ? t("outputMuted") : t("speaker")}
                  aria-pressed={!outputMuted}
                  onClick={() => props.voice.toggleOutputMute()}
                ><Icon name={outputMuted ? "volume-off" : "volume"} size={20} /></button>
                <button
                  type="button"
                  className="mobile-voice-leave"
                  aria-label={t("exit")}
                  title={t("exit")}
                  onClick={props.onLeave}
                ><Icon name="door" size={17} /></button>
              </div>
            )}
          </section>
          {/* 移动端聊天页签隐藏了成员卡：这条横条是唯一的「谁在说话」提示。 */}
          {props.isMobileViewport && props.mobileSection === "chat" && speakingNames.length > 0 && (
            <div className="whisper-strip" data-ws-part="voice.speaking-strip" role="status">
              <div className="whisper-strip-copy">
                <strong><Icon name="volume" size={15} /> {t("speakingNow")}</strong>
                <span>{speakingNames.join("、")}</span>
              </div>
            </div>
          )}
          {!chatColumnActive && (
            <ChatPanel
              chat={chat}
              tab={chatTab}
              language={props.language}
              currentChannelName={currentChannelName}
              mobileHidden={props.mobileSection !== "chat"}
              serverEvents={props.serverEvents}
              members={props.sessionMembers}
              onListElement={props.onChatListElement}
              onCollapse={props.onCollapseChat}
              t={t}
            />
          )}
        </div>
      </div>
    </main>
  );
}
