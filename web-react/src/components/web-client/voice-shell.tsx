import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";

import { ChannelMemberPanel } from "./channel-member-panel";
import { ChatPanel } from "./chat-panel";
import { Icon } from "./icon";
import { MemberActionsMenu } from "./member-actions-menu";
import { ServerContextMenu } from "./server-context-menu";
import { VoiceBanners } from "./voice-banners";
import { VoiceMembers } from "./voice-members";
import { VoiceMobileMore } from "./voice-mobile-more";
import { useStoreOfSpeaking } from "@/hooks/useVoiceSession";
import type { VoiceSessionController } from "@/voice/session-controller";
import { buildChannelTree, deriveMemberChannels, ensureSelectedChannelId, filterMemberChannels, findCurrentChannel, type TreeChannel } from "@/web-client/channel-tree";
import { createLongPressContextMenu } from "@/services/long-press-context-menu";
import { rangeStyle, speakingNowNames } from "@/web-client/view-utils";
import type { ChatController, ChatScrollerAspect } from "@/web-client/chat-controller";
import type { MembersController } from "@/web-client/members-controller";
import type { ChannelFold } from "@/web-client/channel-fold";
import type { VoiceServerSwitch } from "@/web-client/server-switch";
import type { HomeStore } from "@/web-client/home-store";
import type { FavoriteServer } from "@/services/local-persistence";
import type { Language } from "@/i18n/web-client";
import { cn } from "@/lib/utils";

export type MobileSection = "channels" | "chat" | "voice" | "more";

interface VoiceShellProps {
  voice: VoiceSessionController;
  home: StoreApi<HomeStore>;
  chat: ChatController;
  membersController: MembersController;
  fold: ChannelFold;
  serverSwitch: VoiceServerSwitch;
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
  onVolumeInput(clientId: number, value: number): void;
  t(key: string, variables?: Record<string, string | number>): string;
  showToast(message: string, tone?: "info" | "warn"): void;
}

/** 进房壳（旧 WebClient.vue 语音态平价）：banners / 收藏 chips(≤740)+rail(≥741) /
 *  workspace（面包屑+成员卡+说话横条）/ 聊天（≥981 停靠列，其余留在工作区）/
 *  频道成员面板 / 移动端 more 面板与底部导航。AudioDock/设置/共享/耳语控件随
 *  P4-5/P4-6 回归。 */
export function VoiceShell(props: VoiceShellProps) {
  const { voice, home, chat, membersController, fold, serverSwitch, t } = props;
  const voiceView = useStore(voice.store);
  const session = useStore(voice.session.store);
  const homeState = useStore(home);
  const speakingIds = useStoreOfSpeaking(voice).speakingIds;
  const switchState = useStore(serverSwitch.store);
  // 折叠集合经订阅进渲染（直接 getState 是一次性快照，toggle 后 UI 不更新）。
  const foldedChannels = useStore(fold.store).folded;

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

  const isSpeaking = (member: { id: number }) => speakingIds.has(member.id);
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
      data-performance-open="false"
      data-ws-part="voice.shell"
      onClick={() => membersController.closeMemberMenu()}
    >
      {/* 壳级状态横幅在 .workspace 之外：移动端页签切换藏不住它们。 */}
      <VoiceBanners
        reconnecting={voiceView.reconnecting}
        reconnectFailed={voiceView.reconnectFailed}
        reconnectAttempt={voiceView.reconnectAttempt}
        error={voiceView.error}
        pokes={session.pokeNotifications}
        switchPending={switchState.pending}
        switchFailed={switchState.failed}
        playNotification={voice.playNotification}
        onReconnect={props.onReconnect}
        onLeave={props.onLeave}
        t={t}
      />

      {/* 移动端服务器条：壳级 chrome，页签切换藏不住。 */}
      {homeState.favoriteServers.length > 0 && (
        <div className="favorite-server-strip" data-ws-part="voice.favorite-server-strip" role="toolbar" aria-label={t("favoriteServers")}>
          {railServers.map((server) => (
            <button
              key={server.id}
              type="button"
              className={server.address === currentAddress ? "favorite-server-chip active" : "favorite-server-chip"}
              data-ws-part="voice.favorite-server-chip"
              aria-pressed={server.address === currentAddress}
              disabled={Boolean(switchState.pending) || voiceView.connecting}
              title={server.label}
              aria-label={t("switchToServer", { name: server.label })}
              onClick={() => props.onSwitchServer(server)}
              onPointerDown={(event) => railGestures.pointerDown(event.nativeEvent, server)}
              onPointerMove={(event) => railGestures.pointerMove(event.nativeEvent)}
              onPointerUp={() => railGestures.pointerUp()}
              onPointerCancel={() => railGestures.pointerCancel()}
              onClickCapture={(event) => railGestures.clickCapture(event.nativeEvent)}
              onContextMenu={(event) => railGestures.contextMenu(event.nativeEvent, server)}
            >
              <span className="favorite-server-chip-initial" aria-hidden="true">{initialOf(server.label)}</span>
              <span className="favorite-server-chip-label">{server.label}</span>
            </button>
          ))}
          <button type="button" className="favorite-server-add" data-ws-part="voice.favorite-server-add" aria-label={t("addFavoriteServer")} title={t("addFavoriteServer")} onClick={props.onOpenFavoriteDialog}>
            <Icon name="plus" size={14} />
          </button>
        </div>
      )}

      {/* 桌面 rail：open 模式的收藏 + 皮肤/语言/身份位（皮肤/身份随 P4-7/P4-5） */}
      <aside className="favorite-server-rail" data-ws-part="voice.favorite-server-rail" role="toolbar" aria-label={t("favoriteServers")}>
        {railServers.map((server) => (
          <button
            key={server.id}
            type="button"
            className={server.address === currentAddress ? "favorite-server-button active" : "favorite-server-button"}
            data-ws-state={server.address === currentAddress ? "current" : "idle"}
            aria-pressed={server.address === currentAddress}
            disabled={Boolean(switchState.pending) || voiceView.connecting}
            title={`${server.label}\n${server.address}`}
            aria-label={t("switchToServer", { name: server.label })}
            onClick={() => props.onSwitchServer(server)}
            onPointerDown={(event) => railGestures.pointerDown(event.nativeEvent, server)}
            onPointerMove={(event) => railGestures.pointerMove(event.nativeEvent)}
            onPointerUp={() => railGestures.pointerUp()}
            onPointerCancel={() => railGestures.pointerCancel()}
            onClickCapture={(event) => railGestures.clickCapture(event.nativeEvent)}
            onContextMenu={(event) => railGestures.contextMenu(event.nativeEvent, server)}
          >
            <span className="favorite-server-avatar">{initialOf(server.label)}</span>
            {server.password && <span className="favorite-server-rail-lock"><Icon name="lock" size={9} /></span>}
          </button>
        ))}
        <button type="button" className="favorite-server-add" data-ws-part="voice.favorite-server-rail.add" aria-label={t("addFavoriteServer")} title={t("addFavoriteServer")} onClick={props.onOpenFavoriteDialog}>
          <Icon name="plus" size={21} />
        </button>
      </aside>

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
          <div className="workspace-actions" data-ws-part="voice.header-actions" />
        </header>

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
              <VoiceMembers
                currentMembers={currentMembers}
                isMobileViewport={props.isMobileViewport}
                isSpeaking={isSpeaking}
                t={t}
                onMemberActions={(member) => membersController.openMemberActions(member)}
              />
            </section>
            {/* 说话横条与聊天面板是 workspace-content 的直接子级（旧模板平价）：
                移动端聊天页签藏 voice-section，但聊天面板用自己的 mobileHidden 显隐。 */}
            {/* 移动端聊天页签隐藏了成员卡：这条横条是唯一的「谁在说话」提示。 */}
            {props.isMobileViewport && props.mobileSection === "chat" && speakingNowNames(currentMembers, speakingIds).length > 0 && (
              <div className="whisper-strip" data-ws-part="voice.speaking-strip" role="status">
                <div className="whisper-strip-copy">
                  <strong><Icon name="volume" size={15} /> {t("speakingNow")}</strong>
                  <span>{speakingNowNames(currentMembers, speakingIds).join("、")}</span>
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
                serverEvents={session.serverEvents}
                members={session.members}
                onListElement={props.onChatListElement}
                onCollapse={() => setChatCollapsed(true)}
                t={t}
              />
            )}
          </div>
        </div>
      </main>

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
        serverLabel={connectedServerLabel(voiceView.serverName, railServers, currentAddress)}
        welcomeMessage={voiceView.serverWelcomeMessage}
        filteredMemberChannels={filteredMemberChannels}
        currentChannelId={currentChannel?.id}
        mobileVisible={props.mobileSection === "channels"}
        isMobileViewport={props.isMobileViewport}
        query={props.memberQuery}
        onQueryChange={props.onMemberQueryChange}
        volumes={voiceView.volumes}
        foldedChannels={foldedChannels}
        onToggleFold={(channelId) => fold.toggle(channelId)}
        switcherServers={railServers}
        currentAddress={currentAddress}
        onSwitchServer={props.onSwitchServer}
        onSelectChannel={props.onSelectChannel}
        isSpeaking={isSpeaking}
        onVolumeInput={props.onVolumeInput}
        rangeStyle={rangeStyle}
        switcherHost={document.querySelector<HTMLElement>(".web-client")}
        t={t}
      />

      {mobileMore && <VoiceMobileMore onLeave={props.onLeave} t={t} />}

      <nav className="mobile-nav" data-ws-part="voice.mobile-nav" aria-label={t("mobileNavigation")}>
        <button type="button" className={props.mobileSection === "channels" ? "active" : ""} aria-current={props.mobileSection === "channels" ? "page" : undefined} onClick={() => selectMobileSection("channels")}>
          <Icon name="volume" size={18} />
          <span>{t("mobileChannels")}</span>
        </button>
        <button type="button" className={props.mobileSection === "chat" ? "active" : ""} aria-current={props.mobileSection === "chat" ? "page" : undefined} onClick={() => selectMobileSection("chat")}>
          <Icon name="message" size={18} />
          <span>{t("mobileChat")}</span>
        </button>
        <button type="button" className={props.mobileSection === "voice" ? "active" : ""} aria-current={props.mobileSection === "voice" ? "page" : undefined} onClick={() => selectMobileSection("voice")}>
          <Icon name="mic" size={18} />
          <span>{t("mobileVoice")}</span>
        </button>
        <button type="button" className={props.mobileSection === "more" ? "active" : ""} aria-current={props.mobileSection === "more" ? "page" : undefined} onClick={() => selectMobileSection("more")}>
          <Icon name="more" size={18} />
          <span>{t("mobileMore")}</span>
        </button>
      </nav>

      <MemberActionsMenu
        members={membersController}
        isMobileViewport={props.isMobileViewport}
        volumes={voiceView.volumes}
        whisperTargetIds={voiceView.whisperTargetIds}
        rangeStyle={rangeStyle}
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

function initialOf(label: string): string {
  return (label.trim()[0] || "?").toUpperCase();
}

function connectedServerLabel(serverName: string, favorites: readonly FavoriteServer[], currentAddress: string): string {
  return serverName || (favorites.find((server) => server.address === currentAddress)?.label ?? currentAddress);
}
