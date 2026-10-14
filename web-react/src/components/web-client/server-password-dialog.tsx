import { Icon } from "./icon";
import { useDialogFocus } from "@/web-client/use-dialog-focus";

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
 *  与 SERVER_PASSWORD_REQUIRED 两种引导语。关闭回落焦点 = join 提交按钮。 */
export function ServerPasswordDialog(props: ServerPasswordDialogProps) {
  const { dialogRef, onDialogKeydown } = useDialogFocus<HTMLElement>({
    close: props.onClose,
    fallbackFocus: () => document.querySelector<HTMLElement>('[data-ws-part="home.connect"]'),
  });
  const invalid = props.errorCode === "INVALID_SERVER_PASSWORD";
  return (
    <div className="modal-backdrop channel-password-backdrop">
      <section
        ref={dialogRef}
        className="channel-password-modal server-password-modal"
        tabIndex={-1}
        onKeyDown={onDialogKeydown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="server-password-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="dialog-close" aria-label={props.closeLabel} title={props.closeLabel} onClick={props.onClose}>
          <Icon name="close" size={19} />
        </button>
        <h2 id="server-password-title">{props.title}</h2>
        <p>{invalid ? props.invalidLead : props.requiredLead}</p>
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
            <button type="button" className="text-button" onClick={props.onClose}>{props.cancelLabel}</button>
            <button type="submit" className="primary-button channel-password-submit" disabled={!props.password}>
              <span>{props.retryLabel}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
