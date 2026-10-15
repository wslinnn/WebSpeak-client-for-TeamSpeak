import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";

import {
  createScreenShareView,
  findScreenShareStreamForMember,
  readScreenSharePresets,
  type ScreenSharePresets,
} from "./screen-share-view";
import type { ScreenShareStreamDescription as ScreenShareStream } from "@shared/screen-share";
import type { ChannelMember } from "@shared/voice-models";
import type { VoiceSessionController } from "@/voice/session-controller";

/** 进房壳内的屏幕共享视图装配（旧 useWebClientScreenShare 的 React 侧）：订阅
 *  screenShare store、驱动 DOM 绑定工厂、持有预设/设置弹窗/全屏 UI 态。
 *  useWebClientScreenShare 语义 → effect 映射：video 绑定 watch → syncVideo
 *  effect（ref 回调 bump 计数重跑）、fullscreenchange 监听 → 全屏 effect、
 *  watch(viewing→false) → 退出观看即退全屏。 */
export function useScreenShareUi(voice: VoiceSessionController) {
  const screen = voice.screenShare;
  const state = useStore(screen.store);
  const selectedOutputDeviceId = useStore(voice.store, (view) => view.selectedOutputDeviceId);
  const controls = useMemo(() => createScreenShareView({ startScreenShare: screen.startScreenShare }), [screen]);
  const [presets, setPresets] = useState<ScreenSharePresets>(() => readScreenSharePresets(localStorage));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // <video> 元素被 React 重建（viewing/placeholder 切换）时要重跑绑定 effect。
  const [videoTick, setVideoTick] = useState(0);

  // React Compiler 的 refs 规则：进 ref= 的回调不得经 hook bundle 成员传递
  //（screen-share-player 里 ref={ui.*} 会把整个 ui 判成 ref 容器、渲染期读取
  // 全拦），由调用点以顶层 props 取用——值本身是 [controls] 依赖的稳定函数。
  const setVideoElement = useCallback((element: HTMLVideoElement | null) => {
    controls.setVideoElement(element);
    setVideoTick((tick) => tick + 1);
  }, [controls]);
  const setPlayerElement = useCallback((element: HTMLElement | null) => {
    controls.setPlayerElement(element);
    setFullscreen(controls.syncFullscreen());
  }, [controls]);

  useEffect(() => {
    void controls.syncVideo({ stream: state.remoteStream, volume: state.remoteVolume, sinkId: selectedOutputDeviceId });
  }, [controls, state.remoteStream, state.remoteVolume, selectedOutputDeviceId, videoTick, setVideoElement]);

  useEffect(() => {
    const sync = () => setFullscreen(controls.syncFullscreen());
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [controls]);

  useEffect(() => {
    if (!state.viewing) controls.exitPlayerFullscreen();
  }, [controls, state.viewing]);

  useEffect(() => () => controls.dispose(), [controls]);

  const startWithSettings = useCallback((next: ScreenSharePresets) => {
    setPresets(next);
    setSettingsOpen(false);
    void controls.startWithSettings(next);
  }, [controls]);

  return {
    state,
    fullscreen,
    settingsOpen,
    presets,
    onPresetsChange: setPresets,
    onSettingsOpenChange: setSettingsOpen,
    /** dock 共享按钮：以当前预设直接开播（旧 @start-share="startWithSettings"）。 */
    startSharing(): void {
      void controls.startWithSettings(presets);
    },
    stopSharing(): void {
      screen.stopScreenShare();
    },
    startWithSettings,
    setPlayerElement,
    setVideoElement,
    toggleFullscreen(): void {
      void controls.toggleFullscreen();
    },
    onVolumeInput(event: { target: { value: string } }): void {
      screen.setRemoteVolume(Math.max(0, Math.min(1, Number(event.target.value) / 100)));
    },
    joinViewing(streamId: string): void {
      screen.joinScreenShare(streamId);
    },
    leaveViewing(): void {
      screen.leaveScreenShare();
    },
    toggleForMember(member: ChannelMember): void {
      const stream = findScreenShareStreamForMember(state.streams, member);
      if (!stream) return;
      if (state.viewingStreamId === stream.streamId) screen.leaveScreenShare();
      else screen.joinScreenShare(stream.streamId);
    },
    streamForMember(member: ChannelMember): ScreenShareStream | null {
      return findScreenShareStreamForMember(state.streams, member);
    },
  };
}

export type ScreenShareUi = ReturnType<typeof useScreenShareUi>;
