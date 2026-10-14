import type { FavoriteServer } from "@/services/local-persistence";
import { listFavorites, removeFavorite, saveFavorite } from "@/services/local-persistence";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "@/services/teamspeak-target";
import type { StoreApi } from "zustand";

import type { HomeStore } from "./home-store";

type Translator = (key: string, variables?: Record<string, string | number>) => string;

/** 服务器标签恢复进 join 表单时携带的上下文。 */
export interface SelectableServer {
  address: string;
  nickname?: string;
  channel?: string;
  password?: string;
}

interface Options {
  store: StoreApi<HomeStore>;
  t: Translator;
  showToast(message: string, tone?: "info" | "warn"): void;
}

/** 连接即收藏（decisions.md 收藏模型）：rail = 访问过的服务器集合，删除即取消收藏。 */
export function createHomeFavorites(options: Options) {
  const state = () => options.store.getState();

  async function loadSavedServers(): Promise<void> {
    options.store.setState({ favoriteServers: await listFavorites() });
  }

  function selectLocalServer(entry: SelectableServer): void {
    const target = splitTeamSpeakTarget(entry.address);
    options.store.setState({
      serverHost: target.address,
      serverPort: target.port,
      // 保存的条目是完整上下文，昵称在内——为别的服务器输的陈旧昵称不得泄漏进
      // 这次连接（与语音内 chip 切换同规则）。
      ...(entry.nickname ? { nickname: entry.nickname } : {}),
      // 标签恢复整个上下文：频道与（如存的）密码，一次点击重连如上次。
      channelName: entry.channel ?? "",
      serverPassword: entry.password ?? "",
    });
  }

  /** 把连接上下文（输入的密码、昵称、最后频道）upsert 进当前目标的收藏。 */
  async function syncFavoriteConnection(): Promise<void> {
    const address = combineTeamSpeakTarget(state().serverHost, state().serverPort);
    if (!address) return;
    const id = serverKey(address);
    const existing = state().favoriteServers.find((favorite) => favorite.id === id);
    const favorite: FavoriteServer = {
      id,
      label: existing?.label ?? address,
      address,
      ...(state().nickname.trim() || existing?.nickname ? { nickname: state().nickname.trim() || existing?.nickname } : {}),
      ...(state().rememberIdentity && state().identityMaterial ? { identityId: "current" } : existing?.identityId ? { identityId: existing.identityId } : {}),
      ...(state().channelName.trim() || existing?.lastChannelHint ? { lastChannelHint: { name: state().channelName.trim() || (existing?.lastChannelHint?.name ?? "") } } : {}),
      ...(state().serverPassword || existing?.password ? { password: state().serverPassword || existing?.password } : {}),
    };
    await saveFavorite(favorite);
    options.store.setState({
      favoriteServers: existing
        ? state().favoriteServers.map((item) => (item.id === id ? favorite : item))
        : [...state().favoriteServers, favorite].sort((left, right) => left.label.localeCompare(right.label)),
    });
  }

  /** 行星标/右键菜单：把一个收藏从列表里整个移除。 */
  async function removeFavoriteRow(server: Pick<FavoriteServer, "id">): Promise<void> {
    await removeFavorite(server.id);
    options.store.setState({ favoriteServers: state().favoriteServers.filter((favorite) => favorite.id !== server.id) });
    options.showToast(options.t("removedFavoriteToast"));
  }

  /** 对话框保存：按规范化地址 create-or-update。对话框是权威：它展示的每个字段
   *  都替换存储值，清空的频道或密码即移除；只有对话框不暴露的身份绑定会延续。 */
  async function upsertFavoriteServer(input: { label: string; address: string; port: string; nickname: string; channel: string; password?: string }): Promise<void> {
    const target = splitTeamSpeakTarget(`${input.address}:${input.port}`);
    const address = combineTeamSpeakTarget(target.address, target.port);
    const id = serverKey(address);
    const existing = state().favoriteServers.find((favorite) => favorite.id === id);
    const favorite: FavoriteServer = {
      id,
      label: input.label || address,
      address,
      ...(input.nickname ? { nickname: input.nickname } : {}),
      ...(existing?.identityId ? { identityId: existing.identityId } : {}),
      ...(input.channel ? { lastChannelHint: { name: input.channel } } : {}),
      ...(input.password ? { password: input.password } : {}),
    };
    await saveFavorite(favorite);
    options.store.setState({
      favoriteServers: existing
        ? state().favoriteServers.map((item) => (item.id === id ? favorite : item))
        : [...state().favoriteServers, favorite].sort((left, right) => left.label.localeCompare(right.label)),
    });
    options.showToast(options.t("savedFavoriteToast"));
  }

  function clearServerHistory(): void {
    options.store.setState({ favoriteServers: [] });
  }

  return {
    loadSavedServers,
    selectLocalServer,
    removeFavoriteRow,
    syncFavoriteConnection,
    upsertFavoriteServer,
    clearServerHistory,
  };
}

export type HomeFavorites = ReturnType<typeof createHomeFavorites>;

function serverKey(address: string): string {
  return address.trim().toLocaleLowerCase();
}
