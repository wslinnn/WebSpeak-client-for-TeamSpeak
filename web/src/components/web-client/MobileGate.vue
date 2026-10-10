<template>
  <section
    class="mobile-gate"
    data-ws-part="home.mobile-gate"
  >
    <div class="mobile-gate-card">
      <span class="mobile-gate-icon"><Icon
        name="headset"
        :size="26" /></span>
      <h1>{{ t("mobileGateTitle") }}</h1>
      <p class="mobile-gate-copy">{{ t("mobileGateDescription") }}</p>
      <div class="mobile-gate-actions">
        <a
          class="mobile-gate-primary"
          href="/download"
        ><Icon
          name="download"
          :size="16"
        />{{ t("mobileGateDownload") }}</a>
        <button
          type="button"
          class="mobile-gate-continue"
          @click="emit('continue')"
        ><Icon
          name="monitor"
          :size="16"
        />{{ t("mobileGateContinue") }}</button>
      </div>
      <p class="mobile-gate-hint">{{ t("mobileGateHint") }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import Icon from "../Icon.vue";

defineProps<{
  t: (key: string, variables?: Record<string, string | number>) => string;
}>();
const emit = defineEmits<{ continue: [] }>();
</script>

<style scoped>
.mobile-gate {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: clamp(420px, 68vh, 720px);
  padding: 18px 4px;
}

.mobile-gate-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: min(430px, 100%);
  padding: 26px 22px;
  text-align: center;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 18px;
}

.mobile-gate-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-radius: 16px;
}

.mobile-gate-card h1 {
  margin: 0;
  font-size: 19px;
  letter-spacing: -.01em;
}

.mobile-gate-copy {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.65;
}

.mobile-gate-actions {
  display: grid;
  gap: 9px;
  width: 100%;
  margin-top: 4px;
}

.mobile-gate-primary,
.mobile-gate-continue {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.mobile-gate-primary {
  color: #fff;
  background: var(--accent);
  text-decoration: none;
}

.mobile-gate-continue {
  color: var(--text-primary);
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.mobile-gate-hint {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.5;
}
</style>
