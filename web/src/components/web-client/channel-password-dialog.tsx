import { Icon } from "./icon";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface ChannelPasswordDialogProps {
  password: string;
  onPasswordChange(password: string): void;
  busy: boolean;
  error: string;
  onClose(): void;
  onSubmit(): void;
  title: string;
  lead: string;
  promptLabel: string;
  placeholder: string;
  cancelLabel: string;
  submitLabel: string;
  closeLabel: string;
}

/** 频道密码弹窗（旧 ChannelPasswordDialog.vue 平价）：进房壳与首页共用（控制器在
 *  home-connection）；错误文案经 voiceStore.errorCode 订阅回到弹窗。父级按 open
 *  条件挂载，这里恒 open、onOpenChange(false) 即请求关闭。决策不变量：模态框
 *  只经按钮/Esc 关闭，不响应 backdrop 点击（onInteractOutside 阻断）。 */
export function ChannelPasswordDialog(props: ChannelPasswordDialogProps) {
  const { password, busy, error } = props;
  return (
    <Dialog open onOpenChange={(next) => { if (!next) props.onClose(); }}>
      <DialogContent
        className="channel-password-modal"
        aria-labelledby="channel-password-title"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogClose asChild>
          <button type="button" className="dialog-close" aria-label={props.closeLabel} title={props.closeLabel}>
            <Icon name="close" size={19} />
          </button>
        </DialogClose>
        <DialogTitle id="channel-password-title">{props.title}</DialogTitle>
        <DialogDescription>{props.lead}</DialogDescription>
        <form className="channel-password-form" onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
          <label className="field-label" htmlFor="channel-password-input">{props.promptLabel}</label>
          <div className="field-wrap">
            <Icon name="lock" size={17} />
            <input
              id="channel-password-input"
              value={password}
              onChange={(event) => props.onPasswordChange(event.target.value)}
              type="password"
              autoComplete="current-password"
              placeholder={props.placeholder}
              disabled={busy}
              autoFocus
            />
          </div>
          {error && (
            <div className="notice error-notice channel-password-error">
              <span className="notice-symbol">!</span>
              <span>{error}</span>
            </div>
          )}
          <div className="channel-password-actions">
            <button type="button" className="text-button" disabled={busy} onClick={props.onClose}>{props.cancelLabel}</button>
            <button type="submit" className="primary-button channel-password-submit" disabled={busy || !password}>
              {busy && <span className="button-spinner" />}
              <span>{props.submitLabel}</span>
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
