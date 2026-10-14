import { createStore } from "zustand/vanilla";

import type { FavoriteServer } from "@/services/local-persistence";

export type WebClientChatTab = "channel" | "server" | "private" | "events";
export type SecretAction = "keep" | "replace" | "remove";

export interface ChannelPasswordDialogState {
  open: boolean;
  channelId: string;
  password: string;
  error: string;
  submitting: boolean;
}

export interface ServerPasswordDialogState {
  open: boolean;
  password: string;
  errorCode: string;
}

export interface IdentityDialogState {
  open: boolean;
  text: string;
  error: string;
  busy: boolean;
  reading: boolean;
  exporting: boolean;
}

/** 首页态共享状态：join 表单 + 弹窗 + 收藏（旧 WebClient.vue ref 群的快照化）。 */
export interface HomeStore {
  nickname: string;
  channelName: string;
  serverHost: string;
  serverPort: string;
  serverPassword: string;
  rememberIdentity: boolean;
  identityMaterial: string;
  selectedChannelId: string;
  chatTab: WebClientChatTab;
  favoriteServers: FavoriteServer[];
  channelPasswordDialog: ChannelPasswordDialogState;
  serverPasswordDialog: ServerPasswordDialogState;
  identityDialog: IdentityDialogState;
}

export function createHomeStore() {
  return createStore<HomeStore>(() => ({
    nickname: "",
    channelName: "",
    serverHost: "",
    serverPort: "9987",
    serverPassword: "",
    rememberIdentity: false,
    identityMaterial: "",
    selectedChannelId: "",
    chatTab: "channel",
    favoriteServers: [],
    channelPasswordDialog: { open: false, channelId: "", password: "", error: "", submitting: false },
    serverPasswordDialog: { open: false, password: "", errorCode: "" },
    identityDialog: { open: false, text: "", error: "", busy: false, reading: false, exporting: false },
  }));
}

export type HomeStoreController = ReturnType<typeof createHomeStore>;
