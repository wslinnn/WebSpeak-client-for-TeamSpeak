import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import { Icon } from "./icon";
import { placeMemberMenu, placeMemberSubmenu } from "@/services/member-menu-placement";
import type { ChannelMember } from "@shared/voice-models";
import type { MembersController } from "@/web-client/members-controller";

interface MemberActionsMenuProps {
  members: MembersController;
  isMobileViewport: boolean;
  volumes: Record<number, number>;
  whisperTargetIds: ReadonlySet<number>;
  rangeStyle(value: number, max: number): Record<string, string>;
  t(key: string, variables?: Record<string, string | number>): string;
  onPrivateChat(clientId: number): void;
  onVolumeInput(clientId: number, event: React.ChangeEvent<HTMLInputElement>): void;
}

/** 成员右键菜单（旧 MemberActionsMenu.vue 平价）：音量/私聊/poke/耳语/复制昵称/
 *  移人子菜单。fixed 定位随 --ui-scale 折算；桌面端菜单外滚动即关闭（菜单位置
 *  会跟错行），菜内滚动保留。 */
export function MemberActionsMenu({ members, isMobileViewport, volumes, whisperTargetIds, rangeStyle, t, onPrivateChat, onVolumeInput }: MemberActionsMenuProps) {
  const menu = useStore(members.store);
  const memberMenu = menu.memberMenu;
  const [menuStyle, setMenuStyle] = useState<Record<string, string>>({});
  const [submenuStyle, setSubmenuStyle] = useState<Record<string, string>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 无菜单时元素已卸载，残留样式无消费者；移动端定位走 CSS，不做 JS 摆位。
    const el = menuRef.current;
    if (!memberMenu || isMobileViewport || !el) return;
    const updatePlacement = () => {
      const scale = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const bounds = el.getBoundingClientRect();
      const point = placeMemberMenu(memberMenu, bounds, viewport);
      const limits: Record<string, string> = {
        maxHeight: `${Math.max(0, viewport.height - 24) / scale}px`,
        maxWidth: `${Math.max(0, viewport.width - 24) / scale}px`,
        overflowY: "auto",
      };
      setMenuStyle({ ...limits, left: `${point.x / scale}px`, top: `${point.y / scale}px` });
      const submenu = submenuRef.current;
      const trigger = el.querySelector(".member-menu-submenu-trigger");
      if (!submenu || !trigger) return;
      const anchor = trigger.getBoundingClientRect();
      // 主菜单位置与子菜单度量同帧提交：按未偏移的锚点反推。
      const submenuPoint = placeMemberSubmenu({
        left: anchor.left + point.x - bounds.left,
        right: anchor.right + point.x - bounds.left,
        top: anchor.top + point.y - bounds.top,
      }, submenu.getBoundingClientRect(), viewport, 6 * scale);
      setSubmenuStyle({ ...limits, position: "fixed", right: "auto", left: `${submenuPoint.x / scale}px`, top: `${submenuPoint.y / scale}px` });
    };
    updatePlacement();
    const observer = new ResizeObserver(updatePlacement);
    observer.observe(el);
    if (submenuRef.current) observer.observe(submenuRef.current);
    window.addEventListener("resize", updatePlacement);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePlacement);
    };
  }, [memberMenu, isMobileViewport, menu.memberMoveMenuOpen]);

  useEffect(() => {
    // fixed 菜单下的成员树滚动会让菜单跟错行：菜单外任意滚动即关闭。
    function onWindowScroll(event: Event): void {
      if (isMobileViewport) return;
      const target = event.target;
      if (target instanceof Node && (menuRef.current?.contains(target) || submenuRef.current?.contains(target))) return;
      members.closeMemberMenu();
    }
    window.addEventListener("scroll", onWindowScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", onWindowScroll, { capture: true });
  }, [isMobileViewport, members]);

  if (!memberMenu) return null;
  const member: ChannelMember = memberMenu.member;
  const volume = volumes[member.id] ?? 1;
  const currentChannel = members.memberMoveMenuCurrentChannel();
  const sameChannel = members.memberMoveMenuCurrentSameChannel();
  const otherChannels = members.memberMoveMenuOtherChannels();

  return (
    <>
      {isMobileViewport && (
        <div className="member-menu-backdrop" data-ws-part="voice.context-menu-backdrop" onClick={() => members.closeMemberMenu()} />
      )}
      <div ref={menuRef} className="member-context-menu" data-ws-part="voice.context-menu" style={menuStyle} onClick={(event) => event.stopPropagation()}>
        <div className="member-menu-header" data-ws-part="voice.context-menu.header">
          <strong>{member.nickname}</strong>
          <button type="button" className="member-menu-close" aria-label={t("close")} onClick={() => members.closeMemberMenu()}>
            <Icon name="close" size={17} />
          </button>
        </div>
        <label className="menu-volume">
          <span>{t("memberVolume")}</span>
          <input
            type="range"
            min={0}
            max={400}
            step={5}
            value={volume * 100}
            style={rangeStyle(volume / 4, 1)}
            aria-label={`${t("memberVolume")} ${Math.round(volume * 100)}%`}
            onChange={(event) => onVolumeInput(member.id, event)}
          />
          <strong className="menu-volume-value">{Math.round(volume * 100)}%</strong>
        </label>
        <button type="button" onClick={() => { onPrivateChat(member.id); members.closeMemberMenu(); }}>
          <Icon name="message" size={15} />
          {" "}
          {t("privateMessage")}
        </button>
        <button type="button" onClick={() => { members.pokeMember(member); members.closeMemberMenu(); }}>
          <Icon name="bell" size={15} />
          {" "}
          {t("poke")}
        </button>
        <button type="button" onClick={() => { members.toggleWhisperTarget(member); members.closeMemberMenu(); }}>
          <Icon name="mic" size={15} />
          {" "}
          {whisperTargetIds.has(member.id) ? t("removeWhisperTarget") : t("setWhisperTarget")}
        </button>
        <button type="button" onClick={() => { members.copyMemberName(member); members.closeMemberMenu(); }}>
          <Icon name="copy" size={15} />
          {" "}
          {t("copyNickname")}
        </button>
        <div className="member-menu-submenu" onMouseEnter={() => { if (!isMobileViewport) members.store.setState({ memberMoveMenuOpen: true }); }}>
          <button type="button" className="member-menu-submenu-trigger" aria-expanded={menu.memberMoveMenuOpen} onClick={() => members.toggleMemberMoveMenu()}>
            <Icon name="chevron-right" size={15} />
            {" "}
            <span>{t("moveMemberMenu")}</span>
            <Icon name="chevron-right" size={13} className="member-menu-submenu-arrow" />
          </button>
          {menu.memberMoveMenuOpen && (
            <div ref={submenuRef} style={submenuStyle} className="member-submenu-panel" data-ws-part="voice.context-menu.move-submenu" onClick={(event) => event.stopPropagation()}>
              {currentChannel && (
                <button type="button" disabled={sameChannel} onClick={() => members.moveMemberDirect(member, currentChannel.id)}>
                  <Icon name="users" size={15} />
                  <span>{t("moveMemberMyChannel")}</span>
                  <small>{currentChannel.name}</small>
                </button>
              )}
              {otherChannels.map((targetChannel) => (
                <button key={targetChannel.id} type="button" onClick={() => members.moveMemberDirect(member, targetChannel.id)}>
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
      </div>
    </>
  );
}
