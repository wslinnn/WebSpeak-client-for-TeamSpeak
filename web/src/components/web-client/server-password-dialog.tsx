import { Icon } from "./icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface ServerPasswordDialogProps {
  password: string;
  onPasswordChange(password: string): void;
  errorCode: string;
  onClose(): void;
  onSubmit(): void;
  title: string;
  invalidLead: string;
  requiredLead: string;
  promptLabel: string;
  placeholder: string;
  cancelLabel: string;
  retryLabel: string;
  closeLabel: string;
}

/** 服务器密码重试弹窗（旧 ServerPasswordDialog.vue 平价）：INVALID_SERVER_PASSWORD
 *  与 SERVER_PASSWORD_REQUIRED 两种引导语。父级按 open 条件挂载；backdrop 点击
 *  不关闭（决策不变量）。 */
export function ServerPasswordDialog(props: ServerPasswordDialogProps) {
  const invalid = props.errorCode === "INVALID_SERVER_PASSWORD";
  return (
    <Dialog open onOpenChange={(next) => { if (!next) props.onClose(); }}>
      <DialogContent
        className="channel-password-modal server-password-modal"
        aria-labelledby="server-password-title"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogClose asChild>
          <Button type="button" variant="ghost" size="icon-sm" className="absolute top-[13px] right-[13px]" aria-label={props.closeLabel} title={props.closeLabel}>
            <Icon name="close" size={19} />
          </Button>
        </DialogClose>
        <DialogTitle id="server-password-title">{props.title}</DialogTitle>
        <DialogDescription>{invalid ? props.invalidLead : props.requiredLead}</DialogDescription>
        <form className="channel-password-form" onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
          <label className="field-label" htmlFor="retry-server-password-input">{props.promptLabel}</label>
          <div className="field-wrap">
            <Icon name="lock" size={17} />
            <input
              id="retry-server-password-input"
              value={props.password}
              onChange={(event) => props.onPasswordChange(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder={props.placeholder}
              autoFocus
            />
          </div>
          <div className="channel-password-actions">
            <Button type="button" variant="ghost" onClick={props.onClose}>{props.cancelLabel}</Button>
            <Button type="submit" disabled={!props.password}>
              <span>{props.retryLabel}</span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
