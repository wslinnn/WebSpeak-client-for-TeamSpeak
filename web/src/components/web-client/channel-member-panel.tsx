import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "zustand";

import { Icon } from "./icon";
import { avatarInitial, avatarStyle } from "@/web-client/avatar";
import type { MembersController } from "@/web-client/members-controller";
import type { TreeChannel } from "@/web-client/channel-tree";
import type { ChannelMember } from "@shared/voice-models";
import type { FavoriteServer } from "@/services/local-persistence";
import { cn } from "@/lib/utils";

interface ChannelMemberPanelProps {
  members: MembersController;
  serverLabel: string;
  welcomeMessage: string;
  filteredMemberChannels: readonly TreeChannel[];
  currentChannelId?: string;
  mobileVisible: boolean;
  isMobileViewport: boolean;
  query: string;
  onQueryChange(query: string): void;
  volumes: Record<number, number>;
  foldedChannels: ReadonlySet<string>;
  onToggleFold(channelId: string): void;
  switcherServers: readonly FavoriteServer[];
  currentAddress: string;
  onSwitchServer(server: FavoriteServer): void;
  onSelectChannel(channel: TreeChannel): void;
  isSpeaking(member: ChannelMember): boolean;
  onVolumeInput(clientId: number, value: number): void;
  rangeStyle(value: number, max: number): Record<string, string>;
  /** 服务器切换器 teleport 的宿主（.web-client 根，由父组件解析）。 */
  switcherHost: HTMLElement | null;
  children?: React.ReactNode;
  t(key: string, variables?: Record<string, string | number>): string;
}

const DRAG_EDGE_PX = 44;

/** 成员面板（旧 ChannelMemberPanel.vue 平价）：服务器头+状态/搜索、频道树
 *  （单击选中、双击/Enter 进房、折叠分支保挂载做网格插值）、成员行（拖拽换频道
 *  + 树边缘自动滚动）、≡ 服务器切换器（teleport 到 .web-client 根）。 */
export function ChannelMemberPanel(props: ChannelMemberPanelProps) {
  const { members, t } = props;
  const menu = useStore(members.store);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // KAAK 式进房交互：单击只点亮行内 join 提示（面板本地态，不动连接层选台），
  // 双击（或 Enter）提交换台；落台后清除。
  const [pendingJoinId, setPendingJoinId] = useState<string | null>(null);
  const switcherTriggerRef = useRef<HTMLButtonElement | null>(null);
  const switcherMenuRef = useRef<HTMLDivElement | null>(null);
  const [switcherStyle, setSwitcherStyle] = useState<Record<string, string>>({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const autoScroll = useRef({ frame: 0, delta: 0 });

  // 落台即清除行内 join 提示（旧 watch(currentChannelId) 平价；render 期调态是
  // React 文档认可的「随 props 调整状态」写法，绕开 effect 级联渲染）。
  const [prevChannelId, setPrevChannelId] = useState(props.currentChannelId);
  if (prevChannelId !== props.currentChannelId) {
    setPrevChannelId(props.currentChannelId);
    setPendingJoinId(null);
  }

  useEffect(() => {
    function onKeydown(event: KeyboardEvent): void {
      if (event.key === "Escape") setSwitcherOpen(false);
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  useEffect(() => () => stopAutoScroll(), []);

  function updateSwitcherPlacement(): void {
    const menuEl = switcherMenuRef.current;
    const trigger = switcherTriggerRef.current;
    if (!menuEl || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - menuEl.offsetWidth, window.innerWidth - menuEl.offsetWidth - 8));
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - menuEl.offsetHeight - 8));
    setSwitcherStyle({ left: `${left}px`, top: `${top}px` });
    menuEl.focus();
  }

  function toggleSwitcher(): void {
    setSwitcherOpen((open) => {
      if (!open) queueMicrotask(updateSwitcherPlacement);
      return !open;
    });
  }

  function toggleSearch(): void {
    setSearchOpen((open) => {
      if (!open) queueMicrotask(() => searchInputRef.current?.focus());
      return !open;
    });
  }

  const searchActive = props.query.trim().length > 0;
  const isFolded = (id: string): boolean => !searchActive && props.foldedChannels.has(id);

  // 拖拽中靠近树顶/底边自动滚动，让屏外频道成为可落点；速度随贴近程度爬升。
  function stepAutoScroll(): void {
    autoScroll.current.frame = 0;
    const tree = treeRef.current;
    if (!tree || !menu.draggedMember || !autoScroll.current.delta) return;
    tree.scrollTop += autoScroll.current.delta;
    autoScroll.current.frame = requestAnimationFrame(stepAutoScroll);
  }
  function stopAutoScroll(): void {
    if (autoScroll.current.frame) cancelAnimationFrame(autoScroll.current.frame);
    autoScroll.current.frame = 0;
    autoScroll.current.delta = 0;
  }
  function onTreePointerMove(event: React.PointerEvent): void {
    members.onMemberPointerMove(event.nativeEvent);
    const tree = treeRef.current;
    if (!tree || !menu.draggedMember) {
      stopAutoScroll();
      return;
    }
    const rect = tree.getBoundingClientRect();
    if (event.clientY < rect.top + DRAG_EDGE_PX) {
      autoScroll.current.delta = -Math.ceil((rect.top + DRAG_EDGE_PX - event.clientY) / 6);
    } else if (event.clientY > rect.bottom - DRAG_EDGE_PX) {
      autoScroll.current.delta = Math.ceil((event.clientY - (rect.bottom - DRAG_EDGE_PX)) / 6);
    } else {
      stopAutoScroll();
      return;
    }
    if (!autoScroll.current.frame) autoScroll.current.frame = requestAnimationFrame(stepAutoScroll);
  }
  function onTreePointerEnd(event: React.PointerEvent): void {
    stopAutoScroll();
    members.onMemberPointerUp(event.nativeEvent);
  }
  function onTreePointerCancel(event: React.PointerEvent): void {
    stopAutoScroll();
    members.onMemberPointerCancel(event.nativeEvent);
  }

  return (
    <aside className={cn("member-panel", { "mobile-section-visible": props.mobileVisible })} data-ws-part="voice.member-panel">
      <div className="member-server-header" data-ws-part="voice.server-header">
        <strong>{props.serverLabel}</strong>
        <button
          ref={switcherTriggerRef}
          type="button"
          className="member-server-menu"
          data-ws-part="voice.server-switcher.trigger"
          aria-expanded={switcherOpen}
          aria-label={t("favoriteServers")}
          title={t("favoriteServers")}
          onClick={toggleSwitcher}
        >
          <Icon name="menu" size={16} />
        </button>
      </div>
      <div className="member-server-meta" data-ws-part="voice.server-meta">
        <span className="member-server-kind">TeamSpeak</span>
        <button
          type="button"
          className={menu.away ? "status-button active" : "status-button"}
          aria-pressed={!menu.away}
          onClick={() => members.toggleAway()}
        >
          <span className="status-dot" />
          {menu.away ? t("away") : t("available")}
        </button>
        <button
          type="button"
          className="member-search-toggle"
          aria-expanded={searchOpen}
          aria-label={t("searchMembers")}
          title={t("searchMembers")}
          onClick={toggleSearch}
        >
          <Icon name="search" size={15} />
        </button>
      </div>
      {props.welcomeMessage && (
        <div className="member-server-welcome" data-ws-part="voice.server-welcome">
          <span className="member-server-welcome-icon" aria-hidden="true"><Icon name="message" size={13} /></span>
          <div>
            <strong>{t("serverWelcome")}</strong>
            <p>{props.welcomeMessage}</p>
          </div>
        </div>
      )}
      <div className="member-panel-heading" data-ws-part="voice.member-panel.heading">
        <div><h2>{t("people")}</h2></div>
      </div>
      <div className={cn("member-search", { "search-open": searchOpen || props.query.trim().length > 0 })} data-ws-part="voice.member-panel.search">
        <Icon name="search" size={15} />
        <input
          ref={searchInputRef}
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder={t("searchMembers")}
          aria-label={t("searchMembers")}
        />
      </div>
      <div ref={treeRef} className="member-tree" data-ws-part="voice.member-panel.channels">
        <div className="member-group-label" data-ws-part="voice.group-label">{t("voiceGroup")}</div>
        {props.filteredMemberChannels.map((channelItem) => {
          const current = props.currentChannelId === channelItem.id;
          const selected = pendingJoinId === channelItem.id;
          const dragOver = menu.dragOverChannelId === channelItem.id;
          const folded = isFolded(channelItem.id);
          return (
            <section
              key={channelItem.id}
              className={cn("member-channel-group", { current, selected, "drag-over": dragOver, folded })}
              data-ws-part="voice.channel-group"
              data-ws-state={current ? "current" : dragOver ? "drag-over" : "idle"}
              data-member-channel-id={channelItem.id}
              style={{ marginLeft: `${channelItem.depth * 14}px` }}
              onPointerMove={onTreePointerMove}
              onPointerUp={onTreePointerEnd}
              onPointerCancel={onTreePointerCancel}
            >
              <div className="member-channel-heading-row" data-ws-part="voice.channel-group.heading-row">
                <button
                  className="member-channel-heading"
                  data-ws-part="voice.channel-group.heading"
                  data-ws-state={current ? "current" : "idle"}
                  aria-current={current ? "true" : undefined}
                  title={t("switchChannel")}
                  onClick={() => setPendingJoinId(channelItem.id)}
                  onDoubleClick={() => props.onSelectChannel(channelItem)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); props.onSelectChannel(channelItem); } }}
                >
                  <Icon name="volume" size={17} />
                  <span>{channelItem.name}</span>
                  <small>{channelItem.members.length}</small>
                  {selected && !current && <em className="member-channel-join-hint">{t("doubleClickToJoin")}</em>}
                </button>
                <button
                  type="button"
                  className="member-channel-fold"
                  data-ws-part="voice.channel-group.fold"
                  aria-expanded={!folded}
                  aria-label={folded ? t("expandChannel") : t("collapseChannel")}
                  onClick={() => props.onToggleFold(channelItem.id)}
                >
                  <Icon name="chevron-down" size={14} />
                </button>
              </div>
              {/* 折叠分支保挂载：单行网格在 1fr/0fr 间插值（.member-channel-branch） */}
              <div className="member-channel-branch" data-expanded={folded ? "false" : "true"}>
                <div className="member-channel-branch-content">
                  {channelItem.members.length ? (
                    <div className="member-list" data-ws-part="voice.channel-group.members" role="list">
                      {channelItem.members.map((member) => {
                        const speaking = props.isSpeaking(member);
                        const volume = props.volumes[member.id] ?? 1;
                        return (
                          <div
                            key={`${channelItem.id}-${member.id}`}
                            className={cn("member-row", { dragging: menu.draggedMember?.id === member.id })}
                            data-ws-part="voice.member-row"
                            role="listitem"
                            data-ws-state={menu.draggedMember?.id === member.id ? "dragging" : speaking ? "speaking" : "connected"}
                            onPointerDown={(event) => members.onMemberPointerDown(member, event.nativeEvent)}
                            onPointerMove={onTreePointerMove}
                            onPointerUp={onTreePointerEnd}
                            onPointerCancel={onTreePointerCancel}
                            onContextMenu={(event) => members.onMemberContextMenu(member, event.nativeEvent)}
                          >
                            <div
                              className={speaking ? "member-avatar speaking" : "member-avatar"}
                              data-ws-part="voice.member-row.avatar"
                              style={avatarStyle(member.nickname, Boolean(member.isSelf), member.avatar ?? "")}
                            >
                              {member.avatar ? "" : avatarInitial(member.nickname)}
                              <span className="member-presence" />
                            </div>
                            <div className="member-copy" data-ws-part="voice.member-row.copy">
                              {member.isSelf ? (
                                <strong>{member.nickname}<em className="member-self-tag">{t("you")}</em></strong>
                              ) : (
                                <button type="button" className="member-name-button" aria-label={t("moreMemberOptions")} onClick={(event) => { event.stopPropagation(); members.openMemberActions(member); }}>
                                  {members.memberDisplayName(member)}
                                </button>
                              )}
                              {(member.away === true || speaking) && <span>{member.away === true ? t("away") : t("speaking")}</span>}
                            </div>
                            <div className="member-flags" data-ws-part="voice.member-row.flags" aria-label={t("memberStates")}>
                              {member.away && <span title={t("away")} aria-label={t("away")}><Icon name="clock" size={13} /></span>}
                              {member.inputMuted && <span title={t("inputMuted")} aria-label={t("inputMuted")}><Icon name="mic-off" size={13} /></span>}
                              {member.outputMuted && <span title={t("outputMuted")} aria-label={t("outputMuted")}><Icon name="volume-off" size={13} /></span>}
                              {member.channelCommander && <span title={t("channelCommander")} aria-label={t("channelCommander")}><Icon name="shield" size={13} /></span>}
                            </div>
                            {!member.isSelf && (
                              <div className="member-volume" data-ws-part="voice.member-row.volume" onPointerDown={(event) => event.stopPropagation()}>
                                <Icon name={volume === 0 ? "volume-off" : "volume"} size={14} />
                                <input
                                  type="range"
                                  min={0}
                                  max={400}
                                  step={5}
                                  value={volume * 100}
                                  style={props.rangeStyle(volume / 4, 1)}
                                  aria-label={`${t("memberVolume")} ${Math.round(volume * 100)}%`}
                                  onChange={(event) => props.onVolumeInput(member.id, Number(event.target.value) / 100)}
                                />
                                <span className="member-volume-value">{Math.round(volume * 100)}%</span>
                              </div>
                            )}
                            {props.isMobileViewport && !member.isSelf && (
                              <button type="button" className="member-action-button" aria-label={t("moreMemberOptions")} onClick={(event) => { event.stopPropagation(); members.openMemberActions(member); }}>
                                <Icon name="more" size={18} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="channel-no-members">{t("noMembersInChannel")}</div>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
      {!props.filteredMemberChannels.length && (
        <div className="member-empty">{t("noMatchingMembers")}</div>
      )}
      {props.children}
      {switcherOpen && props.switcherHost && createPortal(
        <>
          <div className="member-server-switcher-backdrop" data-ws-part="voice.server-switcher-backdrop" onClick={() => setSwitcherOpen(false)} />
          <div
            ref={switcherMenuRef}
            className="member-server-switcher"
            data-ws-part="voice.server-switcher"
            role="menu"
            tabIndex={-1}
            style={switcherStyle}
            onKeyDown={(event) => { if (event.key === "Escape") setSwitcherOpen(false); }}
          >
            {props.switcherServers.map((server) => (
              <button
                key={server.id}
                type="button"
                role="menuitem"
                className="member-server-switcher-item"
                data-ws-state={server.address === props.currentAddress ? "current" : "idle"}
                onClick={() => { setSwitcherOpen(false); props.onSwitchServer(server); }}
              >
                <span className="member-server-switcher-icon" style={avatarStyle(server.label, false, "")}>{avatarInitial(server.label)}</span>
                <span className="member-server-switcher-label">{server.label}</span>
              </button>
            ))}
          </div>
        </>,
        props.switcherHost,
      )}
    </aside>
  );
}

