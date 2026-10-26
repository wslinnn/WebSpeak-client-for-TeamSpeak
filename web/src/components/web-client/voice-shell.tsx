import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { StoreApi } from "zustand";

import { ChannelMemberPanel } from "./channel-member-panel";
import { ChatPanel } from "./chat-panel";
import { AudioDock } from "./audio-dock";
import { Icon } from "./icon";
import { MemberActionsMenu } from "./member-actions-menu";
import { ServerContextMenu } from "./server-context-menu";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VoiceBanners } from "./voice-banners";
import { VoiceMobileMore } from "./voice-mobile-more";
import { VoicePerformancePanel } from "./voice-performance-panel";
import { VoiceWorkspace } from "./voice-workspace";
import { selectVoiceShellView } from "./voice-shell-view";
import { avatarInitial, avatarStyle } from "@/web-client/avatar";
import { useI18n } from "@/hooks/use-i18n";
import { useStoreOfSpeaking } from "@/hooks/useVoiceSession";
import type { VoiceSessionController } from "@/voice/session-controller";
import { buildChannelTree, deriveMemberChannels, ensureSelectedChannelId, filterMemberChannels, findCurrentChannel, type TreeChannel } from "@/web-client/channel-tree";
import { createLongPressContextMenu } from "@/services/long-press-context-menu";
import { useScreenShareUi } from "@/web-client/use-screen-share";
import type { ChatController, ChatScrollerAspect } from "@/web-client/chat-controller";
import type { AudioControls } from "@/web-client/audio-controls";
import type { PerformanceMonitor } from "@/web-client/performance-monitor";
import type { MembersController } from "@/web-client/members-controller";
import type { ChannelFold } from "@/web-client/channel-fold";
import type { VoiceServerSwitch } from "@/web-client/server-switch";
import type { HomeStore } from "@/web-client/home-store";
import type { MobileSection } from "@/web-client/mobile-section";
import type { FavoriteServer } from "@/services/local-persistence";
import type { Language } from "@/i18n/web-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface VoiceShellProps {
  voice: VoiceSessionController;
  home: StoreApi<HomeStore>;
  chat: ChatController;
  membersController: MembersController;
  fold: ChannelFold;
  serverSwitch: VoiceServerSwitch;
  audioControls: AudioControls;
  monitor: PerformanceMonitor;
  language: Language;
  isMobileViewport: boolean;
  mobileSection: MobileSection;
  onMobileSectionChange(section: MobileSection): void;
  memberQuery: string;
  onMemberQueryChange(query: string): void;
  onChatListElement(element: ChatScrollerAspect | null): void;
  /** 频道树双击/Enter 进房（home-connection.selectChannel 的乐观回滚桥）。 */
  onSelectChannel(channel: TreeChannel): void;
  onSwitchServer(server: FavoriteServer): void;
  onLeave(): void;
  onReconnect(): void;
  onEditFavorite(server: FavoriteServer): void;
  onRemoveFavorite(server: FavoriteServer): void;
  onOpenFavoriteDialog(): void;
  onOpenAudioSettings(): void;
  onVolumeInput(clientId: number, value: number): void;
  theme: { dark: boolean; onToggle(): void; label: string };
  t(key: string, variables?: Record<string, string | number>): string;
  localizedMessage(message: string): string;
  localizedAudioNotice(code: string, message: string): string;
  localizedMicrophoneError(code: string, message: string): string;
  showToast(message: string, tone?: "info" | "warn"): void;
}

/** 进房壳（旧 WebClient.vue 语音态平价）：banners / 收藏 chips(≤740)+rail(≥741) /
 *  workspace（面包屑+成员卡+说话横条）/ 聊天（≥981 停靠列，其余留在工作区）/
 *  频道成员面板 / 移动端 more 面板与底部导航。 */
export function VoiceShell(props: VoiceShellProps) {
  const i18n = useI18n();
  const { voice, home, chat, membersController, fold, serverSwitch, t } = props;
  // 整包订阅会让 20–50Hz 的 micLevel 驱动整棵壳重渲——窄选排除电平，坞与设置
  // 弹窗各自内部订阅；字段集合即本组件渲染实际消费面，新增消费须在此登记。
  const voiceView = useStore(voice.store, useShallow(selectVoiceShellView));
  const session = useStore(voice.session.store);
  const homeState = useStore(home);
  const speakingIds = useStoreOfSpeaking(voice).speakingIds;
  // 折叠集合经订阅进渲染（直接 getState 是一次性快照，toggle 后 UI 不更新）。
  const switchState = useStore(serverSwitch.store);
  // 折叠集合经订阅进渲染（直接 getState 是一次性快照，toggle 后 UI 不更新）。
  const foldedChannels = useStore(fold.store).folded;
  // 避让规则由 data-performance-open 驱动（18-artwork-promise.css 中等视口让位）。
  const performancePanelOpen = useStore(props.monitor.store, (view) => view.panelOpen);
  const screenShare = useScreenShareUi(voice);

  const chatTab = homeState.chatTab;
  const [chatCollapsed, setChatCollapsed] = useState(() => localStorage.getItem("webspeak:chat-collapsed") === "1");
  useEffect(() => {
    if (chatCollapsed) localStorage.setItem("webspeak:chat-collapsed", "1");
    else localStorage.removeItem("webspeak:chat-collapsed");
  }, [chatCollapsed]);
  const dockedChatQuery = useMemo(() => window.matchMedia("(min-width: 981px)"), []);
  const [chatColumnActive, setChatColumnActive] = useState(dockedChatQuery.matches);
  useEffect(() => {
    const onChange = (event: MediaQueryListEvent) => setChatColumnActive(event.matches);
    dockedChatQuery.addEventListener("change", onChange);
    return () => dockedChatQuery.removeEventListener("change", onChange);
  }, [dockedChatQuery]);

  // 频道投影（旧 useWebClientChannels 平价；空目录回退占位行）。
  const clientId = voiceView.tsClientId;
  const channelTree = useMemo(
    () => buildChannelTree(session.channels, clientId),
    [session.channels, clientId],
  );
  const currentChannel = useMemo(
    () => findCurrentChannel(channelTree, { selectedChannelId: homeState.selectedChannelId, channelName: homeState.channelName, clientId }),
    [channelTree, homeState.selectedChannelId, homeState.channelName, clientId],
  );
  const currentChannelName = (currentChannel?.name ?? homeState.channelName) || t("voiceLobby");
  const currentMembers = useMemo(() => {
    const source = currentChannel ? currentChannel.members : session.members;
    return source.map((member) => ({ ...member, isSelf: member.isSelf || member.id === clientId }));
  }, [currentChannel, session.members, clientId]);
  const memberChannels = useMemo(
    () => deriveMemberChannels(channelTree, { name: currentChannelName, description: currentChannel?.description ?? "", members: currentMembers }),
    [channelTree, currentChannelName, currentChannel, currentMembers],
  );
  const filteredMemberChannels = useMemo(
    () => filterMemberChannels(memberChannels, props.memberQuery),
    [memberChannels, props.memberQuery],
  );

  // 目录就绪后补初始选台（旧 watch(channelTree) 平价）。
  useEffect(() => {
    const next = ensureSelectedChannelId(channelTree, { selectedChannelId: homeState.selectedChannelId, channelName: homeState.channelName, clientId });
    if (next !== null) home.setState({ selectedChannelId: next });
  }, [channelTree, homeState.selectedChannelId, homeState.channelName, clientId, home]);

  // 折叠记忆随服务器目标换挡（旧 watch(serverKey, read) 平价）。
  const serverKey = `${homeState.serverHost}:${homeState.serverPort}`;
  useEffect(() => {
    fold.sync(serverKey);
  }, [fold, serverKey]);

  // 移动端聊天页签显示时滚到底（旧 watch(mobileSection) 平价）。
  useEffect(() => {
    if (props.mobileSection === "chat") chat.scrollIfFollowing();
  }, [props.mobileSection, chat]);

  const railServers = homeState.favoriteServers;
  const currentAddress = `${homeState.serverHost}:${homeState.serverPort}`;
  const [railMenu, setRailMenu] = useState<{ server: FavoriteServer; x: number; y: number } | null>(null);
  const railGestures = useMemo(
    () => createLongPressContextMenu<FavoriteServer>((open) => {
      if (open.context) setRailMenu({ server: open.context, x: open.x, y: open.y });
    }),
    // setter 恒稳定：列进 deps 只为满足 React Compiler 的推断依赖，不引发重建。
    [setRailMenu],
  );
  useEffect(() => () => railGestures.dispose(), [railGestures]);

  const mobileMore = props.mobileSection === "more";

  return (
    <div
      className={cn("app-shell", `mobile-view-${props.mobileSection}`)}
      data-chat-collapsed={chatCollapsed ? "true" : "false"}
      data-performance-open={performancePanelOpen ? "true" : "false"}
      data-ws-part="voice.shell"
      onClick={() => membersController.closeMemberMenu()}
    >
      {/* 壳级状态横幅在 .workspace 之外：移动端页签切换藏不住它们。 */}
      <VoiceBanners
        reconnecting={voiceView.reconnecting}
        reconnectFailed={voiceView.reconnectFailed}
        reconnectAttempt={voiceView.reconnectAttempt}
        error={voiceView.error}
        audioNotice={voiceView.audioNotice}
        audioNoticeCode={voiceView.audioNoticeCode}
        onClearAudioNotice={voice.dismissAudioNotice}
        microphoneError={voiceView.microphoneError}
        microphoneErrorCode={voiceView.microphoneErrorCode}
        onClearMicrophoneError={voice.clearMicrophoneError}
        pokes={session.pokeNotifications}
        switchPending={switchState.pending}
        switchFailed={switchState.failed}
        playNotification={voice.playNotification}
        onReconnect={props.onReconnect}
        onLeave={props.onLeave}
        t={t}
        localizedMessage={props.localizedMessage}
        localizedAudioNotice={props.localizedAudioNotice}
        localizedMicrophoneError={props.localizedMicrophoneError}
      />

      {/* 移动端服务器条：壳级 chrome，页签切换藏不住。 */}
      {homeState.favoriteServers.length > 0 && (
        <div className="favorite-server-strip" data-ws-part="voice.favorite-server-strip" role="toolbar" aria-label={t("favoriteServers")}>
          {railServers.map((server) => (
            <Button variant="ghost"
              key={server.id}
              type="button"
              className={server.address === currentAddress ? "favorite-server-chip active" : "favorite-server-chip"}
              data-ws-part="voice.favorite-server-chip"
              aria-pressed={server.address === currentAddress}
              disabled={Boolean(switchState.pending) || voiceView.connecting}
              aria-label={t("switchToServer", { name: server.label })}
              onClick={() => props.onSwitchServer(server)}
              onPointerDown={(event) => railGestures.pointerDown(event.nativeEvent, server)}
              onPointerMove={(event) => railGestures.pointerMove(event.nativeEvent)}
              onPointerUp={() => railGestures.pointerUp()}
              onPointerCancel={() => railGestures.pointerCancel()}
              onClickCapture={(event) => railGestures.clickCapture(event.nativeEvent)}
              onContextMenu={(event) => railGestures.contextMenu(event.nativeEvent, server)}
            >
              <span className="favorite-server-chip-initial" aria-hidden="true">{avatarInitial(server.label)}</span>
              <span className="favorite-server-chip-label">{server.label}</span>
            </Button>
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" type="button" className="favorite-server-add" data-ws-part="voice.favorite-server-add" aria-label={t("addFavoriteServer")} onClick={props.onOpenFavoriteDialog}>
                <Icon name="plus" size={14} /></Button>
            </TooltipTrigger>
            <TooltipContent>{t("addFavoriteServer")}</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* 桌面 rail：open 模式的收藏 + 皮肤/语言/身份位（皮肤/身份随 P4-7/P4-5） */}
      <aside className="favorite-server-rail" data-ws-part="voice.favorite-server-rail" role="toolbar" aria-label={t("favoriteServers")}>
        {railServers.map((server) => (
          <Tooltip key={server.id}>
            <TooltipTrigger asChild>
              <Button variant="ghost"
                type="button"
                className={server.address === currentAddress ? "favorite-server-button active" : "favorite-server-button"}
                data-ws-state={server.address === currentAddress ? "current" : "idle"}
                aria-pressed={server.address === currentAddress}
                disabled={Boolean(switchState.pending) || voiceView.connecting}
                aria-label={t("switchToServer", { name: server.label })}
                onClick={() => props.onSwitchServer(server)}
                onPointerDown={(event) => railGestures.pointerDown(event.nativeEvent, server)}
                onPointerMove={(event) => railGestures.pointerMove(event.nativeEvent)}
                onPointerUp={() => railGestures.pointerUp()}
                onPointerCancel={() => railGestures.pointerCancel()}
                onClickCapture={(event) => railGestures.clickCapture(event.nativeEvent)}
                onContextMenu={(event) => railGestures.contextMenu(event.nativeEvent, server)}
              >
                <span className="favorite-server-avatar">{avatarInitial(server.label)}</span>
                {server.password && <span className="favorite-server-rail-lock"><Icon name="lock" size={9} /></span>}
              </Button>
            </TooltipTrigger>
            {/* 头像瓦片无文字，多行提示 = 名称/地址/当前标记（原 title 三行平价）。 */}
            <TooltipContent className="whitespace-pre-line">{server.address === currentAddress ? `${server.label}\n${server.address}\n${t("currentServerBadge")}` : `${server.label}\n${server.address}`}</TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" type="button" className="favorite-server-add" data-ws-part="voice.favorite-server-rail.add" aria-label={t("addFavoriteServer")} onClick={props.onOpenFavoriteDialog}>
              <Icon name="plus" size={21} /></Button>
          </TooltipTrigger>
          <TooltipContent>{t("addFavoriteServer")}</TooltipContent>
        </Tooltip>
        <ThemeToggle dark={props.theme.dark} onToggle={props.theme.onToggle} label={props.theme.label} className="rail-switcher-tile theme-toggle-tile" />
        <LanguageSwitcher language={i18n.language} onChange={i18n.setLanguage} menuLabel={props.t("languageMenu")} className="rail-switcher-tile" tile />
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="rail-identity" data-ws-part="voice.rail-identity">
              <span className="rail-identity-avatar" style={avatarStyle(homeState.nickname, true, "")} aria-hidden="true">{avatarInitial(homeState.nickname)}</span>
              <span className="rail-identity-presence" aria-hidden="true"></span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{homeState.nickname}</TooltipContent>
        </Tooltip>
      </aside>

      <VoiceWorkspace
        voice={voice}
        chat={chat}
        chatTab={chatTab}
        audioControls={props.audioControls}
        screenShare={screenShare}
        nickname={homeState.nickname}
        chatColumnActive={chatColumnActive}
        currentChannelName={currentChannelName}
        currentMembers={currentMembers}
        speakingIds={speakingIds}
        serverEvents={session.serverEvents}
        sessionMembers={session.members}
        isMobileViewport={props.isMobileViewport}
        mobileSection={props.mobileSection}
        microphoneMuted={voiceView.microphoneMuted}
        outputMuted={voiceView.outputMuted}
        language={props.language}
        onChatListElement={props.onChatListElement}
        onCollapseChat={() => setChatCollapsed(true)}
        chatCollapsed={chatCollapsed}
        onReopenChat={() => setChatCollapsed(false)}
        onLeave={props.onLeave}
        onOpenAudioSettings={props.onOpenAudioSettings}
        onMemberActions={(member) => membersController.openMemberActions(member)}
        whisperTargets={currentMembers.filter((member) => voiceView.whisperTargetIds.has(member.id))}
        whisperActive={voiceView.whisperActive}
        whisperEnabled={!props.isMobileViewport || props.mobileSection === 'voice'}
        onClearWhisperTargets={() => membersController.clearWhisperTargets()}
        t={t}
      />
      {chatColumnActive && (
        <ChatPanel
          chat={chat}
          tab={chatTab}
          language={props.language}
          currentChannelName={currentChannelName}
          mobileHidden={false}
          collapsible
          serverEvents={session.serverEvents}
          members={session.members}
          onListElement={props.onChatListElement}
          onCollapse={() => setChatCollapsed(true)}
          t={t}
        />
      )}

      <ChannelMemberPanel
        members={membersController}
        serverLabel={railServers.find((server) => server.address === currentAddress)?.label ?? currentAddress}
        filteredMemberChannels={filteredMemberChannels}
        currentChannelId={currentChannel?.id}
        mobileVisible={props.mobileSection === "channels"}
        isMobileViewport={props.isMobileViewport}
        query={props.memberQuery}
        onQueryChange={props.onMemberQueryChange}
        volumes={voiceView.volumes}
        foldedChannels={foldedChannels}
        onToggleFold={(channelId) => fold.toggle(channelId)}
        onSelectChannel={props.onSelectChannel}
        isSpeaking={(member) => speakingIds.has(member.id)}
        onVolumeInput={props.onVolumeInput}
        t={t}
      >
        {!props.isMobileViewport && (
          <AudioDock
            model={{
              microphoneMuted: voiceView.microphoneMuted,
              outputMuted: voiceView.outputMuted,
              noiseSuppressionEnabled: voiceView.noiseSuppressionEnabled,
              echoCancellationEnabled: voiceView.echoCancellationEnabled,
              autoGainControlEnabled: voiceView.autoGainControlEnabled,
              accompanimentActive: voiceView.accompanimentActive,
            }}
            controls={props.audioControls}
            voice={voice}
            share={{ active: screenShare.state.active, starting: screenShare.state.starting }}
            t={t}
            channelName={currentChannelName}
            onSettings={props.onOpenAudioSettings}
            onOutputMute={() => voice.toggleOutputMute()}
            onDisconnect={props.onLeave}
            onStartShare={() => screenShare.startSharing()}
            onStopShare={() => screenShare.stopSharing()}
            onShareSettings={() => screenShare.onSettingsOpenChange(true)}
          >
            <VoicePerformancePanel monitor={props.monitor} voice={voice} t={t} />
          </AudioDock>
        )}
      </ChannelMemberPanel>

      {mobileMore && (
        <VoiceMobileMore
          onLeave={props.onLeave}
          onOpenAudioSettings={props.onOpenAudioSettings}
          theme={props.theme}
          language={i18n.language}
          onChangeLanguage={i18n.setLanguage}
          t={t}
        />
      )}

      <nav className="mobile-nav" data-ws-part="voice.mobile-nav" aria-label={t("mobileNavigation")}>
        <Button variant="ghost" type="button" className={props.mobileSection === "channels" ? "active" : ""} aria-current={props.mobileSection === "channels" ? "page" : undefined} onClick={() => selectMobileSection("channels")}>
          <Icon name="volume" size={18} />
          <span>{t("mobileChannels")}</span>
        </Button>
        <Button variant="ghost" type="button" className={props.mobileSection === "chat" ? "active" : ""} aria-current={props.mobileSection === "chat" ? "page" : undefined} onClick={() => selectMobileSection("chat")}>
          <Icon name="message" size={18} />
          <span>{t("mobileChat")}</span>
        </Button>
        <Button variant="ghost" type="button" className={props.mobileSection === "voice" ? "active" : ""} aria-current={props.mobileSection === "voice" ? "page" : undefined} onClick={() => selectMobileSection("voice")}>
          <Icon name="mic" size={18} />
          <span>{t("mobileVoice")}</span>
        </Button>
        <Button variant="ghost" type="button" className={props.mobileSection === "more" ? "active" : ""} aria-current={props.mobileSection === "more" ? "page" : undefined} onClick={() => selectMobileSection("more")}>
          <Icon name="more" size={18} />
          <span>{t("mobileMore")}</span>
        </Button>
      </nav>

      <MemberActionsMenu
        members={membersController}
        isMobileViewport={props.isMobileViewport}
        volumes={voiceView.volumes}
        whisperTargetIds={voiceView.whisperTargetIds}
        t={t}
        onPrivateChat={(targetClientId) => chat.openPrivateChat(targetClientId)}
        onVolumeInput={(clientId, event) => props.onVolumeInput(clientId, Number(event.target.value) / 100)}
      />

      {railMenu && (
        <ServerContextMenu
          server={railMenu.server}
          position={railMenu}
          part="voice.server-context-menu"
          inRoom
          isMobileViewport={props.isMobileViewport}
          t={t}
          onSwitch={props.onSwitchServer}
          onEdit={props.onEditFavorite}
          onRemoveFavorite={props.onRemoveFavorite}
          onClose={() => setRailMenu(null)}
        />
      )}
    </div>
  );

  function selectMobileSection(section: MobileSection): void {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    membersController.closeMemberMenu();
    props.onMobileSectionChange(section);
  }
}
