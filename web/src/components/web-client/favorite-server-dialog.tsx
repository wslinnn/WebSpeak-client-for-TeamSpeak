import { useState } from "react";

import { Icon } from "./icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "@/services/teamspeak-target";

export interface FavoriteServerDraft {
  label: string;
  address: string;
  port: string;
  nickname: string;
  channel: string;
  password: string;
}

interface FavoriteServerDialogProps {
  /** 打开时注入一次的草稿（父组件随开随挂）。 */
  initial: Partial<FavoriteServerDraft>;
  /** 已存收藏地址；规范化命中意味着保存会更新而非新建。 */
  knownFavoriteAddresses: readonly string[];
  onClose(): void;
  onSave(draft: FavoriteServerDraft): void;
  t(key: string, variables?: Record<string, string | number>): string;
}

/** 收藏编辑弹窗（旧 FavoriteServerDialog.vue 平价）：标签/地址/端口/昵称/频道/密码，
 *  必填地址+端口+昵称；地址规范化命中已存收藏时提示「将更新」。保存的权威在
 *  home-favorites.upsertFavoriteServer；本组件只收集草稿。 */
export function FavoriteServerDialog({ initial, knownFavoriteAddresses, onClose, onSave, t }: FavoriteServerDialogProps) {
  const [label, setLabel] = useState(initial.label ?? "");
  const [address, setAddress] = useState(initial.address ?? "");
  const [port, setPort] = useState(initial.port ?? "9987");
  const [nickname, setNickname] = useState(initial.nickname ?? "");
  const [channel, setChannel] = useState(initial.channel ?? "");
  const [password, setPassword] = useState(initial.password ?? "");

  // 镜像 upsertFavoriteServer 的规范化：提示保存将更新而不是新建。
  const duplicateFavorite = (() => {
    if (!address.trim() || !port.trim()) return false;
    const target = splitTeamSpeakTarget(`${address.trim()}:${port.trim()}`);
    const key = combineTeamSpeakTarget(target.address, target.port).trim().toLocaleLowerCase();
    return knownFavoriteAddresses.some((item) => item.trim().toLocaleLowerCase() === key);
  })();

  function submit(): void {
    if (!address.trim() || !port.trim() || !nickname.trim()) return;
    onSave({
      label: label.trim(),
      address: address.trim(),
      port: port.trim(),
      nickname: nickname.trim(),
      channel: channel.trim(),
      password,
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className="favorite-server-dialog"
        data-ws-part="favorite-server.dialog"
        aria-labelledby="favorite-server-title"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <header className="favorite-server-header" data-ws-part="favorite-server.header">
          <DialogTitle id="favorite-server-title">{t("addFavoriteServer")}</DialogTitle>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon-sm" className="dialog-close" data-ws-part="favorite-server.close" aria-label={t("close")}>
              <Icon name="close" size={18} />
            </Button>
          </DialogClose>
        </header>
        <form className="favorite-server-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <label className="field-label" data-ws-part="favorite-server.field-label" htmlFor="favorite-label">
            <span>{t("favoriteDisplayName")}</span>
            <div className="field-wrap" data-ws-part="favorite-server.field">
              <input id="favorite-label" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={60} placeholder={t("favoriteDisplayNamePlaceholder")}
              />
            </div>
          </label>
          <div className="favorite-server-columns">
            <label className="field-label" data-ws-part="favorite-server.field-label" htmlFor="favorite-address">
              <span>{t("serverAddress")}</span>
              <div className="field-wrap" data-ws-part="favorite-server.field">
                <Icon name="server" size={16} />
                <input id="favorite-address" value={address} onChange={(event) => setAddress(event.target.value)} autoComplete="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
              </div>
            </label>
            <label className="field-label" data-ws-part="favorite-server.field-label" htmlFor="favorite-port">
              <span>{t("serverPort")}</span>
              <div className="field-wrap" data-ws-part="favorite-server.field">
                <Icon name="hash" size={16} />
                <input id="favorite-port" value={port} onChange={(event) => setPort(event.target.value)} inputMode="numeric" type="text" maxLength={5} required />
              </div>
            </label>
          </div>
          <label className="field-label" data-ws-part="favorite-server.field-label" htmlFor="favorite-password">
            <span>{t("serverPassword")} <span>{t("optional")}</span></span>
            <div className="field-wrap" data-ws-part="favorite-server.field">
              <Icon name="lock" size={16} />
              <input id="favorite-password" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" placeholder={t("optionalPassword")} />
            </div>
          </label>
          <label className="field-label" data-ws-part="favorite-server.field-label" htmlFor="favorite-nickname">
            <span>{t("nickname")}</span>
            <div className="field-wrap" data-ws-part="favorite-server.field">
              <Icon name="users" size={16} />
              <input id="favorite-nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={30} autoComplete="nickname" required />
            </div>
          </label>
          <label className="field-label" data-ws-part="favorite-server.field-label" htmlFor="favorite-channel">
            <span>{t("targetChannel")} <span>{t("optional")}</span></span>
            <div className="field-wrap" data-ws-part="favorite-server.field">
              <Icon name="hash" size={16} />
              <input id="favorite-channel" value={channel} onChange={(event) => setChannel(event.target.value)} placeholder={t("emptyDefault")} />
            </div>
          </label>
          <p className="favorite-server-hint">{t("favoritePasswordHint")}</p>
          {duplicateFavorite && <p className="favorite-server-hint warning" role="status">{t("favoriteUpdateExisting")}</p>}
          <footer className="favorite-server-actions" data-ws-part="favorite-server.actions">
            <Button type="button" variant="outline" data-ws-part="favorite-server.cancel" onClick={onClose}>{t("cancel")}</Button>
            <Button type="submit" data-ws-part="favorite-server.submit" disabled={!address.trim() || !port.trim() || !nickname.trim()}>
              {t("saveFavorite")}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
