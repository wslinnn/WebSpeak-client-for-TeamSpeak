import * as React from "react";
import { Check, Minus } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { cn } from "cn";

/* 照搬 ZCode radix-mira 源；ZCode 专属令牌换本仓对位：input-border→input、
 * bg-input→bg-input/20（对齐 InputGroup 输入面）、input-border-focused→ring。 */

type CheckboxProps = React.ComponentProps<typeof CheckboxPrimitive.Root> & {
  checkIconStrokeWidth?: number;
};

function Checkbox({ className, checkIconStrokeWidth, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // after 伪元素扩触控热区（±10px，同 Switch 手法）：16px 点选面太小，
        // 且部分消费点（管理台设置行）没有可代替点击的包裹 label。
        "peer relative size-4 shrink-0 rounded-sm border border-input bg-input/20 text-primary-foreground outline-none transition-colors after:absolute after:-inset-2.5 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary dark:bg-input/30",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-current [&[data-state=indeterminate]_[data-slot=checkbox-checked-icon]]:hidden [&[data-state=indeterminate]_[data-slot=checkbox-indeterminate-icon]]:block"
      >
        <Check
          data-slot="checkbox-checked-icon"
          className={cn(
            "size-3",
            checkIconStrokeWidth !== undefined && "[&_path]:[vector-effect:non-scaling-stroke]",
          )}
          strokeWidth={checkIconStrokeWidth}
        />
        <Minus
          data-slot="checkbox-indeterminate-icon"
          className={cn(
            "hidden size-3",
            checkIconStrokeWidth !== undefined && "[&_path]:[vector-effect:non-scaling-stroke]",
          )}
          strokeWidth={checkIconStrokeWidth}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
