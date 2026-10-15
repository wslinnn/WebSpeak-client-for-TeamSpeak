import { Icon } from "./icon";
import { avatarInitial, avatarStyle } from "@/web-client/avatar";
import { findScreenShareStreamForMember } from "@/web-client/screen-share-view";
import type { ScreenShareStreamDescription as ScreenShareStream } from "@shared/screen-share";
import type { ChannelMember } from "@shared/voice-models";

interface VoiceMembersProps {
  currentMembers: ChannelMember[];
  isMobileViewport: boolean;
  isSpeaking(member: ChannelMember): boolean;
  screenShareStreams: ScreenShareStream[];
  viewingStreamId: string;
  onToggleScreenShare(member: ChannelMember): void;
  t(key: string, variables?: Record<string, string | number>): string;
  onMemberActions(member: ChannelMember): void;
}

const SCREEN_SHARE_INDICATOR_BARS = [5, 10, 7, 12, 8, 10];

/** 说话成员卡网格（旧 VoiceMemberCards.vue 平价）：共享中成员的头像角标——他人
 *  卡上是可点击的观看/停止观看按钮，本人卡上是「直播中」静态标。 */
export function VoiceMembers({ currentMembers, isMobileViewport, isSpeaking, screenShareStreams, viewingStreamId, onToggleScreenShare, t, onMemberActions }: VoiceMembersProps) {
  if (!currentMembers.length) {
    return (
      <div className="voice-empty" data-ws-part="voice.members.empty">
        <span className="empty-icon"><Icon name="users" size={20} /></span>
        <strong>{t("waitingForMembers")}</strong>
        <span>{t("prepareMicrophone")}</span>
      </div>
    );
  }
  return (
    <div className="voice-grid" data-ws-part="voice.members">
      {currentMembers.map((member) => {
        const speaking = isSpeaking(member);
        const shareStream = findScreenShareStreamForMember(screenShareStreams, member);
        const viewingThis = shareStream !== null && viewingStreamId === shareStream.streamId;
        return (
          <article
            key={member.id}
            className={member.isSelf ? "voice-card self" : speaking ? "voice-card speaking" : "voice-card"}
            data-ws-part="voice.member"
            data-ws-state={member.isSelf ? "self" : speaking ? "speaking" : "connected"}
            data-ws-member-id={member.id}
            data-ws-speaking={speaking ? "true" : "false"}
            data-ws-self={member.isSelf ? "true" : "false"}
          >
            {isMobileViewport && !member.isSelf && (
              <button
                type="button"
                className="voice-member-action"
                aria-label={t("moreMemberOptions")}
                onClick={(event) => { event.stopPropagation(); onMemberActions(member); }}
              >
                <Icon name="more" size={17} />
              </button>
            )}
            <span
              className="voice-mic-status"
              data-ws-part="voice.member.mic-status"
              data-ws-state={member.inputMuted ? "muted" : "idle"}
              title={member.inputMuted ? t("inputMuted") : t("microphone")}
            >
              <Icon name={member.inputMuted ? "mic-off" : "mic"} size={13} />
            </span>
            <div
              className={shareStream ? "voice-avatar-wrap screen-share-avatar-wrap" : "voice-avatar-wrap"}
              data-ws-part="voice.member.avatar-wrap"
            >
              <div
                className={speaking ? "voice-avatar speaking" : "voice-avatar"}
                data-ws-part="voice.member.avatar"
                style={avatarStyle(member.nickname, Boolean(member.isSelf), member.avatar ?? "")}
              >
                {member.avatar ? "" : avatarInitial(member.nickname)}
              </div>
              {shareStream && !member.isSelf && (
                <button
                  type="button"
                  className={viewingThis ? "screen-share-live-indicator viewing" : "screen-share-live-indicator"}
                  data-ws-part="voice.member.live-indicator"
                  data-ws-state={viewingThis ? "viewing" : "live"}
                  title={viewingThis ? t("leaveScreenShare") : t("watchScreenShare")}
                  aria-pressed={viewingThis}
                  onClick={(event) => { event.stopPropagation(); onToggleScreenShare(member); }}
                >
                  <span className="screen-share-wave" aria-hidden="true">
                    {SCREEN_SHARE_INDICATOR_BARS.map((bar, index) => (
                      <i key={index} style={{ height: `${bar}px` }} />
                    ))}
                  </span>
                  <span>{viewingThis ? t("watching") : t("live")}</span>
                </button>
              )}
              {shareStream && member.isSelf && (
                <span className="screen-share-live-indicator" data-ws-part="voice.member.live-indicator" data-ws-state="live">
                  <span className="screen-share-wave" aria-hidden="true">
                    {SCREEN_SHARE_INDICATOR_BARS.map((bar, index) => (
                      <i key={index} style={{ height: `${bar}px` }} />
                    ))}
                  </span>
                  <span>{t("sharingScreen")}</span>
                </span>
              )}
            </div>
            <strong data-ws-part="voice.member.name">{member.isSelf ? t("you") : member.nickname}</strong>
            <span data-ws-part="voice.member.status">
              {speaking ? t("speaking") : member.isSelf ? t("connectedYou") : t("connected")}
            </span>
          </article>
        );
      })}
    </div>
  );
}
