import { Icon } from "./icon";
import { avatarInitial, avatarStyle } from "@/web-client/avatar";
import type { ChannelMember } from "@shared/voice-models";

interface VoiceMembersProps {
  currentMembers: ChannelMember[];
  isMobileViewport: boolean;
  isSpeaking(member: ChannelMember): boolean;
  t(key: string, variables?: Record<string, string | number>): string;
  onMemberActions(member: ChannelMember): void;
}

/** 说话成员卡网格（旧 VoiceMemberCards.vue 平价；屏幕共享角标随 P4-6 回归——
 *  当前无人共享时旧版也不渲染该元素，DOM 形状一致）。 */
export function VoiceMembers({ currentMembers, isMobileViewport, isSpeaking, t, onMemberActions }: VoiceMembersProps) {
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
            <div className="voice-avatar-wrap" data-ws-part="voice.member.avatar-wrap">
              <div
                className={speaking ? "voice-avatar speaking" : "voice-avatar"}
                data-ws-part="voice.member.avatar"
                style={avatarStyle(member.nickname, Boolean(member.isSelf), member.avatar ?? "")}
              >
                {member.avatar ? "" : avatarInitial(member.nickname)}
              </div>
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
