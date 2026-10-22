import { Icon } from "./icon";
import { Button } from "@/components/ui/button";

interface ThemeToggleProps {
  dark: boolean;
  onToggle(): void;
  /** 当前态下按钮的可达名（点按后将切换到另一态）。 */
  label: string;
  className?: string;
}

/** 日/夜切换钮（皮肤切换器下架后的唯一外观开关）。 */
export function ThemeToggle({ dark, onToggle, label, className }: ThemeToggleProps) {
  return (
    <Button variant="ghost"
      type="button"
      className={className ? `theme-toggle ${className}` : "theme-toggle"}
      data-ws-part="theme.toggle"
      data-ws-state={dark ? "dark" : "light"}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <Icon name={dark ? "sun" : "moon"} size={15} />
    </Button>
  );
}
