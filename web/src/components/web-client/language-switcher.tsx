import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "./icon";
import { placeDropdownBesideTile, placeDropdownBelowFixed, placeDropdownClamped } from "@/services/dropdown-place";
import { LANGUAGE_OPTIONS } from "@/i18n/language-options";
import { cn } from "@/lib/utils";
import type { Language } from "@/i18n/web-client";

interface LanguageSwitcherProps {
  language: Language;
  onChange(language: Language): void;
  menuLabel: string;
  /** rail 上的 58px 方块变体。 */
  tile?: boolean;
  /** 移动面板等全宽触发器用：菜单 fixed 悬浮在触发器下方（不挤压面板）。 */
  fixedBelow?: boolean;
  className?: string;
}

/** 旧 LanguageSwitcher.vue 平价：自绘下拉（place 服务定位）、pointerdown 外点关闭、
 *  视口变化即关、pointer 选中武装一次性尾随 click 吞噬（选中会卸载菜单，尾随 click
 *  会落到底下元素——手机 more 面板里正下方是退出按钮）。键盘选中无尾随 click，不武装。 */
export function LanguageSwitcher({ language, onChange, menuLabel, tile, fixedBelow, className }: LanguageSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const clickGuardArmed = useRef(false);

  const current = LANGUAGE_OPTIONS.find((option) => option.value === language) ?? LANGUAGE_OPTIONS[0]!;

  const placeDropdown = useCallback(() => {
    const root = rootRef.current;
    const dropdown = dropdownRef.current;
    if (!root || !dropdown) return;
    if (tile) placeDropdownBesideTile(root, dropdown);
    else if (fixedBelow) placeDropdownBelowFixed(root, dropdown);
    else placeDropdownClamped(root, dropdown);
  }, [tile, fixedBelow]);

  const toggle = useCallback(() => {
    setOpen((wasOpen) => !wasOpen);
  }, []);

  // 提交后定位（SkinSwitcher 同款）：queueMicrotask 会抢在 React 提交前执行，
  // dropdownRef 还是 null 直接跳过——首次点开的下拉保持 CSS 默认 absolute 定位，
  // 在 rail 里被 overflow 裁剪、被工作区盖住，二次点击才恢复正常。
  useEffect(() => {
    if (open) placeDropdown();
  }, [open, placeDropdown]);

  function armClickGuard(): void {
    if (clickGuardArmed.current) return;
    clickGuardArmed.current = true;
    const swallow = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => {
      document.removeEventListener("click", swallow, { capture: true });
      clickGuardArmed.current = false;
    }, 400);
  }

  function select(value: Language, gesture?: React.PointerEvent): void {
    if (gesture) armClickGuard();
    onChange(value);
    setOpen(false);
  }

  useEffect(() => {
    function onDocumentPointerDown(event: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    // 视口变化使定位失效：直接关掉而不是漂移。
    function onViewportChange(): void {
      setOpen(false);
    }
    document.addEventListener("pointerdown", onDocumentPointerDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, []);

  return (
    <div ref={rootRef} className={cn("language-switcher", { open, tile }, className)} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <button
        type="button"
        className="language-trigger"
        data-ws-part="language.trigger"
        aria-label={menuLabel}
        title={tile ? menuLabel : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-ws-state={open ? "open" : "closed"}
        aria-controls="language-menu"
        onClick={(event) => { event.stopPropagation(); toggle(); }}
      >
        <span className="language-current-flag" aria-hidden="true">{current.flag}</span>
        {!tile && <span className="language-current-code">{current.code}</span>}
        {!tile && <Icon name="chevron-down" size={13} />}
      </button>

      {open && (
        <div ref={dropdownRef} id="language-menu" className="language-dropdown ws-popup" data-ws-part="language.menu" role="listbox" aria-label={menuLabel} onClick={(event) => event.stopPropagation()}>
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === language ? "language-option selected" : "language-option"}
              data-ws-part="language.option"
              data-ws-language={option.value}
              role="option"
              aria-selected={option.value === language}
              onPointerDown={(event) => { event.stopPropagation(); event.preventDefault(); select(option.value, event); }}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); select(option.value); }
                if (event.key === " ") { event.preventDefault(); select(option.value); }
              }}
            >
              <span className="language-option-flag" aria-hidden="true">{option.flag}</span>
              <span className="language-option-copy">
                <strong>{option.label}</strong>
                <small>{option.code}</small>
              </span>
              {option.value === language && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
