import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./icon";
import { currentUiScale } from "@/app/ui-scale";
import { placeMemberMenu } from "@/services/member-menu-placement";
import type { FavoriteServer } from "@/services/local-persistence";

interface ServerContextMenuProps {
  server: FavoriteServer;
  position: { x: number; y: number };
  /** 皮肤作用域：进房 voice.*、首页 home.*。 */
  part: string;
  /** rail 提供「切换」；首页行点击即填表连接。 */
  inRoom: boolean;
  t(key: string, variables?: Record<string, string | number>): string;
  onSwitch(server: FavoriteServer): void;
  onEdit(server: FavoriteServer): void;
  onRemoveFavorite(server: FavoriteServer): void;
  onClose(): void;
}

/** 服务器右键/长按菜单（旧 ServerContextMenu.vue 平价）：teleport 到 .web-client 根
 *  （join 卡的 backdrop-filter 会把 fixed 后代变成包含块，把菜单推下屏）。定位用
 *  placeMemberMenu 视口夹取，Esc 关闭。 */
export function ServerContextMenu({ server, position, part, inRoom, t, onSwitch, onEdit, onRemoveFavorite, onClose }: ServerContextMenuProps) {
  // 菜单只在用户交互后挂载，.web-client 根必然已存在——惰性初始化免掉 effect 里的 setState。
  const [host] = useState(() => document.querySelector<HTMLElement>(".web-client"));
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKeydown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [onClose]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const point = placeMemberMenu(
      position,
      { width: menu.offsetWidth, height: menu.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    // 定位是外部系统更新：直接改样式，不走 setState。矩形是视觉像素，
    // .web-client 缩放子树内的内联坐标按未缩放像素解释，写入前换算。
    const scale = currentUiScale();
    menu.style.left = `${point.x / scale}px`;
    menu.style.top = `${point.y / scale}px`;
    menu.focus();
  }, [position, host]);

  if (!host) return null;

  function act(action: "switch" | "edit" | "removeFavorite"): void {
    if (action === "switch") onSwitch(server);
    else if (action === "edit") onEdit(server);
    else onRemoveFavorite(server);
    onClose();
  }

  return createPortal(
    <>
      <div
        className="server-context-menu-backdrop"
        data-ws-part={`${part}-backdrop`}
        onClick={onClose}
        onContextMenu={(event) => { event.preventDefault(); onClose(); }}
      />
      <div
        ref={menuRef}
        className="server-context-menu ws-popup"
        data-ws-part={part}
        role="menu"
        tabIndex={-1}
        onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
      >
        <strong className="server-context-menu-title">{server.label}</strong>
        {inRoom && (
          <button role="menuitem" type="button" className="ws-menu-item" onClick={() => act("switch")}>
            <Icon name="volume" size={15} />
            <span>{t("switchToServer", { name: server.label })}</span>
          </button>
        )}
        <button role="menuitem" type="button" className="ws-menu-item" onClick={() => act("edit")}>
          <Icon name="settings" size={15} />
          <span>{t("serverMenuEdit")}</span>
        </button>
        <button role="menuitem" type="button" className="ws-menu-item danger" onClick={() => act("removeFavorite")}>
          <Icon name="star" size={15} />
          <span>{t("removeFavoriteNamed", { name: server.label })}</span>
        </button>
      </div>
    </>,
    host,
  );
}
