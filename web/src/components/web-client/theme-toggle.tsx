import type { ReactNode } from "react";
import { Icon } from "./icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ThemeToggleProps {
  dark: boolean;
  onToggle(): void;
  /** 当前态下按钮的可达名（点按后将切换到另一态）。 */
  label: string;
  className?: string;
  /** 通栏面板场景的可见文字（移动端「更多」面板）；桌面顶栏保持纯图标。 */
  children?: ReactNode;
}

/** 日/夜切换钮（皮肤切换器下架后的唯一外观开关）。 */
export function ThemeToggle({ dark, onToggle, label, className, children }: ThemeToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost"
          type="button"
          className={className ? `theme-toggle ${className}` : "theme-toggle"}
          data-ws-part="theme.toggle"
          data-ws-state={dark ? "dark" : "light"}
          aria-label={label}
          onClick={onToggle}
        >
          <Icon name={dark ? "sun" : "moon"} size={15} />
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
