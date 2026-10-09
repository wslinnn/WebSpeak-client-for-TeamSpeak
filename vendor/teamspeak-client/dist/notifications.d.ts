import type { Command } from "./command/command.js";
import type { ClientInfo, ClientLeftViewEvent, ClientMovedEvent, TextMessage, PokeEvent, FileUploadInfo, FileDownloadInfo, FileTransferStatusInfo, RawNotification, DirectoryClientInfo } from "./types.js";
export type NotificationResult = {
    kind: "clientEnter";
    info: ClientInfo;
} | {
    kind: "clientLeave";
    event: ClientLeftViewEvent;
    isSelf: boolean;
} | {
    kind: "clientMoved";
    event: ClientMovedEvent;
} | {
    kind: "clientUpdated";
    event: {
        info: DirectoryClientInfo;
    };
} | {
    kind: "textMessage";
    message: TextMessage;
} | {
    kind: "poked";
    event: PokeEvent;
} | {
    kind: "startUpload";
    info: FileUploadInfo;
} | {
    kind: "startDownload";
    info: FileDownloadInfo;
} | {
    kind: "fileTransferStatus";
    info: FileTransferStatusInfo;
} | {
    kind: "rawNotification";
    notification: RawNotification;
};
export declare function handleNotification(cmd: Command, selfCLID: number, clients: Map<number, DirectoryClientInfo>, nickname: string): NotificationResult;
//# sourceMappingURL=notifications.d.ts.map