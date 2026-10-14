import { CheckIcon, ChevronDownIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/hooks/use-i18n";
import type { Language } from "@/i18n/web-client";

const OPTIONS: Array<{ value: Language; code: string; label: string; flag: string }> = [
  { value: "zh", code: "ZH", label: "中文", flag: "🇨🇳" },
  { value: "en", code: "EN", label: "English", flag: "🇬🇧" },
  { value: "de", code: "DE", label: "Deutsch", flag: "🇩🇪" },
  { value: "ru", code: "RU", label: "Русский", flag: "🇷🇺" },
  { value: "ja", code: "JA", label: "日本語", flag: "🇯🇵" },
];

// 五语言切换器（非 tile 变体；rail tile 变体随 Phase 4-3 首页 rail 落地）。
// 基于 Radix DropdownMenu：选择发生在 click（菜单尚未卸载），旧版自绘菜单
// pointerdown 选中所需的尾随 click 守卫在此不再需要。
export function LanguageSwitcher({ menuLabel }: { menuLabel: string }) {
  const { language, setLanguage } = useI18n();
  const current = OPTIONS.find((option) => option.value === language) ?? OPTIONS[0]!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-ws-part="language.trigger"
        aria-label={menuLabel}
        className="inline-flex min-h-8 min-w-[70px] items-center gap-1.5 rounded-lg border border-border bg-secondary px-2.5 text-sm font-bold text-foreground hover:bg-accent data-[state=open]:bg-accent"
      >
        <span aria-hidden="true" className="text-lg leading-none">{current.flag}</span>
        <span className="tracking-wide">{current.code}</span>
        <ChevronDownIcon className="ml-auto transition-transform" size={13} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-ws-part="language.menu"
        align="end"
        className="grid w-auto min-w-44 grid-cols-1 gap-0.5 sm:grid-cols-2"
      >
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            data-ws-part="language.option"
            data-ws-language={option.value}
            aria-selected={option.value === language}
            onSelect={() => setLanguage(option.value)}
            className="gap-2"
          >
            <span aria-hidden="true" className="text-lg leading-none">{option.flag}</span>
            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
              <strong className="text-md font-semibold">{option.label}</strong>
              <small className="text-xs font-bold text-muted-foreground">{option.code}</small>
            </span>
            {option.value === language && <CheckIcon size={14} aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
