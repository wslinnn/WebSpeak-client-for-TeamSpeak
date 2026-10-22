import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import { Icon } from "./icon";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { avatarInitial, avatarStyle } from "@/web-client/avatar";
import type { MembersController } from "@/web-client/members-controller";
import type { TreeChannel } from "@/web-client/channel-tree";
import type { ChannelMember } from "@shared/voice-models";
import type { FavoriteServer } from "@/services/local-persistence";
import { cn } from "@/lib/utils";

interface ChannelMemberPanelProps {
  members: MembersController;
  serverLabel: string;
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
  children?: React.ReactNode;
  t(key: string, variables?: Record<string, string | number>): string;
}

const DRAG_EDGE_PX = 44;

/** 成员面板（旧 ChannelMemberPanel.vue 平价）：服务器头+状态/搜索、频道树
 *  （单击选中、双击/Enter 进房、折叠分支保挂载做网格插值）、成员行（拖拽换频道
 *  + 树边缘自动滚动）、≡ 服务器切换器（Radix DropdownMenu，portal 落 body）。 */
export function ChannelMemberPanel(props: ChannelMemberPanelProps) {
  const { members, t } = props;
  const menu = useStore(members.store);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // KAAK 式进房交互：单击只点亮行内 join 提示（面板本地态，不动连接层选台），
  // 双击（或 Enter）提交换台；落台后清除。
  const [pendingJoinId, setPendingJoinId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const autoScroll = useRef({ frame: 0, delta: 0 });
  const guardArmed = useRef(false);

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

  // radix 在 pointerdown 外点即收起浮层，随后的合成 click 会落进新暴露的
  // 面板内容（旧 backdrop 会吞掉它）——一次性捕获守卫平价。
  function armClickGuard(): void {
    if (guardArmed.current) return;
    guardArmed.current = true;
    const swallow = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => {
      document.removeEventListener("click", swallow, { capture: true });
      guardArmed.current = false;
    }, 400);
  }

  // 搜索框聚焦同理：等挂载提交后再 focus。
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  function toggleSearch(): void {
    setSearchOpen((open) => !open);
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
        <DropdownMenu open={switcherOpen} onOpenChange={setSwitcherOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="member-server-menu"
              data-ws-part="voice.server-switcher.trigger"
              aria-label={t("favoriteServers")}
              title={t("favoriteServers")}
            >
              <Icon name="menu" size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="end"
            sideOffset={6}
            className="member-server-switcher"
            data-ws-part="voice.server-switcher"
            onPointerDownOutside={armClickGuard}
          >
            {props.switcherServers.map((server) => (
              <DropdownMenuItem
                key={server.id}
                className="member-server-switcher-item"
                data-ws-state={server.address === props.currentAddress ? "current" : "idle"}
                onSelect={() => props.onSwitchServer(server)}
              >
                <span className="member-server-switcher-icon" style={avatarStyle(server.label, false, "")}>{avatarInitial(server.label)}</span>
                <span className="member-server-switcher-label">{server.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
                  data-password-protected={channelItem.passwordProtected ? "true" : undefined}
                  aria-current={current ? "true" : undefined}
                  title={channelItem.passwordProtected ? `${t("switchChannel")} · ${t("channelPasswordRequired")}` : t("switchChannel")}
                  onClick={() => setPendingJoinId(channelItem.id)}
                  onDoubleClick={() => props.onSelectChannel(channelItem)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); props.onSelectChannel(channelItem); } }}
                >
                  <Icon name={channelItem.passwordProtected ? "lock" : "volume"} size={17} />
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
                              <strong>
                                {member.isSelf ? member.nickname : members.memberDisplayName(member)}
                                {member.isSelf && <em className="member-self-tag">{t("you")}</em>}
                              </strong>
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
                                <Slider
                                  className="w-11"
                                  value={[Math.round(volume * 100)]}
                                  max={400}
                                  step={5}
                                  aria-label={`${t("memberVolume")} ${Math.round(volume * 100)}%`}
                                  onValueChange={(values) => props.onVolumeInput(member.id, (values[0] ?? 0) / 100)}
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
    </aside>
  );
}

