import { useRef, useState } from "react";

import { Icon } from "./icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGUAGE_OPTIONS } from "@/i18n/language-options";
import { cn } from "@/lib/utils";
import type { Language } from "@/i18n/web-client";
import { Button } from "@/components/ui/button";

interface LanguageSwitcherProps {
  language: Language;
  onChange(language: Language): void;
  menuLabel: string;
  /** rail 上的 58px 方块变体。 */
  tile?: boolean;
  /** 移动面板等全宽触发器用：菜单悬浮在触发器正下方并同宽。 */
  fixedBelow?: boolean;
  className?: string;
}

/** 自绘下拉迁 Radix DropdownMenu（UI 迁移批 1）：定位/碰撞/裁剪祖先规避、外点
 *  关闭、Esc+焦点归还全归原语，dropdown-place 三种手摆定位随之退役。保留的
 *  交互契约：pointer 选中会卸载菜单，尾随 click 会落在新暴露的元素上（手机
 *  more 面板里正下方是退出按钮）——仍武装一次性捕获吞噬，键盘选中不武装。
 *  Portal 落 body（radix 默认）：#root 有 zoom: var(--ui-scale)，portal 回缩放
 *  子树会让 popper 的视觉坐标再乘缩放（旧手摆代码除 scale 的同因），body 层
 *  坐标 1:1 正确；--ui-scale>1 时菜单尺寸偏小，随 zoom 体系重审一并处理。 */
export function LanguageSwitcher({ language, onChange, menuLabel, tile, fixedBelow, className }: LanguageSwitcherProps) {
  const [open, setOpen] = useState(false);
  const guardArmed = useRef(false);

  const current = LANGUAGE_OPTIONS.find((option) => option.value === language) ?? LANGUAGE_OPTIONS[0]!;

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

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <div className={cn("language-switcher", { open, tile }, className)}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost"
            type="button"
            className="language-trigger"
            data-ws-part="language.trigger"
            aria-label={menuLabel}
            title={tile ? menuLabel : undefined}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="language-current-flag" aria-hidden="true">{current.flag}</span>
            {!tile && <span className="language-current-code">{current.code}</span>}
            {!tile && <Icon name="chevron-down" size={13} />}
          </Button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent
        data-ws-part="language.menu"
        aria-label={menuLabel}
        side={tile ? "right" : "bottom"}
        align={tile || fixedBelow ? "start" : "end"}
        sideOffset={8}
        className={cn(fixedBelow && "w-(--radix-dropdown-menu-trigger-width)")}
      >
        <DropdownMenuRadioGroup value={language} onValueChange={(value) => onChange(value as Language)}>
          {LANGUAGE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              data-ws-part="language.option"
              data-ws-language={option.value}
              // 守卫必须挂在 onSelect：radix 菜单项选中由 click 触发，在
              // pointerup 武装会把选中用的这次 click 吞掉（真浏览器探针实锤）。
              onSelect={armClickGuard}
            >
              <span className="language-option-flag" aria-hidden="true">{option.flag}</span>
              <span className="language-option-copy">
                <strong>{option.label}</strong>
                <small>{option.code}</small>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
