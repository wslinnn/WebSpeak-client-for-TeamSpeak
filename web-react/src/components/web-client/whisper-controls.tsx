import { useEffect } from "react";
import { useStore } from "zustand";

import { Icon } from "./icon";
import type { AudioControls } from "@/web-client/audio-controls";

interface WhisperControlsProps {
  targets: ReadonlyArray<{ nickname: string }>;
  /** 语音链路的耳语发射态（voice store whisperActive）。 */
  active: boolean;
  /** 移动端页签约束：非 voice 页签不可按（旧 :enabled 平价）。 */
  enabled: boolean;
  controls: AudioControls;
  onClear(): void;
  t(key: string): string;
}

/** 耳语条（旧 WhisperControls.vue 平价）：目标名单 + 按住说话（PTT）。失焦/
 *  隐藏页签/禁用即松开，防止「离开页面还在发射」。 */
export function WhisperControls({ targets, active, enabled, controls, onClear, t }: WhisperControlsProps) {
  const ptt = useStore(controls.store).whisperPttActive;
  const engaged = ptt || active;

  useEffect(() => {
    function onBlur(): void {
      controls.stopWhisperTalk();
    }
    function onVisibilityChange(): void {
      if (document.hidden) controls.stopWhisperTalk();
    }
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controls.stopWhisperTalk();
    };
  }, [controls]);

  // 旧 watch(enabled, flush sync)：禁用即松开。
  useEffect(() => {
    if (!enabled) controls.stopWhisperTalk();
  }, [enabled, controls]);

  return (
    <div
      className="whisper-strip"
      data-ws-part="voice.whisper-strip"
    >
      <div className="whisper-strip-copy"
        ><strong
          ><Icon
            name="users"
            size={15}
          />
          {t("whisperTargets")}</strong
        ><span>{targets.map((member) => member.nickname).join("、")}</span></div
      >
      <button
        type="button"
        className="text-button"
        onClick={onClear}
      >{t("clearWhisperTargets")}</button>
      <button
        type="button"
        className="whisper-ptt-button"
        {...(engaged ? { "aria-pressed": true } : { "aria-pressed": false })}
        onPointerDown={(event) => { event.preventDefault(); if (enabled) controls.onWhisperPttDown(event.nativeEvent); }}
        onPointerUp={(event) => { event.preventDefault(); controls.onWhisperPttUp(event.nativeEvent); }}
        onPointerCancel={(event) => { event.preventDefault(); controls.onWhisperPttUp(event.nativeEvent); }}
        onLostPointerCapture={(event) => controls.onWhisperPttUp(event.nativeEvent)}
        onKeyDown={(event) => controls.onWhisperPttKeyDown(event.nativeEvent)}
        onKeyUp={(event) => controls.onWhisperPttKeyUp(event.nativeEvent)}
        onBlur={() => controls.stopWhisperTalk()}
      ><Icon
          name="mic"
          size={18}
        />
        {engaged ? t("releaseWhisper") : t("whisperHoldToTalk")}</button>
    </div>
  );
}
