import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "./icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FavoriteServer } from "@/services/local-persistence";
import { Button } from "@/components/ui/button";

interface ServerContextMenuProps {
  server: FavoriteServer;
  position: { x: number; y: number };
  /** 皮肤作用域：进房 voice.*、首页 home.*。 */
  part: string;
  /** rail 提供「切换」；首页行点击即填表连接。 */
  inRoom: boolean;
  /** ≤740 保留底部面板形态（刻意触控 UX）；桌面走 Radix 浮层。 */
  isMobileViewport: boolean;
  t(key: string, variables?: Record<string, string | number>): string;
  onSwitch(server: FavoriteServer): void;
  onEdit(server: FavoriteServer): void;
  onRemoveFavorite(server: FavoriteServer): void;
  onClose(): void;
}

/** 服务器右键/长按菜单：桌面迁 Radix DropdownMenu（UI 迁移批 1）——无触发器
 *  受控菜单，virtualRef 把锚钉在长按/右键坐标上，视口夹取归 popper；≤740 走旧
 *  底部面板标记（CSS 定位，长按拇指可达性优先）。外点关闭必须武装一次性尾随
 *  click 吞噬：旧遮罩天然吞掉外点透传，radix 关闭后同一手势的 click 会落在
 *  新暴露的元素上（首页即「连接」，实案为误触断连同款）。 */
export function ServerContextMenu({ server, position, part, inRoom, isMobileViewport, t, onSwitch, onEdit, onRemoveFavorite, onClose }: ServerContextMenuProps) {
  const guardArmed = useRef(false);
  // 移动分支的旧类选择器要求 .web-client 祖先，且 join 卡的 backdrop-filter 会把
  // fixed 后代变成包含块——菜单只在用户交互后挂载，根必然已存在，惰性初始化即可。
  const [host] = useState(() => document.querySelector<HTMLElement>(".web-client"));

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

  function act(action: "switch" | "edit" | "removeFavorite"): void {
    if (action === "switch") onSwitch(server);
    else if (action === "edit") onEdit(server);
    else onRemoveFavorite(server);
  }

  useEffect(() => {
    if (isMobileViewport) return;
    function onKeydown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [isMobileViewport, onClose]);

  if (isMobileViewport) {
    return createPortal(
      <>
        <div
          className="server-context-menu-backdrop"
          data-ws-part={`${part}-backdrop`}
          onClick={onClose}
          onContextMenu={(event) => { event.preventDefault(); onClose(); }}
        />
        <div className="server-context-menu ws-popup" data-ws-part={part} role="menu">
          <strong className="server-context-menu-title">{server.label}</strong>
          {inRoom && (
            <Button variant="ghost" role="menuitem" type="button" className="ws-menu-item" onClick={() => { act("switch"); onClose(); }}>
              <Icon name="volume" size={15} />
              <span>{t("switchToServer", { name: server.label })}</span>
            </Button>
          )}
          <Button variant="ghost" role="menuitem" type="button" className="ws-menu-item" onClick={() => { act("edit"); onClose(); }}>
            <Icon name="settings" size={15} />
            <span>{t("serverMenuEdit")}</span>
          </Button>
          <Button variant="ghost" role="menuitem" type="button" className="ws-menu-item danger" onClick={() => { act("removeFavorite"); onClose(); }}>
            <Icon name="star" size={15} />
            <span>{t("removeFavoriteNamed", { name: server.label })}</span>
          </Button>
        </div>
      </>,
      host ?? document.body,
    );
  }

  return (
    <DropdownMenu open onOpenChange={(next) => { if (!next) onClose(); }}>
      {/* 坐标锚：radix dropdown 命名空间无 Anchor 导出，以零尺寸固定元素当虚拟
          触发器提供几何。必须 portal 到 body：本组件渲染在 join 卡内，卡的
          backdrop-filter 会把 fixed 后代的包含块变成卡片（decisions 不变量的
          实案），坐标整体漂移；body 无缩放无包含块问题，client 坐标直用。 */}
      {createPortal(
        <DropdownMenuTrigger
          aria-hidden
          tabIndex={-1}
          style={{
            position: "fixed",
            left: position.x,
            top: position.y,
            width: 0,
            height: 0,
            pointerEvents: "none",
          }}
        />,
        document.body,
      )}
      <DropdownMenuContent
        data-ws-part={part}
        align="start"
        sideOffset={2}
        onPointerDownOutside={armClickGuard}
        className="min-w-56"
      >
        <DropdownMenuLabel className="truncate">{server.label}</DropdownMenuLabel>
        {inRoom && (
          <DropdownMenuItem onSelect={() => act("switch")}>
            <Icon name="volume" size={15} />
            <span className="truncate">{t("switchToServer", { name: server.label })}</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => act("edit")}>
          <Icon name="settings" size={15} />
          <span>{t("serverMenuEdit")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => act("removeFavorite")}>
          <Icon name="star" size={15} />
          <span className="truncate">{t("removeFavoriteNamed", { name: server.label })}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
