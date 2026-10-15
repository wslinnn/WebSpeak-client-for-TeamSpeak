import { useEffect, useRef } from "react";

import { acquireBodyScrollLock, releaseBodyScrollLock } from "@/services/body-scroll-lock";

interface DialogFocusOptions {
  /** 关闭回调（Esc 触发；keydown 闭包每次渲染重建，读到的是当次 options）。 */
  close(): void;
  /** 卸载时 previousFocus 已断连（如路由已换）的回落焦点（旧 useDialogFocus 平价）。
   *  调用方传稳定闭包（内部查 live DOM），挂载 effect 只取首渲染份。 */
  fallbackFocus?(): HTMLElement | null;
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], audio[controls], [tabindex="0"]';

/** 旧 useDialogFocus + useBodyScrollLock 的合并平价：挂载即锁滚动、记住先前焦点、
 *  聚焦 [autofocus] 或弹窗本身；Esc 关闭；Tab 在弹窗内循环；卸载恢复焦点。
 *  返回挂在弹窗 section 上的 onKeyDown 与 ref。 */
export function useDialogFocus<T extends HTMLElement>(options: DialogFocusOptions) {
  const dialogRef = useRef<T | null>(null);

  useEffect(() => {
    acquireBodyScrollLock();
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const autofocus = dialog?.querySelector<HTMLElement>("[autofocus]:not(:disabled)");
    (autofocus ?? dialog)?.focus();
    const fallback = options.fallbackFocus;
    return () => {
      releaseBodyScrollLock();
      const target = previousFocus?.isConnected && previousFocus !== document.body ? previousFocus : fallback?.();
      target?.focus();
    };
    // 仅挂载语义：滚动锁与焦点恢复都只在弹窗生命周期边界发生一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onDialogKeydown(event: React.KeyboardEvent<T>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      options.close();
      return;
    }
    const dialog = dialogRef.current;
    if (event.key === "Tab" && dialog) {
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden",
      );
      const current = controls.indexOf(document.activeElement as HTMLElement);
      if (!controls.length || current < 0 || (event.shiftKey ? current === 0 : current === controls.length - 1)) {
        event.preventDefault();
        (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
      }
    }
  }

  return { dialogRef, onDialogKeydown };
}
