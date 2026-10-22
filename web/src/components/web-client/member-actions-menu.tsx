import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useStore } from "zustand";

import { Icon } from "./icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import type { ChannelMember } from "@shared/voice-models";
import type { MembersController } from "@/web-client/members-controller";

interface MemberActionsMenuProps {
  members: MembersController;
  isMobileViewport: boolean;
  volumes: Record<number, number>;
  whisperTargetIds: ReadonlySet<number>;
  t(key: string, variables?: Record<string, string | number>): string;
  onPrivateChat(clientId: number): void;
  onVolumeInput(clientId: number, event: { target: { value: string } }): void;
}

/** 成员右键/长按菜单：桌面迁 Radix DropdownMenu（UI 迁移批 1）——坐标锚零尺寸
 *  触发钮 portal 到 body（join 卡 backdrop-filter 包含块问题与服务器菜单同款），
 *  摆位/子菜单/键盘导航归原语，member-menu-placement 服务退役；≤740 保留旧
 *  底部面板标记（CSS 定位 + backdrop，cascade-locks 钉着的形态不动）。菜单外
 *  滚动即关闭保留（坐标锚不跟行，滚完会盖错行）。音量滑条 onKeyDown 截停：
 *  否则 radix 内容级键盘导航会抢走滑条的箭头键。 */
export function MemberActionsMenu({ members, isMobileViewport, volumes, whisperTargetIds, t, onPrivateChat, onVolumeInput }: MemberActionsMenuProps) {
  const menu = useStore(members.store);
  const guardArmed = useRef(false);
  const memberMenu = menu.memberMenu;

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

  // 坐标锚不随成员树滚动：菜单外任何滚动（菜单自身内滚除外）即关闭。
  useEffect(() => {
    if (isMobileViewport || !memberMenu) return;
    function onWindowScroll(event: Event): void {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-ws-part="voice.context-menu"], [data-ws-part="voice.context-menu.move-submenu"]')) return;
      members.closeMemberMenu();
    }
    window.addEventListener("scroll", onWindowScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", onWindowScroll, { capture: true });
  }, [isMobileViewport, memberMenu, members]);

  if (!memberMenu) return null;
  const member: ChannelMember = memberMenu.member;
  const volume = volumes[member.id] ?? 1;
  const currentChannel = members.memberMoveMenuCurrentChannel();
  const sameChannel = members.memberMoveMenuCurrentSameChannel();
  const otherChannels = members.memberMoveMenuOtherChannels();

  const volumeRow = (
    <div
      className="menu-volume"
      onKeyDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <span>{t("memberVolume")}</span>
      <Slider
        value={[Math.round(volume * 100)]}
        max={400}
        step={5}
        aria-label={`${t("memberVolume")} ${Math.round(volume * 100)}%`}
        onValueChange={(values) => onVolumeInput(member.id, { target: { value: String(values[0]) } })}
      />
      <strong className="menu-volume-value">{Math.round(volume * 100)}%</strong>
    </div>
  );

  if (isMobileViewport) {
    return (
      <>
        <div className="member-menu-backdrop" data-ws-part="voice.context-menu-backdrop" onClick={() => members.closeMemberMenu()} />
        <div className="member-context-menu ws-popup" data-ws-part="voice.context-menu" onClick={(event) => event.stopPropagation()}>
          <div className="member-menu-header" data-ws-part="voice.context-menu.header">
            <strong>{member.nickname}</strong>
            <button type="button" className="member-menu-close" aria-label={t("close")} onClick={() => members.closeMemberMenu()}>
              <Icon name="close" size={17} />
            </button>
          </div>
          {volumeRow}
          <button type="button" className="ws-menu-item" onClick={() => { onPrivateChat(member.id); members.closeMemberMenu(); }}>
            <Icon name="message" size={15} />
            {" "}
            {t("privateMessage")}
          </button>
          <button type="button" className="ws-menu-item" onClick={() => { members.pokeMember(member); members.closeMemberMenu(); }}>
            <Icon name="bell" size={15} />
            {" "}
            {t("poke")}
          </button>
          <button type="button" className="ws-menu-item" onClick={() => { members.toggleWhisperTarget(member); members.closeMemberMenu(); }}>
            <Icon name="mic" size={15} />
            {" "}
            {whisperTargetIds.has(member.id) ? t("removeWhisperTarget") : t("setWhisperTarget")}
          </button>
          <button type="button" className="ws-menu-item" onClick={() => { members.copyMemberName(member); members.closeMemberMenu(); }}>
            <Icon name="copy" size={15} />
            {" "}
            {t("copyNickname")}
          </button>
          <button type="button" className="ws-menu-item" aria-expanded={menu.memberMoveMenuOpen} onClick={() => members.toggleMemberMoveMenu()}>
            <Icon name="chevron-right" size={15} />
            {" "}
            <span>{t("moveMemberMenu")}</span>
            <Icon name="chevron-right" size={13} className="member-menu-submenu-arrow" />
          </button>
          {menu.memberMoveMenuOpen && (
            <div className="member-submenu-panel" data-ws-part="voice.context-menu.move-submenu">
              {currentChannel && (
                <button type="button" className="ws-menu-item" disabled={sameChannel} onClick={() => members.moveMemberDirect(member, currentChannel.id)}>
                  <Icon name="users" size={15} />
                  <span>{t("moveMemberMyChannel")}</span>
                  <small>{currentChannel.name}</small>
                </button>
              )}
              {otherChannels.map((targetChannel) => (
                <button key={targetChannel.id} type="button" className="ws-menu-item" onClick={() => members.moveMemberDirect(member, targetChannel.id)}>
                  <Icon name="volume" size={15} />
                  <span>{targetChannel.name}</span>
                </button>
              ))}
              {!currentChannel && !otherChannels.length && (
                <span className="member-submenu-empty">{t("moveMemberNoChannels")}</span>
              )}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <DropdownMenu open onOpenChange={(next) => { if (!next) members.closeMemberMenu(); }}>
      {/* 坐标锚：零尺寸固定触发钮 portal 到 body（含 backdrop-filter 祖先的包含块
          问题，见服务器菜单切片）；body 无缩放，client 坐标直用。 */}
      {createPortal(
        <DropdownMenuTrigger
          aria-hidden
          tabIndex={-1}
          style={{
            position: "fixed",
            left: memberMenu.x,
            top: memberMenu.y,
            width: 0,
            height: 0,
            pointerEvents: "none",
          }}
        />,
        document.body,
      )}
      <DropdownMenuContent
        data-ws-part="voice.context-menu"
        align="start"
        sideOffset={2}
        onPointerDownOutside={armClickGuard}
        // portal 内容的 click 按 React 父链冒泡：不截停会摸到祖先的
        // closeMemberMenu 类 onClick（旧自绘标记上的 stopPropagation 平价）。
        onClick={(event) => event.stopPropagation()}
        className="min-w-56"
      >
        <div className="member-menu-header" data-ws-part="voice.context-menu.header">
          <strong>{member.nickname}</strong>
          <button type="button" className="member-menu-close" aria-label={t("close")} onClick={() => members.closeMemberMenu()}>
            <Icon name="close" size={17} />
          </button>
        </div>
        {volumeRow}
        <DropdownMenuItem onSelect={() => onPrivateChat(member.id)}>
          <Icon name="message" size={15} />
          <span>{t("privateMessage")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => members.pokeMember(member)}>
          <Icon name="bell" size={15} />
          <span>{t("poke")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => members.toggleWhisperTarget(member)}>
          <Icon name="mic" size={15} />
          <span>{whisperTargetIds.has(member.id) ? t("removeWhisperTarget") : t("setWhisperTarget")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => members.copyMemberName(member)}>
          <Icon name="copy" size={15} />
          <span>{t("copyNickname")}</span>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Icon name="chevron-right" size={15} />
            <span>{t("moveMemberMenu")}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent data-ws-part="voice.context-menu.move-submenu">
            {currentChannel && (
              <DropdownMenuItem disabled={sameChannel} onSelect={() => members.moveMemberDirect(member, currentChannel.id)}>
                <Icon name="users" size={15} />
                <span className="truncate">{t("moveMemberMyChannel")}</span>
                <small className="truncate text-foreground-subtle">{currentChannel.name}</small>
              </DropdownMenuItem>
            )}
            {otherChannels.map((targetChannel) => (
              <DropdownMenuItem key={targetChannel.id} onSelect={() => members.moveMemberDirect(member, targetChannel.id)}>
                <Icon name="volume" size={15} />
                <span className="truncate">{targetChannel.name}</span>
              </DropdownMenuItem>
            ))}
            {!currentChannel && !otherChannels.length && (
              <span className="member-submenu-empty">{t("moveMemberNoChannels")}</span>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
