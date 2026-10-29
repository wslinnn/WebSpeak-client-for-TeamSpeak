import type { ScreenShareStreamDescription as ScreenShareStream, ScreenShareViewerDescription } from "@shared/screen-share";
import type { ChannelMember } from "@shared/voice-models";
import type { ScreenShareOutputSettings } from "@/voice/screen-share";

export type ScreenShareResolutionPreset = "source" | "720p" | "1080p" | "1440p" | "4k";

export type ScreenShareBitratePreset = "auto" | "1.5" | "3" | "5" | "8" | "12";

export interface ScreenShareResolutionOption {
  value: ScreenShareResolutionPreset;
  width?: number;
  height?: number;
  label: string;
}

export interface ScreenShareBitrateOption {
  value: ScreenShareBitratePreset;
  bitrate?: number;
  label: string;
}

/** 画面偏好→degradationPreference：清晰=保分辨率押帧率（现状默认）、
 *  均衡=框架 balanced、流畅=保帧率押分辨率（Piik 画面偏好三态同源）。 */
export type ScreenSharePicturePreference = "clarity" | "balanced" | "smooth";

export const SCREEN_SHARE_PICTURE_PREFERENCE_OPTIONS: Array<{ value: ScreenSharePicturePreference; label: string }> = [
  { value: "clarity", label: "screenSharePictureClarity" },
  { value: "balanced", label: "screenSharePictureBalanced" },
  { value: "smooth", label: "screenSharePictureSmooth" },
];

/** auto=现状默认序（H264>AV1>VP8）；h264/vp8 把所选编码排至首位，余序兜底。 */
export type ScreenShareCodecChoice = "auto" | "h264" | "vp8";

export const SCREEN_SHARE_CODEC_OPTIONS: Array<{ value: ScreenShareCodecChoice; label: string }> = [
  { value: "auto", label: "screenShareCodecAuto" },
  { value: "h264", label: "screenShareCodecH264" },
  { value: "vp8", label: "screenShareCodecVP8" },
];

export interface ScreenSharePresets {
  resolutionPreset: ScreenShareResolutionPreset;
  frameRate: number;
  bitratePreset: ScreenShareBitratePreset;
  picturePreference: ScreenSharePicturePreference;
  codecChoice: ScreenShareCodecChoice;
}

/** These are encoder/output limits; the display track itself keeps the source
 *  resolution (see screen-share.ts). */
export const SCREEN_SHARE_RESOLUTION_OPTIONS: ScreenShareResolutionOption[] = [
  { value: "source", label: "screenShareResolutionSource" },
  { value: "720p", width: 1280, height: 720, label: "screenShareResolution720p" },
  { value: "1080p", width: 1920, height: 1080, label: "screenShareResolution1080p" },
  { value: "1440p", width: 2560, height: 1440, label: "screenShareResolution1440p" },
  { value: "4k", width: 3840, height: 2160, label: "screenShareResolution4K" },
];

export const SCREEN_SHARE_FRAME_RATE_OPTIONS = [5, 10, 15, 24, 30, 60];

export const SCREEN_SHARE_BITRATE_OPTIONS: ScreenShareBitrateOption[] = [
  { value: "auto", label: "screenShareBitrateAuto" },
  { value: "1.5", bitrate: 1_500_000, label: "screenShareBitrate1_5M" },
  { value: "3", bitrate: 3_000_000, label: "screenShareBitrate3M" },
  { value: "5", bitrate: 5_000_000, label: "screenShareBitrate5M" },
  { value: "8", bitrate: 8_000_000, label: "screenShareBitrate8M" },
  { value: "12", bitrate: 12_000_000, label: "screenShareBitrate12M" },
];

const PRESET_RESOLUTION_KEY = "webspeak:screen-share-resolution";
const PRESET_FRAME_RATE_KEY = "webspeak:screen-share-framerate";
const PRESET_BITRATE_KEY = "webspeak:screen-share-bitrate";
const PRESET_PICTURE_PREFERENCE_KEY = "webspeak:screen-share-picture-preference";
const PRESET_CODEC_KEY = "webspeak:screen-share-codec";

export const DEFAULT_SCREEN_SHARE_PRESETS: ScreenSharePresets = {
  resolutionPreset: "1080p",
  frameRate: 15,
  bitratePreset: "auto",
  picturePreference: "clarity",
  codecChoice: "auto",
};

export interface ScreenShareViewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isResolutionPreset(value: unknown): value is ScreenShareResolutionPreset {
  return SCREEN_SHARE_RESOLUTION_OPTIONS.some((option) => option.value === value);
}

function isBitratePreset(value: unknown): value is ScreenShareBitratePreset {
  return SCREEN_SHARE_BITRATE_OPTIONS.some((option) => option.value === value);
}

function isPicturePreference(value: unknown): value is ScreenSharePicturePreference {
  return SCREEN_SHARE_PICTURE_PREFERENCE_OPTIONS.some((option) => option.value === value);
}

function isCodecChoice(value: unknown): value is ScreenShareCodecChoice {
  return SCREEN_SHARE_CODEC_OPTIONS.some((option) => option.value === value);
}

/** Corrupt or missing stored values fall back to the defaults. */
export function readScreenSharePresets(storage: ScreenShareViewStorage): ScreenSharePresets {
  const storedResolution: unknown = storage.getItem(PRESET_RESOLUTION_KEY);
  const storedFrameRate = Number(storage.getItem(PRESET_FRAME_RATE_KEY));
  const storedBitrate: unknown = storage.getItem(PRESET_BITRATE_KEY);
  const storedPicture: unknown = storage.getItem(PRESET_PICTURE_PREFERENCE_KEY);
  const storedCodec: unknown = storage.getItem(PRESET_CODEC_KEY);
  return {
    resolutionPreset: isResolutionPreset(storedResolution) ? storedResolution : DEFAULT_SCREEN_SHARE_PRESETS.resolutionPreset,
    frameRate: SCREEN_SHARE_FRAME_RATE_OPTIONS.includes(storedFrameRate) ? storedFrameRate : DEFAULT_SCREEN_SHARE_PRESETS.frameRate,
    bitratePreset: isBitratePreset(storedBitrate) ? storedBitrate : DEFAULT_SCREEN_SHARE_PRESETS.bitratePreset,
    picturePreference: isPicturePreference(storedPicture) ? storedPicture : DEFAULT_SCREEN_SHARE_PRESETS.picturePreference,
    codecChoice: isCodecChoice(storedCodec) ? storedCodec : DEFAULT_SCREEN_SHARE_PRESETS.codecChoice,
  };
}

export function persistScreenSharePresets(storage: ScreenShareViewStorage, presets: ScreenSharePresets): void {
  storage.setItem(PRESET_RESOLUTION_KEY, presets.resolutionPreset);
  storage.setItem(PRESET_FRAME_RATE_KEY, String(presets.frameRate));
  storage.setItem(PRESET_BITRATE_KEY, presets.bitratePreset);
  storage.setItem(PRESET_PICTURE_PREFERENCE_KEY, presets.picturePreference);
  storage.setItem(PRESET_CODEC_KEY, presets.codecChoice);
}

export function computeScreenShareOutputSettings(presets: ScreenSharePresets): ScreenShareOutputSettings {
  const preset = SCREEN_SHARE_RESOLUTION_OPTIONS.find((option) => option.value === presets.resolutionPreset);
  const bitrateOption = SCREEN_SHARE_BITRATE_OPTIONS.find((option) => option.value === presets.bitratePreset);
  const degradation: Record<ScreenSharePicturePreference, ScreenShareOutputSettings["degradationPreference"]> = {
    clarity: "maintain-resolution",
    balanced: "balanced",
    smooth: "maintain-framerate",
  };
  return {
    ...(preset?.width && preset.height ? { maxWidth: preset.width, maxHeight: preset.height } : {}),
    maxFrameRate: presets.frameRate,
    ...(bitrateOption?.bitrate ? { maxBitrate: bitrateOption.bitrate } : {}),
    degradationPreference: degradation[presets.picturePreference],
    codecPreference: presets.codecChoice,
  };
}

/** A stream belongs to a member by stable ids first; the nickname is only a
 *  fallback for legacy streams without owner ids, so two members sharing a
 *  nickname can never capture each other's screen indicator. */
export function findScreenShareStreamForMember(streams: ScreenShareStream[], member: { id: number; nickname: string }): ScreenShareStream | null {
  return streams.find((stream) => {
    if (typeof stream.ownerClientId === "number") return stream.ownerClientId === member.id;
    if (stream.source === "teamspeak" && /^ts-\d+$/.test(stream.ownerPeerId)) return stream.ownerPeerId === `ts-${member.id}`;
    return stream.ownerNickname === member.nickname;
  }) ?? null;
}

export function screenShareErrorTextOf(error: string, errorCode: string, t: (key: string) => string): string {
  return errorCode === "SCREEN_SHARE_NATIVE_BRIDGE_REQUIRED" ? t("screenShareNativeUnavailable") : error;
}

/** Only the last five viewers get avatar chips; the counter carries the rest. */
export function screenShareViewersOf(stream: ScreenShareStream | null): ScreenShareViewerDescription[] {
  return stream?.viewers.slice(-5) ?? [];
}

/** 观众头像：网关只发 clientId，头像从本机成员目录取（目录里是 capability
 *  URL）；旧网关的内联头像与目录未覆盖的观众依次回退，两者都没有时由调用点
 *  用首字符兜底。 */
export function resolveScreenShareViewerAvatar(viewer: ScreenShareViewerDescription, members: readonly ChannelMember[]): string {
  if (typeof viewer.clientId === "number") {
    const member = members.find((candidate) => candidate.id === viewer.clientId);
    if (member?.avatar) return member.avatar;
  }
  return viewer.avatar ?? "";
}

export function screenShareViewerCountOf(stream: ScreenShareStream | null): number {
  return stream?.viewerCount ?? stream?.viewers.length ?? 0;
}

type SinkVideoElement = HTMLVideoElement & { setSinkId?: (deviceId: string) => Promise<void> };

export interface ScreenShareVideoInput {
  stream: MediaStream | null;
  volume: number;
  sinkId: string;
}

export interface ScreenShareViewOptions {
  startScreenShare(audio?: boolean, settings?: ScreenShareOutputSettings): Promise<void>;
  /** Defaults to localStorage; tests inject a map-backed double. */
  storage?: ScreenShareViewStorage;
}

/** DOM-adjacent share player state (old useWebClientScreenShare's element
 *  bindings + fullscreen tracking + preset actions). One instance per in-room
 *  shell; the React hook drives it from effects and ref callbacks. */
export function createScreenShareView(options: ScreenShareViewOptions) {
  const storage = options.storage ?? localStorage;
  let videoElement: HTMLVideoElement | null = null;
  let playerElement: HTMLElement | null = null;

  function setVideoElement(element: unknown): void {
    if (videoElement && videoElement !== element) videoElement.srcObject = null;
    videoElement = element instanceof HTMLVideoElement ? element : null;
  }

  function setPlayerElement(element: unknown): void {
    const previous = playerElement;
    if (previous && previous !== element && document.fullscreenElement === previous) {
      void document.exitFullscreen().catch(() => undefined);
    }
    playerElement = element instanceof HTMLElement ? element : null;
  }

  function syncFullscreen(): boolean {
    return Boolean(playerElement && document.fullscreenElement === playerElement);
  }

  /** Old watch(viewing → false): stop watching must never strand the player
   *  fullscreen. Absent player exits nothing. */
  function exitPlayerFullscreen(): void {
    if (playerElement && document.fullscreenElement === playerElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }

  async function toggleFullscreen(): Promise<void> {
    const player = playerElement;
    if (!player) return;
    try {
      if (document.fullscreenElement === player) await document.exitFullscreen();
      else if (player.requestFullscreen) await player.requestFullscreen();
    } catch {
      // The fullscreenchange listener re-syncs the flag.
    }
  }

  /** The shared-screen <video> is its own playback endpoint: follow the chosen
   *  output device, otherwise speaker selection misses this audio entirely. */
  async function syncVideo(input: ScreenShareVideoInput): Promise<void> {
    const video = videoElement;
    if (!video) return;
    if (video.srcObject !== input.stream) video.srcObject = input.stream;
    video.volume = Math.max(0, Math.min(1, input.volume ?? 1));
    if (input.sinkId && typeof (video as SinkVideoElement).setSinkId === "function") {
      try { await (video as SinkVideoElement).setSinkId!(input.sinkId); }
      catch { /* the default output remains the fallback */ }
    }
    if (input.stream) void video.play().catch(() => undefined);
  }

  /** Dock 的「共享屏幕」按钮与设置弹窗的「开始共享」共用此入口：先落盘预设，
   *  同步算完参数再进 getDisplayMedia（用户手势链路上不得插入其他 await）。 */
  async function startWithSettings(presets: ScreenSharePresets): Promise<void> {
    const settings = computeScreenShareOutputSettings(presets);
    persistScreenSharePresets(storage, presets);
    await options.startScreenShare(true, settings);
  }

  function dispose(): void {
    setVideoElement(null);
    setPlayerElement(null);
  }

  return { setVideoElement, setPlayerElement, syncFullscreen, exitPlayerFullscreen, toggleFullscreen, syncVideo, startWithSettings, dispose };
}

export type ScreenShareView = ReturnType<typeof createScreenShareView>;
