<template>
  <div
    class="desktop-audio-dock"
    data-ws-part="voice.audio-dock"
    role="toolbar"
    :aria-label="t('desktopAudioControls')"
  >
    <div class="desktop-audio-dock-heading">
      <i class="desktop-audio-dock-dot"></i>
      <strong>{{ channelName }}</strong>
      <slot name="status"></slot>
      <button
        type="button"
        class="desktop-audio-dock-power"
        :aria-label="t('exit')"
        :title="t('exit')"
        @click="emit('disconnect')"
        ><Icon
          name="power"
          :size="20" /></button>
    </div>
    <div class="desktop-audio-dock-share-row">
      <div
        class="desktop-audio-dock-share"
        :class="{ 'is-stop': share.screenShareActive }"
      >
        <button
          v-if="!share.screenShareActive"
          type="button"
          class="desktop-audio-dock-share-main"
          :disabled="share.screenShareStarting"
          @click="emit('startShare')"
          ><Icon
            name="monitor"
            :size="17" />{{ t("startScreenShare") }}</button>
        <button
          v-else
          type="button"
          class="desktop-audio-dock-share-main"
          @click="emit('stopShare')"
          ><Icon
            name="close"
            :size="14" />{{ t("stopScreenShare") }}</button>
        <button
          type="button"
          class="desktop-audio-dock-share-gear"
          :aria-label="t('screenShareSettings')"
          :title="t('screenShareSettings')"
          @click="emit('shareSettings')"
          ><Icon
            name="settings"
            :size="13" /></button>
      </div>
      <button
        type="button"
        class="desktop-audio-dock-accompaniment"
        :aria-pressed="accompanimentActive"
        :title="accompanimentActive ? t('stopAccompaniment') : t('startAccompaniment')"
        :aria-label="accompanimentActive ? t('stopAccompaniment') : t('startAccompaniment')"
        @click="toggleAccompaniment"
        ><Icon
          name="music"
          :size="16" /></button>
    </div>
    <div
      class="desktop-audio-dock-controls"
      data-ws-part="voice.audio-dock.controls"
    >
      <button
        type="button"
        class="desktop-audio-dock-control desktop-audio-dock-settings"
        :title="t('audioSettings')"
        :aria-label="t('audioSettings')"
        @click="emit('settings')"
        ><Icon
          name="settings"
          :size="15" /><span>{{ t("audioSettings") }}</span></button>
      <button
        type="button"
        class="desktop-audio-dock-control desktop-audio-dock-noise"
        :aria-pressed="noiseSuppressionEnabled"
        :data-off="noiseSuppressionEnabled ? undefined : 'true'"
        :title="t('noiseSuppression')"
        :aria-label="t('noiseSuppression')"
        @click="setNoiseSuppressionEnabled(!noiseSuppressionEnabled)"
        ><Icon
          name="waveform"
          :size="18" /></button>
      <div
        class="dock-hover-control"
        data-ws-part="voice.audio-dock.microphone"
      >
        <button
          type="button"
          class="desktop-audio-dock-control"
          :data-muted="microphoneMuted ? 'true' : undefined"
          :title="microphoneMuted ? t('unmuteMic') : t('muteMic')"
          :aria-label="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')"
          :aria-pressed="!microphoneMuted"
          @click="toggleMicrophone"
          ><Icon
            name="mic"
            :size="18"
        /></button>
        <div
          class="dock-hover-panel dock-microphone-panel"
          data-ws-part="voice.audio-dock.microphone-panel"
          role="dialog"
          :aria-label="t('microphone')"
        >
          <div class="dock-slider-heading"
            ><span>{{ t("inputVolume") }}</span
            ><strong>{{ Math.round(inputVolume * 100) }}%</strong></div
          >
          <input
            class="dock-slider"
            type="range"
            min="0"
            max="100"
            step="5"
            :value="inputVolume * 100"
            :style="rangeStyle(inputVolume, 1)"
            :aria-label="t('inputVolume')"
            @input="onInputVolume"
          />
          <div class="audio-level-row"
            ><span>{{ t("micLevel") }}</span
            ><strong>{{ Math.round(displayMicLevel * 100) }}%</strong></div
          >
          <div class="audio-level-track dock-level-track"
            ><i :style="{ width: `${Math.round(displayMicLevel * 100)}%` }"></i></div>
          <div class="dock-panel-divider"></div>
          <label class="dock-switch-row"
            ><span
              ><strong>{{ t("noiseSuppression") }}</strong></span
            ><input
              type="checkbox"
              :checked="noiseSuppressionEnabled"
              :aria-label="t('noiseSuppression')"
              @change="onNoiseSuppressionToggle"
          /></label>
          <label class="dock-switch-row"
            ><span
              ><strong>{{ t("echoCancellation") }}</strong></span
            ><input
              type="checkbox"
              :checked="echoCancellationEnabled"
              :aria-label="t('echoCancellation')"
              @change="onEchoCancellationToggle"
          /></label>
          <label class="dock-switch-row"
            ><span
              ><strong>{{ t("autoGainControl") }}</strong></span
            ><input
              type="checkbox"
              :checked="autoGainControlEnabled"
              :aria-label="t('autoGainControl')"
              @change="onAutoGainControlToggle"
          /></label>
        </div>
      </div>
      <div
        class="dock-hover-control"
        data-ws-part="voice.audio-dock.output"
      >
        <button
          type="button"
          class="desktop-audio-dock-control"
          :data-muted="outputMuted ? 'true' : undefined"
          :title="outputMuted ? t('unmuteOutput') : t('muteOutput')"
          :aria-label="outputMuted ? t('unmuteOutput') : t('muteOutput')"
          :aria-pressed="!outputMuted"
          @click="emit('outputMute')"
          ><Icon
            name="volume"
            :size="18"
        /></button>
        <div
          class="dock-hover-panel dock-output-panel"
          data-ws-part="voice.audio-dock.output-panel"
          role="dialog"
          :aria-label="t('overallVolume')"
        >
          <div class="dock-slider-heading"
            ><span>{{ t("overallVolume") }}</span
            ><strong>{{ Math.round(outputVolume * 100) }}%</strong></div
          >
          <input
            class="dock-slider"
            type="range"
            min="0"
            max="100"
            step="5"
            :value="outputVolume * 100"
            :style="rangeStyle(outputVolume, 1)"
            :aria-label="t('overallVolume')"
            @input="onOutputVolume"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import Icon from "../Icon.vue";
import type { useVoiceWebSocket } from "../../composables/useVoiceWebSocket.js";
import type { useWebClientAudioControls } from "../../composables/useWebClientAudioControls.js";

const props = defineProps<{
  model: Pick<ReturnType<typeof useVoiceWebSocket>, "microphoneMuted" | "inputVolume" | "outputVolume" | "outputMuted" | "noiseSuppressionEnabled" | "echoCancellationEnabled" | "autoGainControlEnabled" | "accompanimentActive" | "micLevel">;
  controls: Pick<ReturnType<typeof useWebClientAudioControls>, "toggleMicrophone" | "onInputVolume" | "onOutputVolume" | "onNoiseSuppressionToggle" | "onEchoCancellationToggle" | "onAutoGainControlToggle" | "setNoiseSuppressionEnabled" | "toggleAccompaniment">;
  share: { screenShareActive: boolean; screenShareStarting: boolean };
  t: (key: string) => string;
  rangeStyle: (value: number, max: number) => Record<string, string>;
  channelName: string;
}>();
const { microphoneMuted, inputVolume, outputVolume, outputMuted, noiseSuppressionEnabled, echoCancellationEnabled, autoGainControlEnabled, accompanimentActive, micLevel } = props.model;
const { toggleMicrophone, onInputVolume, onOutputVolume, onNoiseSuppressionToggle, onEchoCancellationToggle, onAutoGainControlToggle, setNoiseSuppressionEnabled, toggleAccompaniment } = props.controls;
const emit = defineEmits<{ settings: []; outputMute: []; disconnect: []; startShare: []; stopShare: []; shareSettings: [] }>();
// The dock is the "am I being heard" surface: while muted, pin the meter to
// zero so a moving bar can never suggest the room can hear the user. The raw
// capture level stays available in the settings dialog for diagnostics.
const displayMicLevel = computed(() => microphoneMuted.value ? 0 : micLevel.value);
</script>
