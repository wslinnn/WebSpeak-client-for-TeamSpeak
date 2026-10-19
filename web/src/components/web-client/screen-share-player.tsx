import { Icon } from "./icon";
import { avatarInitial, avatarStyle } from "@/web-client/avatar";
import { resolveScreenShareViewerAvatar, screenShareErrorTextOf, screenShareViewersOf, screenShareViewerCountOf } from "@/web-client/screen-share-view";
import type { ScreenShareUi } from "@/web-client/use-screen-share";
import type { ChannelMember } from "@shared/voice-models";
import type { ScreenShareViewerDescription } from "@shared/screen-share";

interface ScreenSharePlayerProps {
  ui: ScreenShareUi;
  /** 元素登记回调与 ui 分开走顶层 props：hook bundle 成员直接进 ref= 会被
   *  React Compiler 判成渲染期读 ref 并污染整个 ui（props 值本身是 hook 内
   *  [controls] 依赖的稳定 useCallback，跨渲染恒定）。 */
  onPlayerElement(element: HTMLElement | null): void;
  onVideoElement(element: HTMLVideoElement | null): void;
  /** 本机昵称：观众头像 self 高亮比对。 */
  nickname: string;
  /** 本频道成员：观众头像按 clientId 从目录解析（网关只发 id，不发图）。 */
  members: ChannelMember[];
  t(key: string, variables?: Record<string, string | number>): string;
}

/** 屏幕共享播放器（旧 ScreenSharePlayer.vue 平价）：远端视频/占位、观众条、
 *  音量与全屏控制。元素经 onPlayerElement/onVideoElement 进绑定工厂。 */
export function ScreenSharePlayer({ ui, onPlayerElement, onVideoElement, nickname, members, t }: ScreenSharePlayerProps) {
  const { state } = ui;
  const activeStream = state.streams.find((stream) => stream.streamId === state.viewingStreamId) ?? null;
  const viewers = screenShareViewersOf(activeStream);
  const viewerCount = screenShareViewerCountOf(activeStream);
  const ownerName = activeStream?.ownerNickname ?? t("screenShare");
  const errorText = screenShareErrorTextOf(state.error, state.errorCode, t);
  const viewerStyle = (viewer: ScreenShareViewerDescription) =>
    avatarStyle(viewer.nickname, viewer.nickname === nickname, resolveScreenShareViewerAvatar(viewer, members));
  return (
    <section
      ref={onPlayerElement}
      className="screen-share-player"
      data-ws-part="voice.screen-player"
      role="region"
      aria-label={t("screenShare")}
    >
      <div className="screen-share-player-stage" data-ws-part="voice.screen-player.stage">
        {state.remoteStream ? (
          <video
            ref={onVideoElement}
            className="screen-share-player-video"
            data-ws-part="voice.screen-player.video"
            autoPlay
            playsInline
            muted={state.remoteVolume === 0}
          />
        ) : (
          <div className="screen-share-player-placeholder" data-ws-part="voice.screen-player.placeholder">
            <span className="screen-share-player-placeholder-icon"><Icon name="monitor" size={28} /></span>
            <strong>{t("screenShareConnecting")}</strong>
            <span>{state.error ? errorText : t("directP2POnly")}</span>
          </div>
        )}
        <button
          type="button"
          className="screen-share-player-exit"
          data-ws-part="voice.screen-player.exit"
          aria-label={t("screenShareExit")}
          title={t("screenShareExit")}
          onClick={ui.leaveViewing}
        ><Icon name="close" size={22} /></button>
        <div className="screen-share-player-viewers" data-ws-part="voice.screen-player.viewers" aria-label={t("screenShareViewers")}>
          <span className="screen-share-player-viewer-label">
            <Icon name="users" size={14} />
            {" "}
            {viewerCount}
          </span>
          <span className="screen-share-player-viewer-avatars">
            {viewers.map((viewer) => (
              <span
                key={viewer.peerId}
                className="screen-share-player-viewer-avatar"
                data-ws-part="voice.screen-player.viewer-avatar"
                style={viewerStyle(viewer)}
                title={viewer.nickname}
              >{resolveScreenShareViewerAvatar(viewer, members) ? "" : avatarInitial(viewer.nickname)}</span>
            ))}
          </span>
        </div>
        <span className="screen-share-player-live" data-ws-part="voice.screen-player.live"><i></i>{t("watchingScreenShare")}</span>
        <span className="screen-share-player-source" data-ws-part="voice.screen-player.source">{ownerName}</span>
        <div className="screen-share-player-controls" data-ws-part="voice.screen-player.controls">
          <label data-ws-part="voice.screen-player.volume" title={t("screenShareVolume")}>
            <Icon name={state.remoteVolume === 0 ? "volume-off" : "volume"} size={18} />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={state.remoteVolume * 100}
              aria-label={t("screenShareVolume")}
              onChange={ui.onVolumeInput}
            />
          </label>
          <button
            type="button"
            data-ws-part="voice.screen-player.fullscreen"
            aria-label={ui.fullscreen ? t("screenShareExitFullscreen") : t("screenShareFullscreen")}
            title={ui.fullscreen ? t("screenShareExitFullscreen") : t("screenShareFullscreen")}
            onClick={ui.toggleFullscreen}
          ><Icon name={ui.fullscreen ? "fullscreen-exit" : "fullscreen"} size={19} /></button>
        </div>
      </div>
    </section>
  );
}
