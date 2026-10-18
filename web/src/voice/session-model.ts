import type { AudioPermission } from "./audio-diagnostics";
import type { MicrophoneProcessingSettings } from "./microphone-capture";
import type { AccompanimentErrorCode } from "./accompaniment";

/** 麦克风音量上限（2.0 = 200%/+6 dB）。>1 时上行脱离直连旁路、走处理图增益，
 *  采集图的限幅器负责防削波。 */
export const MAX_INPUT_VOLUME = 2;

export interface VoiceState {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  reconnectAttempt: number;
  reconnectFailed: boolean;
  tsClientId: number;
  error: string;
  errorCode: string;
  /** Epoch ms until which the gateway told us to wait before retrying the password. */
  retryNotUntil: number;
  /**
   * Non-fatal audio diagnostics. Unlike error/errorCode these never take over
   * the connect form: they explain a degraded microphone or playback path while
   * the voice room itself stays joined and usable.
   */
  microphoneError: string;
  microphoneErrorCode: string;
  audioNotice: string;
  audioNoticeCode: string;
  channelSwitchedChannelId: string;
  /** Set when the TS server moves our own client; the UI syncs its channel
   *  selection from it. Not cleared on read: identical consecutive values are
   *  already reflected in the selection, so a suppressed duplicate is fine. */
  selfMovedChannelId: string;
  /** Mirror of errorCode fed only by connection-origin paths (ticket refusal,
   *  close frames, reconnect failure). Generic per-command error frames must
   *  not land here: the server-switch banner treats this field as "the join
   *  failed", and an unrelated audio/chat error would falsely fail it. */
  connectionFailureCode: string;
}

export interface AudioInputDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

export interface AudioOutputDevice {
  deviceId: string;
  label: string;
  groupId: string;
}

/** The single framework-free view snapshot. Fields replace the former Vue
 *  refs/reactive/computed surface; consumers subscribe through the store. */
export interface VoiceSessionView extends VoiceState {
  identityMaterial: string;
  microphoneMuted: boolean;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  autoGainControlEnabled: boolean;
  inputVolume: number;
  outputVolume: number;
  outputMuted: boolean;
  notificationVolume: number;
  voxThreshold: number;
  inputDevices: AudioInputDevice[];
  outputDevices: AudioOutputDevice[];
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  outputDeviceSupported: boolean;
  audioPermission: AudioPermission;
  microphoneProcessing: MicrophoneProcessingSettings;
  audioContextState: AudioContextState | "unknown";
  micLevel: number;
  microphoneTestActive: boolean;
  microphoneTestPlaybackActive: boolean;
  testAudioUrl: string;
  whisperTargetIds: Set<number>;
  whisperActive: boolean;
  volumes: Record<number, number>;
  accompanimentActive: boolean;
  accompanimentSupported: boolean;
  accompanimentErrorCode: AccompanimentErrorCode;
  /** Live transport for header chrome, derived at every write point from the
   *  transport snapshot and connection state. */
  voiceTransport: "webrtc" | "websocket" | "negotiating" | "disconnected";
}

export type SinkAudioContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>;
};

export class CancelledMediaOperation extends Error {
  constructor() { super("媒体操作已取消"); this.name = "AbortError"; }
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
