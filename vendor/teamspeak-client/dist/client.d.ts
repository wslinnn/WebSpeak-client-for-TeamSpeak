import { type EventMap, type ClientOptions, type CommandMiddleware, type EventMiddleware, type Logger, ClientStatus } from "./types.js";
import { Identity, Crypt } from "./crypto/index.js";
import { PacketHandler } from "./transport/handler.js";
import type { FileUploadInfo, FileDownloadInfo } from "./types.js";
import type { Readable, Writable } from "node:stream";
export { ClientStatus };
export interface ClientState {
    status: ClientStatus;
    clid: number;
}
export declare class Client {
    #private;
    /** @internal */ crypt: Crypt;
    /** @internal */ handler: PacketHandler;
    /** @internal */ logger: Logger;
    /** @internal */ nickname: string;
    /** @internal */ clid: number;
    constructor(identity: Identity, addr: string, nickname: string, options?: ClientOptions);
    get status(): ClientStatus;
    /** @internal */
    getClientInitOptions(): Readonly<{
        serverPassword: string;
        defaultChannel: string;
        defaultChannelPassword: string;
    }>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    waitConnected(signal?: AbortSignal): Promise<void>;
    sendCommandNoWait(cmd: string): Promise<void>;
    execCommand(cmd: string, timeoutMs?: number): Promise<void>;
    execCommandWithResponse(cmd: string, timeoutMs?: number): Promise<Record<string, string>[]>;
    on<K extends keyof EventMap>(event: K, handler: EventMap[K] extends void ? () => void : (payload: EventMap[K]) => void): this;
    useCommandMiddleware(...mw: CommandMiddleware[]): this;
    useEventMiddleware(...mw: EventMiddleware[]): this;
    clientID(): number;
    channelID(): bigint;
    sendVoice(data: Uint8Array, codec: number): void;
    sendWhisper(data: Uint8Array, targetClientIds: number[], codec: number): void;
    fileTransferInitUpload(channelID: bigint, path: string, password: string, size: bigint, overwrite?: boolean): Promise<FileUploadInfo>;
    fileTransferInitDownload(channelID: bigint, path: string, password: string): Promise<FileDownloadInfo>;
    uploadFileData(host: string, info: FileUploadInfo, data: Readable): Promise<void>;
    downloadFileData(host: string, info: FileDownloadInfo, dest: Writable): Promise<void>;
    /** @internal */
    _markConnected(): void;
}
//# sourceMappingURL=client.d.ts.map