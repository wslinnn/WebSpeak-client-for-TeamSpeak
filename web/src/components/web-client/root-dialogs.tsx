import { ChannelPasswordDialog } from "./channel-password-dialog";
import { FavoriteServerDialog, type FavoriteServerDraft } from "./favorite-server-dialog";
import { ServerPasswordDialog } from "./server-password-dialog";
import type { ChannelPasswordDialogState, ServerPasswordDialogState } from "@/web-client/home-store";

interface RootDialogsProps {
  channelDialog: ChannelPasswordDialogState;
  serverDialog: ServerPasswordDialogState;
  favoriteInitial: Partial<FavoriteServerDraft> | null;
  favoriteKnownAddresses: readonly string[];
  onChannelPasswordChange(password: string): void;
  onChannelClose(): void;
  onChannelSubmit(): void;
  onServerPasswordChange(password: string): void;
  onServerClose(): void;
  onServerSubmit(): void;
  onFavoriteClose(): void;
  onFavoriteSave(draft: FavoriteServerDraft): void;
  t(key: string, variables?: Record<string, string | number>): string;
}

/** 根部级弹窗（旧 WebClient.vue 模板根部三弹窗平价）：必须放两态分支之外，
 *  进房态与首页态都要可达（频道/服务器密码在切服与换频道路径上弹出）。 */
export function RootDialogs(props: RootDialogsProps) {
  const { channelDialog, serverDialog, t } = props;
  return (
    <>
      {channelDialog.open && (
        <ChannelPasswordDialog
          password={channelDialog.password}
          onPasswordChange={props.onChannelPasswordChange}
          busy={channelDialog.submitting}
          error={channelDialog.error}
          onClose={props.onChannelClose}
          onSubmit={props.onChannelSubmit}
          title={t("channelPasswordTitle")}
          lead={t("channelPasswordLead")}
          promptLabel={t("channelPasswordPrompt")}
          placeholder={t("channelPasswordPlaceholder")}
          cancelLabel={t("channelPasswordCancel")}
          submitLabel={t("channelPasswordSubmit")}
          closeLabel={t("close")}
        />
      )}
      {serverDialog.open && (
        <ServerPasswordDialog
          password={serverDialog.password}
          onPasswordChange={props.onServerPasswordChange}
          errorCode={serverDialog.errorCode}
          onClose={props.onServerClose}
          onSubmit={props.onServerSubmit}
          title={t("serverPasswordTitle")}
          invalidLead={t("serverPasswordInvalidLead")}
          requiredLead={t("serverPasswordRequiredLead")}
          promptLabel={t("serverPasswordPrompt")}
          placeholder={t("serverPasswordRetryPlaceholder")}
          cancelLabel={t("channelPasswordCancel")}
          retryLabel={t("serverPasswordRetry")}
          closeLabel={t("close")}
        />
      )}
      {props.favoriteInitial !== null && (
        <FavoriteServerDialog
          initial={props.favoriteInitial}
          knownFavoriteAddresses={props.favoriteKnownAddresses}
          onClose={props.onFavoriteClose}
          onSave={props.onFavoriteSave}
          t={t}
        />
      )}
    </>
  );
}
