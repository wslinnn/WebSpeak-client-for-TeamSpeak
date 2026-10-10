<template>
  <div
    class="modal-backdrop"
    @click.self="emit('close')"
  >
    <section
      class="settings-modal"
      data-ws-part="voice.audio-settings"
      ref="dialog"
      tabindex="-1"
      @keydown="onDialogKeydown"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'settings-title'"
    >
      <div class="settings-main"
        ><header class="settings-header"
          ><h2 id="settings-title">{{ t("audioConfiguration") }}</h2
          ><button
            class="round-icon"
            :title="t('close')"
            @click="emit('close')"
            ><Icon
              name="close"
              :size="19" /></button></header
        ><div class="settings-content">
          <section class="settings-section"
            ><h3
              ><Icon
                name="mic"
                :size="20"
              />
              {{ t("inputDevice") }}</h3
            ><label
              class="settings-label"
              for="input-device"
              >{{ t("microphone") }}</label
            ><select
              id="input-device"
              class="settings-select"
              :value="inputSelectValue"
              :disabled="!inputDevices.length"
              @change="onInputDeviceChange"
              ><option value="">{{ t("defaultMicrophone") }}</option
              ><option
                v-for="(device, index) in inputDevices"
                :key="device.deviceId || `microphone-${index}`"
                :value="device.deviceId"
                >{{ device.label || t("microphoneNumber", { index: index + 1 }) }}</option
              ></select
            ><p
              v-if="audioSettingsError"
              class="settings-error"
              >{{ localizedMessage(audioSettingsError) }}</p
            ><p class="audio-diagnostic"
              ><span>{{ t("permission") }}</span
              ><strong :class="`permission-${audioPermission}`">{{
                audioPermission === "granted"
                  ? t("permissionGranted")
                  : audioPermission === "denied"
                    ? t("permissionDenied")
                    : t("permissionUnknown")
              }}</strong></p
            ><div class="microphone-control"
              ><div
                ><label class="settings-label">{{ t("microphoneState") }}</label
                ><p class="settings-hint">{{
                  microphoneMuted ? t("microphoneMutedHint") : t("microphoneActiveHint")
                }}</p></div
              ><button
                type="button"
                class="microphone-toggle"
                :class="{ muted: microphoneMuted }"
                :aria-pressed="!microphoneMuted"
                @click="toggleMicrophone"
                ><Icon
                  :name="microphoneMuted ? 'mic-off' : 'mic'"
                  :size="16"
                />
                {{ microphoneMuted ? t("unmuteMic") : t("muteMic") }}</button
              ></div
            ><label
              v-if="isMobileViewport"
              class="mobile-noise-toggle"
              ><span
                ><strong>{{ t("noiseSuppression") }}</strong
                ><small>{{ t("noiseSuppressionHint") }}</small></span
              ><input
                type="checkbox"
                :checked="noiseSuppressionEnabled"
                :aria-label="t('noiseSuppression')"
                @change="onNoiseSuppressionToggle" /></label
            ><template v-if="isMobileViewport"
              ><div class="settings-range-row"
                ><label class="settings-label">{{ t("inputVolume") }}</label
                ><strong>{{ Math.round(inputVolume * 100) }}%</strong></div
              ><input
                class="settings-range"
                type="range"
                min="0"
                max="100"
                :value="inputVolume * 100"
                :style="rangeStyle(inputVolume, 1)"
                :aria-label="t('inputVolume')"
                @input="onInputVolume" /></template
            ><div class="settings-range-row"
              ><label class="settings-label">{{ t("voxThreshold") }}</label
              ><strong>{{ (voxThreshold * 100).toFixed(1) }}%</strong></div
            ><input
              class="settings-range"
              type="range"
              min="1"
              max="80"
              :value="voxThreshold * 1000"
              :style="rangeStyle(voxThreshold, 0.08)"
              :aria-label="t('voxThreshold')"
              @input="onVoxThreshold" /><div class="audio-level-row"
              ><span>{{ t("micLevel") }}</span
              ><strong>{{ Math.round(micLevel * 100) }}%</strong></div
            ><div class="audio-level-track"
              ><i :style="{ width: `${Math.round(micLevel * 100)}%` }"></i></div
            ><div class="mic-test"
              ><div class="mic-test-header"
                ><strong>{{ t("microphoneTest") }}</strong
                ><button
                  type="button"
                  @click="toggleMicTest"
                  >{{ microphoneTestActive ? t("stopTest") : t("startTest") }}</button
                ></div
              ><div class="meter"
                ><i
                  v-for="index in 24"
                  :key="index"
                  :class="{ active: microphoneTestActive && index <= micMeterBars }"
                  :style="{ height: `${meterBarHeight(index)}px` }"
                ></i></div
              ><div class="meter-labels"
                ><span>{{ t("silence") }}</span
                ><span>{{ t("optimal") }}</span
                ><span>{{ t("loud") }}</span></div
              ><p class="settings-hint">{{ t("localMicTestHint") }}</p
              ><audio
                v-if="testAudioUrl"
                ref="testAudioElement"
                class="test-audio"
                :src="testAudioUrl"
                controls
                :aria-label="t('microphoneTest')"
                @error="onTestAudioError"
              ></audio></div
          ></section>
          <div class="settings-separator"></div
          ><section class="settings-section"
            ><h3
              ><Icon
                name="volume"
                :size="20"
              />
              {{ t("outputVolume") }}</h3
            ><label
              v-if="outputDeviceSupported"
              class="settings-label"
              for="output-device"
              >{{ t("outputDevice") }}</label
            ><select
              v-if="outputDeviceSupported"
              id="output-device"
              class="settings-select"
              :value="outputSelectValue"
              :disabled="!outputDevices.length"
              @change="onOutputDeviceChange"
              ><option value="">{{ t("defaultOutput") }}</option
              ><option
                v-for="(device, index) in outputDevices"
                :key="device.deviceId || `speaker-${index}`"
                :value="device.deviceId"
                >{{ device.label || t("speakerNumber", { index: index + 1 }) }}</option
              ></select
            ><p
              v-else
              class="mode-note"
              ><Icon
                name="info"
                :size="16"
              /><span>{{ t("outputDeviceUnsupported") }}</span></p
            ><template v-if="isMobileViewport"
              ><div class="settings-range-row"
                ><label class="settings-label">{{ t("speakers") }}</label
                ><strong>{{ Math.round(outputVolume * 100) }}%</strong></div
              ><input
                class="settings-range"
                type="range"
                min="0"
                max="100"
                :value="outputVolume * 100"
                :style="rangeStyle(outputVolume, 1)"
                :aria-label="t('outputVolume')"
                @input="onOutputVolume" /></template
            ><div class="settings-range-row"
              ><label class="settings-label">{{ t("notificationVolume") }}</label
              ><strong>{{ Math.round(notificationVolume * 100) }}%</strong></div
            ><input
              class="settings-range"
              type="range"
              min="0"
              max="100"
              :value="notificationVolume * 100"
              :style="rangeStyle(notificationVolume, 1)"
              :aria-label="t('notificationVolume')"
              @input="onNotificationVolume"
            /><label
              class="desktop-notification-toggle"
              ><span
                ><strong>{{ t("desktopNotifications") }}</strong
                ><small>{{ t("desktopNotificationsHint") }}</small></span
              ><input
                type="checkbox"
                :checked="desktopNotificationsEnabled"
                :aria-label="t('desktopNotifications')"
                @change="onDesktopNotificationsToggle" /></label
            ><div class="audio-diagnostic"
              ><span>{{ t("audioStatus") }}</span
              ><strong>{{
                audioContextState === "running"
                  ? microphoneError
                    ? t("audioUnavailable")
                    : t("audioReady")
                  : audioContextState === "suspended"
                    ? t("audioSuspended")
                    : t("audioUnknown")
              }}</strong></div
            ><p
              v-if="microphoneError"
              class="settings-error"
              >{{ localizedMicrophoneError(microphoneErrorCode, microphoneError) }}</p
            ><div class="mode-note"
              ><Icon
                name="shield"
                :size="16"
              /><span>{{ t("audioPrivacy") }}</span></div
            ></section
          > </div
        ><footer class="settings-footer"
          ><button
            class="primary-button save-button"
            @click="emit('close')"
            >{{ t("done") }}</button
          ></footer
        ></div
      >
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from "vue";
import Icon from "../Icon.vue";
import { useDialogFocus } from "../../composables/useDialogFocus.js";
import type { useVoiceWebSocket } from "../../composables/useVoiceWebSocket.js";
import type { useWebClientAudioControls } from "../../composables/useWebClientAudioControls.js";
import type { SinkAudioElement } from "../../voice/webrtc-playback.js";

type AudioSettingsState = Pick<ReturnType<typeof useVoiceWebSocket>,
  | "inputDevices"
  | "outputDevices"
  | "selectedInputDeviceId"
  | "selectedOutputDeviceId"
  | "outputDeviceSupported"
  | "audioPermission"
  | "audioContextState"
  | "microphoneMuted"
  | "noiseSuppressionEnabled"
  | "inputVolume"
  | "outputVolume"
  | "voxThreshold"
  | "notificationVolume"
  | "micLevel"
  | "microphoneTestActive"
  | "testAudioUrl"
>;
type AudioSettingsControls = Pick<ReturnType<typeof useWebClientAudioControls>,
  | "settingsError"
  | "onInputVolume"
  | "onNoiseSuppressionToggle"
  | "onOutputVolume"
  | "onVoxThreshold"
  | "onNotificationVolume"
  | "onInputDeviceChange"
  | "onOutputDeviceChange"
  | "toggleMicTest"
  | "micMeterBars"
  | "meterBarHeight"
  | "toggleMicrophone"
>;
const props = defineProps<{
  model: AudioSettingsState;
  controls: AudioSettingsControls;
  microphoneError: string;
  microphoneErrorCode: string;
  isMobileViewport: boolean;
  desktopNotificationsEnabled: boolean;
  onDesktopNotificationsToggle: (event: Event) => void;
  t: (key: string, variables?: Record<string, string | number>) => string;
  localizedMessage: (message: string) => string;
  localizedMicrophoneError: (code: string, message: string) => string;
  rangeStyle: (value: number, max: number) => CSSProperties;
}>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLElement | null>(null);
const { onDialogKeydown } = useDialogFocus(dialog, () => emit("close"));

// The page owns the stable voice refs and audio controller; this dialog only presents them.
const {
  inputDevices,
  outputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputDeviceSupported,
  audioPermission,
  audioContextState,
  microphoneMuted,
  noiseSuppressionEnabled,
  inputVolume,
  outputVolume,
  voxThreshold,
  notificationVolume,
  micLevel,
  microphoneTestActive,
  testAudioUrl,
} = props.model;
const {
  settingsError: audioSettingsError,
  onInputVolume,
  onNoiseSuppressionToggle,
  onOutputVolume,
  onVoxThreshold,
  onNotificationVolume,
  onInputDeviceChange,
  onOutputDeviceChange,
  toggleMicTest,
  micMeterBars,
  meterBarHeight,
  toggleMicrophone,
} = props.controls;

// A persisted deviceId may have left the enumerated list (unplugged device,
// rotated Safari ids); falling back to the default option beats a blank select.
const listedValue = (deviceId: string, devices: { deviceId: string }[]): string =>
  deviceId && devices.some((device) => device.deviceId === deviceId) ? deviceId : "";
const inputSelectValue = computed(() => listedValue(selectedInputDeviceId.value, inputDevices));
const outputSelectValue = computed(() => listedValue(selectedOutputDeviceId.value, outputDevices));

// The test-audio element is its own playback endpoint: keep it on the chosen
// output device too, or speaker selection would miss half of what users hear.
const testAudioElement = ref<SinkAudioElement | null>(null);
watch([testAudioUrl, testAudioElement, outputSelectValue], async ([url, element]) => {
  if (!url || !element?.setSinkId) return;
  const deviceId = outputSelectValue.value;
  try {
    await element.setSinkId(deviceId);
  } catch { /* fall back to the default output for the preview clip */ }
}, { flush: "post" });

// Media element failures (CSP blocks, decode errors) are otherwise silent:
// surface the MediaError code so the user knows the clip did not play.
function onTestAudioError(): void {
  const mediaError = testAudioElement.value?.error;
  audioSettingsError.value = props.t("testPlaybackFailed", { code: mediaError?.code ?? 0 });
}
</script>
