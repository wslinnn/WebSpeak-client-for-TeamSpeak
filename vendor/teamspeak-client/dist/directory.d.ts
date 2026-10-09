import type { ChannelInfo, DirectoryClientInfo } from "./types.js";
/** Parse one `channellist` row into the stable directory representation. */
export declare function parseDirectoryChannel(params: Record<string, string>): ChannelInfo | null;
/** Parse one `channelclientlist` row into the stable directory representation. */
export declare function parseDirectoryClient(params: Record<string, string>): DirectoryClientInfo | null;
/** Apply a channel notification and report whether the directory changed. */
export declare function applyChannelNotification(name: string, params: Record<string, string>, channels: Map<bigint, ChannelInfo>): boolean;
export declare function cloneDirectorySnapshot(channels: Map<bigint, ChannelInfo>, clients: Map<number, DirectoryClientInfo>): {
    channels: ChannelInfo[];
    clients: DirectoryClientInfo[];
};
//# sourceMappingURL=directory.d.ts.map