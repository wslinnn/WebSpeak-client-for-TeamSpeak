import type { ChannelInfo, ClientInfo } from "./types.js";
import type { Client } from "./client.js";
/** Send a text message to a client (targetMode=1), channel (2), or server (3). */
export declare function sendTextMessage(client: Client, targetMode: number, targetID: bigint, message: string): Promise<void>;
/** Move a client to a different channel. */
export declare function clientMove(client: Client, clid: number, channelID: bigint, password?: string): Promise<void>;
/** Send a poke message to a client. */
export declare function poke(client: Client, clid: number, message: string): Promise<void>;
/** Fetch raw clientinfo for a given clid. */
export declare function getClientInfo(client: Client, clid: number): Promise<Record<string, string>>;
/** List all channels on the server. */
export declare function listChannels(client: Client): Promise<ChannelInfo[]>;
/** List all clients currently connected to the server. */
export declare function listClients(client: Client): Promise<ClientInfo[]>;
/** Delete a file on the server. */
export declare function fileTransferDeleteFile(client: Client, channelID: bigint, paths: string[]): Promise<void>;
//# sourceMappingURL=api.d.ts.map