import { computed, ref, watch, type Ref } from "vue";
import {
  listFavorites,
  listRecentServers,
  recordRecentServer,
  removeFavorite,
  saveFavorite,
  type FavoriteServer,
  type RecentServer,
} from "../services/local-persistence.js";
import { combineTeamSpeakTarget, splitTeamSpeakTarget } from "../services/teamspeak-target.js";
import { mergeQuickServers, type QuickServer } from "../services/quick-servers.js";

type Translator = (key: string, variables?: Record<string, string | number>) => string;

/** What a server tab (favorite or recent) restores into the join form. */
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
  showToast: (message: string) => void;
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
  const recentServers = ref<RecentServer[]>([]);
  const currentTarget = computed(() => combineTeamSpeakTarget(serverHost.value, serverPort.value));
  const isFavorite = computed(() => favoriteServers.value.some((favorite) => favorite.id === serverKey(currentTarget.value)));
  // One merged picker row per server: favorites lead, a matching recent only
  // enriches connection details instead of rendering a duplicate row.
  const quickServers = computed(() => mergeQuickServers(favoriteServers.value, recentServers.value));
  // Opt-in per session, default off; a stored password rides on the favorite.
  const rememberServerPassword = ref(false);

  async function loadSavedServers(): Promise<void> {
    const [favorites, recent] = await Promise.all([listFavorites(), listRecentServers()]);
    favoriteServers.value = favorites;
    recentServers.value = recent;
  }

  function recordCurrentServer(): void {
    const address = currentTarget.value;
    if (!address) return;
    const recent: RecentServer = {
      id: serverKey(address),
      address,
      ...(nickname.value.trim() ? { nickname: nickname.value.trim() } : {}),
      ...(rememberIdentity.value && identityMaterial.value ? { identityId: "current" } : {}),
      lastConnectedAt: Date.now(),
      ...(channel.value.trim() ? { lastChannelHint: { name: channel.value.trim() } } : {}),
    };
    void recordRecentServer(recent).then(() => listRecentServers().then((items) => { recentServers.value = items; }));
  }

  function selectLocalServer(entry: SelectableServer): void {
    const target = splitTeamSpeakTarget(entry.address);
    serverHost.value = target.address;
    serverPort.value = target.port;
    if (entry.nickname && !nickname.value.trim()) nickname.value = entry.nickname;
    // A tab restores its whole context: channel and (if stored) the password,
    // so one click reconnects exactly like last time.
    channel.value = entry.channel ?? "";
    serverPassword.value = entry.password ?? "";
    rememberServerPassword.value = Boolean(entry.password);
  }

  async function toggleFavorite(): Promise<void> {
    const address = currentTarget.value;
    if (!address) return;
    const id = serverKey(address);
    const existing = favoriteServers.value.find((favorite) => favorite.id === id);
    if (existing) {
      await removeFavorite(id);
      favoriteServers.value = favoriteServers.value.filter((favorite) => favorite.id !== id);
      showToast(t("removedFavoriteToast"));
      return;
    }
    const favorite: FavoriteServer = {
      id,
      label: address,
      address,
      ...(nickname.value.trim() ? { nickname: nickname.value.trim() } : {}),
      ...(rememberIdentity.value && identityMaterial.value ? { identityId: "current" } : {}),
      ...(channel.value.trim() ? { lastChannelHint: { name: channel.value.trim() } } : {}),
    };
    await saveFavorite(favorite);
    favoriteServers.value = [...favoriteServers.value, favorite].sort((left, right) => left.label.localeCompare(right.label));
    showToast(t("savedFavoriteToast"));
  }

  /** Connection established: with the opt-in on, write the (possibly retried)
   *  password into the favorite — a wrong password stored by an earlier
   *  attempt is corrected here, not at submit time. */
  async function syncFavoritePassword(): Promise<void> {
    if (!rememberServerPassword.value || !serverPassword.value) return;
    const address = currentTarget.value;
    if (!address) return;
    const id = serverKey(address);
    const existing = favoriteServers.value.find((favorite) => favorite.id === id);
    const favorite: FavoriteServer = existing
      ? { ...existing, password: serverPassword.value }
      : {
        id,
        label: address,
        address,
        password: serverPassword.value,
        ...(nickname.value.trim() ? { nickname: nickname.value.trim() } : {}),
      };
    await saveFavorite(favorite);
    favoriteServers.value = existing
      ? favoriteServers.value.map((item) => (item.id === id ? favorite : item))
      : [...favoriteServers.value, favorite].sort((left, right) => left.label.localeCompare(right.label));
  }

  /** Unchecking the opt-in forgets the stored password right away. */
  async function clearFavoritePassword(): Promise<void> {
    const address = currentTarget.value;
    if (!address) return;
    const id = serverKey(address);
    const existing = favoriteServers.value.find((favorite) => favorite.id === id);
    if (!existing?.password) return;
    const { password: _removed, ...favorite } = existing;
    await saveFavorite(favorite);
    favoriteServers.value = favoriteServers.value.map((item) => (item.id === id ? favorite : item));
    showToast(t("storedPasswordClearedToast"));
  }

  watch(rememberServerPassword, (enabled) => {
    if (!enabled) void clearFavoritePassword();
  });

  /** Dialog save: create or update a favorite by normalized address. An empty
   *  password keeps an already-stored one — explicit clearing goes through the
   *  remember-password checkbox, not this path. */
  async function upsertFavoriteServer(input: { label: string; address: string; port: string; nickname: string; channel: string; password?: string }): Promise<void> {
    const target = splitTeamSpeakTarget(`${input.address}:${input.port}`);
    const address = combineTeamSpeakTarget(target.address, target.port);
    const id = serverKey(address);
    const existing = favoriteServers.value.find((favorite) => favorite.id === id);
    const favorite: FavoriteServer = {
      id,
      label: input.label || address,
      address,
      ...(input.nickname || existing?.nickname ? { nickname: input.nickname || existing?.nickname } : {}),
      ...(existing?.identityId ? { identityId: existing.identityId } : {}),
      ...(input.channel || existing?.lastChannelHint ? { lastChannelHint: input.channel ? { name: input.channel } : existing?.lastChannelHint } : {}),
      ...(input.password || existing?.password ? { password: input.password || existing?.password } : {}),
    };
    await saveFavorite(favorite);
    favoriteServers.value = existing
      ? favoriteServers.value.map((item) => (item.id === id ? favorite : item))
      : [...favoriteServers.value, favorite].sort((left, right) => left.label.localeCompare(right.label));
    showToast(t("savedFavoriteToast"));
  }

  /** Star button on a picker row: favorites are unstarred, a recent is
   *  promoted with the connection details it already carries (no password —
   *  that only ever arrives through the opt-in or the dialog). */
  async function toggleQuickServerFavorite(server: Pick<QuickServer, "address" | "nickname" | "identityId" | "lastChannelHint">): Promise<void> {
    const id = serverKey(server.address);
    const existing = favoriteServers.value.find((favorite) => favorite.id === id);
    if (existing) {
      await removeFavorite(id);
      favoriteServers.value = favoriteServers.value.filter((favorite) => favorite.id !== id);
      showToast(t("removedFavoriteToast"));
      return;
    }
    const favorite: FavoriteServer = {
      id,
      label: server.address.trim(),
      address: server.address.trim(),
      ...(server.nickname ? { nickname: server.nickname } : {}),
      ...(server.identityId ? { identityId: server.identityId } : {}),
      ...(server.lastChannelHint ? { lastChannelHint: server.lastChannelHint } : {}),
    };
    await saveFavorite(favorite);
    favoriteServers.value = [...favoriteServers.value, favorite].sort((left, right) => left.label.localeCompare(right.label));
    showToast(t("savedFavoriteToast"));
  }

  function clearServerHistory(): void {
    favoriteServers.value = [];
    recentServers.value = [];
    rememberServerPassword.value = false;
  }

  return {
    favoriteServers,
    recentServers,
    quickServers,
    isFavorite,
    currentTarget,
    rememberServerPassword,
    loadSavedServers,
    recordCurrentServer,
    selectLocalServer,
    syncFavoritePassword,
    toggleFavorite,
    toggleQuickServerFavorite,
    upsertFavoriteServer,
    clearServerHistory,
  };
}

function serverKey(address: string): string {
  return address.trim().toLocaleLowerCase();
}
