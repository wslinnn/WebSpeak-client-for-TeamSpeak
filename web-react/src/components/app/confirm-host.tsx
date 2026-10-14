import { useSyncExternalStore } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getConfirmRequest, settleConfirm, subscribeConfirm } from "@/lib/confirm";

// Promise 化确认弹窗的渲染端：挂在模板根部（App 层），与调用点解耦。
// AlertDialog 天然不响应 backdrop 点击，Esc/取消按钮 → settleConfirm(false)。
export function ConfirmDialogHost() {
  const request = useSyncExternalStore(subscribeConfirm, getConfirmRequest);
  return (
    <AlertDialog open={request !== null}>
      <AlertDialogContent>
        <AlertDialogTitle>{request?.title}</AlertDialogTitle>
        {request?.body ? <AlertDialogDescription>{request.body}</AlertDialogDescription> : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settleConfirm(false)}>
            {request?.cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={request?.danger ? "destructive" : "default"}
            onClick={() => settleConfirm(true)}
          >
            {request?.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
