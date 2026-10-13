import type { SkinCatalogEntry } from "../../../src/shared/skin-catalog.js";
import { createSkinOperation, type SkinLoadOptions } from "./skin-operation.js";
export type { SkinCatalogEntry } from "../../../src/shared/skin-catalog.js";

export const BUILTIN_SKIN_CATALOG: SkinCatalogEntry[] = [
  {
    id: "builtin.light",
    name: "Day mode",
    version: "1.0.0",
    author: "WebSpeak",
    license: "AGPL-3.0-only",
    description: "The default light appearance.",
    minAppVersion: "0.2.6",
    installedAt: 0,
    builtIn: true,
    previewKind: "day",
  },
  {
    id: "builtin.dark",
    name: "Night mode",
    version: "1.0.0",
    author: "WebSpeak",
    license: "AGPL-3.0-only",
    description: "The default dark appearance.",
    minAppVersion: "0.2.6",
    installedAt: 0,
    builtIn: true,
    previewKind: "night",
  },
];

// The bundled ILLUSIA skin was retired; its id stays frozen on the server
// (protected built-in), so a directory can never legitimately list it again.
const RETIRED_BUNDLED_SKIN_IDS = new Set(["community.illusia-voice"]);
let publicDirectoryLoaded = false;
let publicEnabledSkinIds = new Set<string>(BUILTIN_SKIN_CATALOG.map((skin) => skin.id));
let publicDefaultSkinId = "builtin.light";
let pendingDirectory: ReturnType<typeof createSkinOperation> | null = null;
// The service stays framework-free: UI subscribes here to learn that the
// directory refresh fell back to the built-in catalog.
const directoryErrorListeners = new Set<() => void>();

export function onSkinDirectoryError(listener: () => void): () => void {
  directoryErrorListeners.add(listener);
  return () => directoryErrorListeners.delete(listener);
}

export function getPublicDefaultSkinId(): string {
  return isPublicSkinEnabled(publicDefaultSkinId) ? publicDefaultSkinId : "builtin.light";
}

export function isPublicSkinEnabled(id: string): boolean {
  if (RETIRED_BUNDLED_SKIN_IDS.has(id)) return false;
  if (BUILTIN_SKIN_CATALOG.some((skin) => skin.id === id)) return true;
  return !publicDirectoryLoaded || publicEnabledSkinIds.has(id);
}

export async function listPublicSkins(options: SkinLoadOptions = {}): Promise<SkinCatalogEntry[]> {
  options.signal?.throwIfAborted();
  pendingDirectory?.cancel();
  const operation = createSkinOperation(options);
  pendingDirectory = operation;
  try {
    const response = await operation.wait(fetch("/api/skins", { headers: { accept: "application/json" }, cache: "no-cache", signal: operation.signal }));
    if (!response.ok) throw new Error("Skin directory unavailable");
    const payload: unknown = await operation.wait(response.json());
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { skins?: unknown }).skins)) throw new Error("Invalid skin directory");
    const directorySkins = (payload as { skins: unknown[] }).skins.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const skin = value as Record<string, unknown>;
      if (typeof skin.id !== "string" || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(skin.id) || skin.id.startsWith("builtin.") || RETIRED_BUNDLED_SKIN_IDS.has(skin.id)) return [];
      if ([skin.name, skin.version, skin.author, skin.license, skin.minAppVersion].some((field) => typeof field !== "string")) return [];
      const previewUrl = typeof skin.previewUrl === "string" && skin.previewUrl === `/api/skins/${skin.id}/preview` ? skin.previewUrl : undefined;
      return [{
        id: skin.id,
        name: skin.name as string,
        version: skin.version as string,
        author: skin.author as string,
        license: skin.license as string,
        minAppVersion: skin.minAppVersion as string,
        ...(typeof skin.description === "string" ? { description: skin.description } : {}),
        ...(previewUrl ? { previewUrl } : {}),
        installedAt: Number.isFinite(skin.installedAt) ? Number(skin.installedAt) : 0,
        enabled: skin.enabled !== false,
      }];
    });
    publicDirectoryLoaded = true;
    publicEnabledSkinIds = new Set([
      ...BUILTIN_SKIN_CATALOG.map((skin) => skin.id),
      ...directorySkins.filter((skin) => skin.enabled).map((skin) => skin.id),
    ]);
    const requestedDefault = (payload as { defaultSkinId?: unknown }).defaultSkinId;
    publicDefaultSkinId = typeof requestedDefault === "string" && publicEnabledSkinIds.has(requestedDefault) ? requestedDefault : "builtin.light";
    return [...BUILTIN_SKIN_CATALOG, ...directorySkins.filter((skin) => skin.enabled)];
  } catch {
    operation.check();
    publicDirectoryLoaded = false;
    publicEnabledSkinIds = new Set(BUILTIN_SKIN_CATALOG.map((skin) => skin.id));
    publicDefaultSkinId = "builtin.light";
    for (const listener of directoryErrorListeners) listener();
    return BUILTIN_SKIN_CATALOG;
  } finally {
    operation.finish();
    if (pendingDirectory === operation) pendingDirectory = null;
  }
}
