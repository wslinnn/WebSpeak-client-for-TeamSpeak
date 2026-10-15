import { useCallback, useEffect, useRef, useState } from "react";

import { Icon, type IconName } from "./icon";
import { placeDropdownBesideTile, placeDropdownClamped } from "@/services/dropdown-place";
import { cn } from "@/lib/utils";

export interface SkinOption {
  value: string;
  label: string;
  icon?: IconName;
}

/** 视图间穿线的切换器状态束（web-client 根装配，rail/more/join header 消费）。 */
export interface SkinSwitcherState {
  value: string;
  options: SkinOption[];
  menuLabel: string;
  onChange(value: string): void;
}

interface SkinSwitcherProps {
  value: string;
  options: SkinOption[];
  menuLabel: string;
  tile?: boolean;
  className?: string;
  onChange(value: string): void;
}

/** 皮肤切换器（旧 SkinSwitcher.vue 平价）：tile 模式进服务器 rail（溢出裁剪，
 *  菜单 fixed 贴牌展开），inline 模式（首页头/移动面板）视口内 clamp。 */
export function SkinSwitcher({ value, options, menuLabel, tile, className, onChange }: SkinSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [menuId] = useState(() => `skin-menu-${Math.random().toString(36).slice(2, 9)}`);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) ?? options[0] ?? { value, label: menuLabel, icon: "compass" as IconName };

  const place = useCallback(() => {
    const rootEl = rootRef.current;
    const dropdownEl = dropdownRef.current;
    if (!rootEl || !dropdownEl) return;
    if (tile) placeDropdownBesideTile(rootEl, dropdownEl);
    else placeDropdownClamped(rootEl, dropdownEl);
  }, [tile]);

  useEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onResize = () => {
      if (open) place();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
    };
  }, [place, open]);

  return (
    <div
      ref={rootRef}
      className={cn("skin-switcher", { open, tile }, className)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        className="skin-trigger"
        data-ws-part="skin.trigger"
        disabled={options.length === 0}
        aria-label={menuLabel}
        title={`${menuLabel}: ${selected.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-ws-state={open ? "open" : "closed"}
        aria-controls={menuId}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        <Icon name={selected.icon ?? "compass"} size={tile ? 22 : 15} />
        {!tile && <span>{menuLabel}</span>}
        {!tile && <Icon name="chevron-down" size={12} />}
      </button>

      {open && (
        <div
          ref={dropdownRef}
          id={menuId}
          className="skin-dropdown"
          data-ws-part="skin.menu"
          role="listbox"
          aria-label={menuLabel}
          onClick={(event) => event.stopPropagation()}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === value ? "skin-option selected" : "skin-option"}
              data-ws-part="skin.option"
              data-ws-skin-id={option.value}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <Icon name={option.icon ?? "compass"} size={16} />
              <span>{option.label}</span>
              {option.value === value && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
