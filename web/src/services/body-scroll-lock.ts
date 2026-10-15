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
 *  behind the modal backdrop does not. Callers acquire on dialog mount and
 *  release from their teardown effect (旧 useBodyScrollLock 平价：引用计数，
 *  叠放弹窗只恢复一次滚动）。 */
export function acquireBodyScrollLock(): void {
  acquire();
}
export function releaseBodyScrollLock(): void {
  release();
}
