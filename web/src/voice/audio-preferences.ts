import { loadLocalPreferences, saveLocalPreferences } from "../services/local-persistence";
import type { ChannelMember } from "@shared/voice-models";
import { MAX_INPUT_VOLUME, clamp, type VoiceSessionView } from "./session-model";

/** 偏好持久化簇（自 session-controller 平移）：音频偏好的装载、防抖落盘、
 *  已提交镜像（committed mirrors）与按 uid 的每成员音量记忆。镜像语义：
 *  「最后一次确认成功的配置」——采集图提交、设备/处理事务成功后才推进；
 *  断线释放与事务回滚读镜像而非 store 当前值。 */

export interface CommittedAudioPreferences {
  selectedInputDeviceId: string;
  selectedOutputDeviceId: string;
  noiseSuppressionEnabled: boolean;
  echoCancellationEnabled: boolean;
  autoGainControlEnabled: boolean;
}

export type CommittedTouchedKey =
  | "inputDevice"
  | "outputDevice"
  | "noiseSuppression"
  | "echoCancellation"
  | "autoGainControl";

interface AudioPreferencesDeps {
  V(): VoiceSessionView;
  patch(partial: Partial<VoiceSessionView>): void;
  /** 会话成员实时目录（按 uid 回填每成员音量）。 */
  membersLive(): readonly ChannelMember[];
}

export function createAudioPreferences(deps: AudioPreferencesDeps) {
  const { V, patch } = deps;
  const storedVolumesByUid: Record<string, number> = {};
  let inputDeviceTouched = false;
  let outputDeviceTouched = false;
  let noiseSuppressionTouched = false;
  let echoCancellationTouched = false;
  let autoGainControlTouched = false;
  let committedInputDeviceId = V().selectedInputDeviceId;
  let committedOutputDeviceId = V().selectedOutputDeviceId;
  let committedNoiseSuppressionEnabled = V().noiseSuppressionEnabled;
  let committedEchoCancellationEnabled = V().echoCancellationEnabled;
  let committedAutoGainControlEnabled = V().autoGainControlEnabled;

  function committed(): CommittedAudioPreferences {
    return {
      selectedInputDeviceId: committedInputDeviceId,
      selectedOutputDeviceId: committedOutputDeviceId,
      noiseSuppressionEnabled: committedNoiseSuppressionEnabled,
      echoCancellationEnabled: committedEchoCancellationEnabled,
      autoGainControlEnabled: committedAutoGainControlEnabled,
    };
  }

  function setCommitted(partial: Partial<CommittedAudioPreferences>): void {
    if (partial.selectedInputDeviceId !== undefined) committedInputDeviceId = partial.selectedInputDeviceId;
    if (partial.selectedOutputDeviceId !== undefined) committedOutputDeviceId = partial.selectedOutputDeviceId;
    if (partial.noiseSuppressionEnabled !== undefined) committedNoiseSuppressionEnabled = partial.noiseSuppressionEnabled;
    if (partial.echoCancellationEnabled !== undefined) committedEchoCancellationEnabled = partial.echoCancellationEnabled;
    if (partial.autoGainControlEnabled !== undefined) committedAutoGainControlEnabled = partial.autoGainControlEnabled;
  }

  function markTouched(key: CommittedTouchedKey): void {
    if (key === "inputDevice") inputDeviceTouched = true;
    else if (key === "outputDevice") outputDeviceTouched = true;
    else if (key === "noiseSuppression") noiseSuppressionTouched = true;
    else if (key === "echoCancellation") echoCancellationTouched = true;
    else autoGainControlTouched = true;
  }

  function syncKnownMemberVolumes(): void {
    const updates: Record<number, number> = {};
    let changed = false;
    for (const member of deps.membersLive()) {
      if (!member.uid) continue;
      const saved = storedVolumesByUid[member.uid];
      if (saved !== undefined && (V().volumes[member.id] ?? 1) !== Math.max(0, Math.min(4, saved))) {
        updates[member.id] = Math.max(0, Math.min(4, saved));
        changed = true;
      }
    }
    if (changed) patch({ volumes: { ...V().volumes, ...updates } });
  }

  /** 滑条拖动的落盘去抖：每个 input tick 全量序列化偏好曾在移动端把帧预算
   *  打爆（拖动不跟手，2026-10-18）。尾沿 200ms，页面关闭丢末次写可接受。 */
  let audioPreferencesSaveTimer: ReturnType<typeof setTimeout> | null = null;
  function queueSave(): void {
    if (audioPreferencesSaveTimer) clearTimeout(audioPreferencesSaveTimer);
    audioPreferencesSaveTimer = setTimeout(() => {
      audioPreferencesSaveTimer = null;
      void save();
    }, 200);
  }

  async function save(): Promise<void> {
    await saveLocalPreferences({
      schemaVersion: 1,
      preferredInputDeviceId: committedInputDeviceId,
      inputDeviceId: committedInputDeviceId,
      microphoneMuted: V().microphoneMuted,
      noiseSuppressionEnabled: committedNoiseSuppressionEnabled,
      echoCancellationEnabled: committedEchoCancellationEnabled,
      autoGainControlEnabled: committedAutoGainControlEnabled,
      voxThreshold: V().voxThreshold,
      inputGain: V().inputVolume,
      outputVolume: V().outputVolume,
      notificationVolume: V().notificationVolume,
      preferredOutputDeviceId: committedOutputDeviceId,
      volumesByUid: { ...storedVolumesByUid },
    });
  }

  const ready = loadLocalPreferences().then((preferences) => {
    const next: Partial<VoiceSessionView> = {};
    if (!inputDeviceTouched) {
      if (!V().selectedInputDeviceId) next.selectedInputDeviceId = preferences.preferredInputDeviceId ?? preferences.inputDeviceId ?? "";
      committedInputDeviceId = next.selectedInputDeviceId ?? V().selectedInputDeviceId;
    }
    if (typeof preferences.microphoneMuted === "boolean") next.microphoneMuted = preferences.microphoneMuted;
    if (!noiseSuppressionTouched && typeof preferences.noiseSuppressionEnabled === "boolean") {
      next.noiseSuppressionEnabled = preferences.noiseSuppressionEnabled;
      committedNoiseSuppressionEnabled = preferences.noiseSuppressionEnabled;
    }
    if (!echoCancellationTouched && typeof preferences.echoCancellationEnabled === "boolean") {
      next.echoCancellationEnabled = preferences.echoCancellationEnabled;
      committedEchoCancellationEnabled = preferences.echoCancellationEnabled;
    }
    if (!autoGainControlTouched && typeof preferences.autoGainControlEnabled === "boolean") {
      next.autoGainControlEnabled = preferences.autoGainControlEnabled;
      committedAutoGainControlEnabled = preferences.autoGainControlEnabled;
    }
    if (typeof preferences.voxThreshold === "number") next.voxThreshold = clamp(preferences.voxThreshold, 0.001, 0.08);
    if (typeof preferences.inputGain === "number") next.inputVolume = Math.max(0, Math.min(MAX_INPUT_VOLUME, preferences.inputGain));
    if (typeof preferences.outputVolume === "number") next.outputVolume = Math.max(0, Math.min(1, preferences.outputVolume));
    if (!outputDeviceTouched) {
      if (!V().selectedOutputDeviceId) next.selectedOutputDeviceId = preferences.preferredOutputDeviceId ?? "";
      committedOutputDeviceId = next.selectedOutputDeviceId ?? V().selectedOutputDeviceId;
    }
    if (typeof preferences.notificationVolume === "number") next.notificationVolume = clamp(preferences.notificationVolume, 0, 1);
    if (Object.keys(next).length) patch(next);
    Object.assign(storedVolumesByUid, preferences.volumesByUid ?? {});
    syncKnownMemberVolumes();
  });

  const volumeSyncTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const VOLUME_SYNC_DELAY_MS = 150;

  function stashUidVolume(uid: string, volume: number): void {
    storedVolumesByUid[uid] = volume;
  }

  function queueVolumeSave(clientId: number): void {
    const pending = volumeSyncTimers.get(clientId);
    if (pending !== undefined) clearTimeout(pending);
    volumeSyncTimers.set(clientId, setTimeout(() => {
      volumeSyncTimers.delete(clientId);
      void save();
    }, VOLUME_SYNC_DELAY_MS));
  }

  return {
    /** connect 起始握手等待的偏好装载 promise（join 票据交换在其后）。 */
    ready: ready as Promise<void>,
    committed,
    setCommitted,
    markTouched,
    syncKnownMemberVolumes,
    queueSave,
    save,
    stashUidVolume,
    queueVolumeSave,
  };
}

export type AudioPreferences = ReturnType<typeof createAudioPreferences>;
