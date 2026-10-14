import { computed, ref, type Ref } from "vue";
import {
  listFavorites,
  removeFavorite,
  saveFavorite,
  type FavoriteServer,
} from "../services/local-persistence.js";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "../services/teamspeak-target.js";

type Translator = (key: string, variables?: Record<string, string | number>) => string;

/** What a server tab restores into the join form. */
export interface SelectableServer {
  address: string;
  nickname?: string;
  channel?: string;
  password?: string;
}

interface UseWebClientServerHistoryOptions {
  serverHost: Ref<string>;
  serverPort: Ref<string>;
  serverPassword: Ref<string>;
  nickname: Ref<string>;
  channel: Ref<string>;
  rememberIdentity: Ref<boolean>;
  identityMaterial: Ref<string>;
  t: Translator;
  showToast: (message: string, tone?: "info" | "warn") => void;
}

export function useWebClientServerHistory({
  serverHost,
  serverPort,
  serverPassword,
  nickname,
  channel,
  rememberIdentity,
  identityMaterial,
  t,
  showToast,
}: UseWebClientServerHistoryOptions) {
  const favoriteServers = ref<FavoriteServer[]>([]);
  const currentTarget = computed(() => combineTeamSpeakTarget(serverHost.value, serverPort.value));

  async function loadSavedServers(): Promise<void> {
    favoriteServers.value = await listFavorites();
  }

  function selectLocalServer(entry: SelectableServer): void {
    const target = splitTeamSpeakTarget(entry.address);
    serverHost.value = target.address;
    serverPort.value = target.port;
    // The saved entry is the whole context, nickname included — a stale
    // nickname typed for another server must not leak into this connection
    // (same rule as the in-voice chip switch).
    if (entry.nickname) nickname.value = entry.nickname;
    // A tab restores its whole context: channel and (if stored) the password,
    // so one click reconnects exactly like last time.
    channel.value = entry.channel ?? "";
    serverPassword.value = entry.password ?? "";
  }

  /** Upserts the connection context (typed password, nickname, last channel)
   *  into the favorite for the current target. Connecting IS favoriting: the
   *  rail is exactly the set of servers visited, curated by removing entries.
   *  A wrong password stored by an earlier attempt is corrected here. */
  async function syncFavoriteConnection(): Promise<void> {
    const address = currentTarget.value;
    if (!address) return;
    const id = serverKey(address);
    const existing = favoriteServers.value.find((favorite) => favorite.id === id);
    const favorite: FavoriteServer = {
      id,
      label: existing?.label ?? address,
      address,
      ...(nickname.value.trim() || existing?.nickname ? { nickname: nickname.value.trim() || existing?.nickname } : {}),
      ...(rememberIdentity.value && identityMaterial.value ? { identityId: "current" } : existing?.identityId ? { identityId: existing.identityId } : {}),
      ...(channel.value.trim() || existing?.lastChannelHint ? { lastChannelHint: { name: channel.value.trim() || (existing?.lastChannelHint?.name ?? "") } } : {}),
      ...(serverPassword.value || existing?.password ? { password: serverPassword.value || existing?.password } : {}),
    };
    await saveFavorite(favorite);
    favoriteServers.value = existing
      ? favoriteServers.value.map((item) => (item.id === id ? favorite : item))
      : [...favoriteServers.value, favorite].sort((left, right) => left.label.localeCompare(right.label));
  }

  /** Row star / context menu: drop one favorite from the list entirely. */
  async function removeFavoriteRow(server: Pick<FavoriteServer, "id">): Promise<void> {
    await removeFavorite(server.id);
    favoriteServers.value = favoriteServers.value.filter((favorite) => favorite.id !== server.id);
    showToast(t("removedFavoriteToast"));
  }

  /** Dialog save: create or update a favorite by normalized address. The
   *  dialog is authoritative: every field it shows replaces the stored one,
   *  so a cleared channel or password removes it. Only the identity binding,
   *  which the dialog does not expose, carries over. */
  async function upsertFavoriteServer(input: { label: string; address: string; port: string; nickname: string; channel: string; password?: string }): Promise<void> {
    const target = splitTeamSpeakTarget(`${input.address}:${input.port}`);
    const address = combineTeamSpeakTarget(target.address, target.port);
    const id = serverKey(address);
    const existing = favoriteServers.value.find((favorite) => favorite.id === id);
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
    favoriteServers.value = existing
      ? favoriteServers.value.map((item) => (item.id === id ? favorite : item))
      : [...favoriteServers.value, favorite].sort((left, right) => left.label.localeCompare(right.label));
    showToast(t("savedFavoriteToast"));
  }

  function clearServerHistory(): void {
    favoriteServers.value = [];
  }

  return {
    favoriteServers,
    currentTarget,
    loadSavedServers,
    selectLocalServer,
    removeFavoriteRow,
    syncFavoriteConnection,
    upsertFavoriteServer,
    clearServerHistory,
  };
}

function serverKey(address: string): string {
  return address.trim().toLocaleLowerCase();
}
