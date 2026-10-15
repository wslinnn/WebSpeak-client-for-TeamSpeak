import { Icon } from "./icon";
import { useDialogFocus } from "@/web-client/use-dialog-focus";

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
 *  home-connection）；错误文案经 voiceStore.errorCode 订阅回到弹窗。 */
export function ChannelPasswordDialog(props: ChannelPasswordDialogProps) {
  const { password, busy, error } = props;
  const { dialogRef, onDialogKeydown } = useDialogFocus<HTMLElement>({ close: props.onClose });
  return (
    <div className="modal-backdrop channel-password-backdrop">
      <section
        ref={dialogRef}
        className="channel-password-modal"
        tabIndex={-1}
        onKeyDown={onDialogKeydown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-password-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="dialog-close" aria-label={props.closeLabel} title={props.closeLabel} onClick={props.onClose}>
          <Icon name="close" size={19} />
        </button>
        <h2 id="channel-password-title">{props.title}</h2>
        <p>{props.lead}</p>
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
      </section>
    </div>
  );
}
