import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type BrandMarkProps = ComponentProps<"svg">;

/**
 * 品牌 mark：圆角方块 + 五柱声波。方块 fill 走 currentColor（使用方以文字颜色类
 * 指定主题强调色），声波柱走 --wsd-accent-contrast（accent 填充上的字形惯例：
 * 夜间翻墨）——勿改回硬编码白：夜间方块浅色时白柱会泛白不可见。
 */
export function BrandMark({ className, ...rest }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="WebSpeak" className={cn("shrink-0", className)} {...rest}>
      <rect width="48" height="48" rx="12" fill="currentColor" />
      <g fill="var(--wsd-accent-contrast)">
        <rect x="4.5" y="17" width="5" height="14" rx="2.5" />
        <rect x="13" y="11" width="5" height="26" rx="2.5" />
        <rect x="21.5" y="7" width="5" height="34" rx="2.5" />
        <rect x="30" y="11" width="5" height="26" rx="2.5" />
        <rect x="38.5" y="17" width="5" height="14" rx="2.5" />
      </g>
    </svg>
  );
}
