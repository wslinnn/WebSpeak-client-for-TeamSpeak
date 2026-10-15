import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type BrandMarkProps = ComponentProps<"svg">;

/**
 * 品牌 mark：圆角方块 + 五柱声波。fill 全部走 currentColor，
 * 由使用方通过文字颜色类指定主题强调色（公开页 --wsd-accent、管理台 --admin-accent）。
 */
export function BrandMark({ className, ...rest }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="WebSpeak" className={cn("shrink-0", className)} {...rest}>
      <rect width="48" height="48" rx="12" fill="currentColor" />
      <g fill="#fff">
        <rect x="4.5" y="17" width="5" height="14" rx="2.5" />
        <rect x="13" y="11" width="5" height="26" rx="2.5" />
        <rect x="21.5" y="7" width="5" height="34" rx="2.5" />
        <rect x="30" y="11" width="5" height="26" rx="2.5" />
        <rect x="38.5" y="17" width="5" height="14" rx="2.5" />
      </g>
    </svg>
  );
}
