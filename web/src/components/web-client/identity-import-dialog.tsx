import { useRef, useState } from "react";

import { Icon } from "./icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface IdentityImportDialogProps {
  text: string;
  onTextChange(text: string): void;
  busy: boolean;
  reading: boolean;
  error: string;
  closeLabel: string;
  title: string;
  description: string;
  placeholder: string;
  dropZoneLabel: string;
  chooseFileLabel: string;
  securityNote: string;
  cancelLabel: string;
  connectingLabel: string;
  submitLabel: string;
  onClose(): void;
  onSubmit(): void;
  onFile(file: File): void;
}

const IDENTITY_ACCEPT = ".ini,.txt,.identity,.wsi,text/plain";
const IDENTITY_MAX_LENGTH = 131072;

/** 身份导入弹窗（旧 IdentityImportDialog.vue 平价）：textarea + 拖放/点选文件 +
 *  忙碌时整体禁用。文本/读取/提交的代际纪律在 home-identity 控制器。 */
export function IdentityImportDialog(props: IdentityImportDialogProps) {
  const { text, onTextChange, busy, reading, error } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dropActive, setDropActive] = useState(false);

  function chooseFile(): void {
    if (!busy) fileInputRef.current?.click();
  }
  function onFileChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (file && !busy) props.onFile(file);
  }
  function onDrop(event: React.DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    const file = event.dataTransfer?.files[0];
    if (file && !busy) props.onFile(file);
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) props.onClose(); }}>
      <DialogContent
        className="identity-import-modal"
        data-ws-part="home.identity-import-dialog"
        aria-labelledby="identity-import-title"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <header className="identity-import-header" data-ws-part="home.identity-import.header">
          <div>
            <DialogTitle id="identity-import-title">{props.title}</DialogTitle>
            <p>{props.description}</p>
          </div>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="dialog-close identity-import-close"
              data-ws-part="home.identity-import.close"
              aria-label={props.closeLabel}
              disabled={busy}
            >
              <Icon name="close" size={18} />
            </Button>
          </DialogClose>
        </header>
        <textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          className="identity-import-textarea"
          data-ws-part="home.identity-import.textarea"
          aria-label={props.title}
          placeholder={props.placeholder}
          disabled={busy}
          maxLength={IDENTITY_MAX_LENGTH}
          spellCheck={false}
        />
        <div
          className={cn("identity-drop-zone", { active: dropActive })}
          data-ws-part="home.identity-import.drop-zone"
          role="group"
          aria-disabled={busy}
          tabIndex={busy ? -1 : 0}
          onClick={chooseFile}
          onKeyDown={(event) => {
            if (event.key === "Enter") { event.preventDefault(); chooseFile(); }
            if (event.key === " ") { event.preventDefault(); chooseFile(); }
          }}
          onDragOver={(event) => { event.preventDefault(); setDropActive(!busy); }}
          onDragLeave={(event) => { event.preventDefault(); setDropActive(false); }}
          onDrop={onDrop}
        >
          <Icon name="paperclip" size={18} />
          <span>{props.dropZoneLabel}</span>
          <Button type="button" variant="outline" size="sm" className="identity-file-button" data-ws-part="home.identity-import.file-button" disabled={busy} onClick={(event) => { event.stopPropagation(); chooseFile(); }}>
            {props.chooseFileLabel}
          </Button>
        </div>
        <input ref={fileInputRef} className="identity-file-input" type="file" accept={IDENTITY_ACCEPT} disabled={busy} onChange={onFileChange} />
        {error && <p className="identity-import-error" data-ws-part="home.identity-import.error" role="alert">{error}</p>}
        <p className="identity-import-security" data-ws-part="home.identity-import.security">
          <Icon name="lock" size={14} />
          {" "}
          {props.securityNote}
        </p>
        <footer className="identity-import-footer" data-ws-part="home.identity-import.footer">
          <Button type="button" variant="ghost" className="identity-import-cancel" data-ws-part="home.identity-import.cancel" disabled={busy} onClick={props.onClose}>
            {props.cancelLabel}
          </Button>
          <Button
            type="button"
            className="identity-import-submit"
            data-ws-part="home.identity-import.submit"
            disabled={busy || reading || !text.trim()}
            onClick={props.onSubmit}
          >
            {busy ? props.connectingLabel : props.submitLabel}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
