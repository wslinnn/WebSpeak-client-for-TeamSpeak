// Promise 化确认弹窗（计划 Phase 3）：调用方 await confirmDialog(...)，host 渲染在模板根部
// （进房态/首页态都可达的全局层）。模态行为遵循产品红线：只经按钮/Esc 关闭（AlertDialog 语义）。
export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

let current: ConfirmRequest | null = null;
const listeners = new Set<(request: ConfirmRequest | null) => void>();

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  // 单弹窗 host：新请求顶替挂起请求 = 旧请求按取消结算。
  current?.resolve(false);
  return new Promise((resolve) => {
    current = { ...options, resolve };
    for (const listener of listeners) listener(current);
  });
}

export function subscribeConfirm(listener: (request: ConfirmRequest | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getConfirmRequest(): ConfirmRequest | null {
  return current;
}

export function settleConfirm(confirmed: boolean): void {
  const request = current;
  current = null;
  for (const listener of listeners) listener(null);
  // 确认按钮先结算 true、随后的 onOpenChange(false)（radix 关闭流程）到这里落空——幂等是必须的。
  request?.resolve(confirmed);
}
