import { onScopeDispose, watch, type Ref } from "vue";

// Reference-counted so stacked dialogs restore scroll exactly once.
let lockCount = 0;
let previousOverflow = "";

function acquire(): void {
  if (lockCount === 0) previousOverflow = document.body.style.overflow;
  lockCount += 1;
  document.body.style.overflow = "hidden";
}
function release(): void {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) document.body.style.overflow = previousOverflow;
}

/** Freezes body scroll while `locked` is true: the sheet scrolls, the page
 *  behind the modal backdrop does not. Dialogs mount per open (parent v-if),
 *  so the immediate watch acquires on mount and scope disposal releases. */
export function useBodyScrollLock(locked: Ref<boolean>): void {
  watch(locked, (active) => {
    if (active) acquire();
    else release();
  }, { immediate: true });
  onScopeDispose(release);
}
