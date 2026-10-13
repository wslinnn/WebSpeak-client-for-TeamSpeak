<template>
  <TransitionGroup
    v-if="currentMembers.length"
    name="voice-member"
    tag="div"
    class="voice-grid"
    data-ws-part="voice.members"
    appear
  >
    <article
      v-for="member in currentMembers"
      :key="member.id"
      :class="['voice-card', { speaking: isSpeaking(member), self: member.isSelf }]"
      data-ws-part="voice.member"
      :data-ws-state="member.isSelf ? 'self' : isSpeaking(member) ? 'speaking' : 'connected'"
      :data-ws-member-id="member.id"
      :data-ws-speaking="isSpeaking(member) ? 'true' : 'false'"
      :data-ws-self="member.isSelf ? 'true' : 'false'"
    >
      <button
        v-if="isMobileViewport && !member.isSelf"
        type="button"
        class="voice-member-action"
        :aria-label="t('moreMemberOptions')"
        @click.stop="emit('memberActions', member)"
        ><Icon
          name="more"
          :size="17"
      /></button>
      <span
        class="voice-mic-status"
        data-ws-part="voice.member.mic-status"
        :data-ws-state="member.inputMuted ? 'muted' : 'idle'"
        :title="member.inputMuted ? t('inputMuted') : t('microphone')"
        ><Icon
          :name="member.inputMuted ? 'mic-off' : 'mic'"
          :size="13"
      /></span>
      <div
        :class="[
          'voice-avatar-wrap',
          { 'screen-share-avatar-wrap': screenShareStreamForMember(member) },
        ]"
        data-ws-part="voice.member.avatar-wrap"
      >
        <div
          :class="['voice-avatar', { speaking: isSpeaking(member) }]"
          data-ws-part="voice.member.avatar"
          :style="avatarStyle(member.nickname, member.isSelf, member.avatar)"
          >{{ member.avatar ? "" : avatarInitial(member.nickname) }}</div
        >
        <span
          v-if="screenShareStreamForMember(member)"
          class="screen-share-live-indicator"
          data-ws-part="voice.member.live-indicator"
          ><span
            class="screen-share-wave"
            aria-hidden="true"
            ><i
              v-for="bar in screenShareIndicatorBars"
              :key="bar"
              :style="{ height: `${bar}px` }"
            ></i></span
          ><span>{{ t("sharingScreen") }}</span></span
        >
      </div>
      <strong data-ws-part="voice.member.name">{{
        member.isSelf ? t("you") : member.nickname
      }}</strong
      ><span data-ws-part="voice.member.status">{{
        isSpeaking(member) ? t("speaking") : member.isSelf ? t("connectedYou") : t("connected")
      }}</span>
      <div
        v-if="!member.isSelf && screenShareStreamForMember(member)"
        class="screen-share-card-actions"
        data-ws-part="voice.member.share-actions"
      >
        <button
          type="button"
          :class="[
            'screen-share-card-button',
            {
              viewing: screenShareViewingStreamId === screenShareStreamForMember(member)?.streamId,
            },
          ]"
          :data-ws-state="
            screenShareViewingStreamId === screenShareStreamForMember(member)?.streamId
              ? 'viewing'
              : 'idle'
          "
          @click.stop="toggleScreenShareForMember(member)"
          ><Icon
            name="monitor"
            :size="13"
          />
          {{
            screenShareViewingStreamId === screenShareStreamForMember(member)?.streamId
              ? t("watching")
              : t("watchScreenShare")
          }}</button
        >
      </div>
    </article>
  </TransitionGroup>
  <div
    v-else
    class="voice-empty"
    data-ws-part="voice.members.empty"
    ><span class="empty-icon"
      ><Icon
        name="users"
        :size="20" /></span
    ><strong>{{ t("waitingForMembers") }}</strong
    ><span>{{ t("prepareMicrophone") }}</span></div
  >
</template>

<script setup lang="ts">
import Icon from "../Icon.vue";
import type { ChannelMember, useVoiceWebSocket } from "../../composables/useVoiceWebSocket.js";
import type { useWebClientScreenShare } from "../../composables/useWebClientScreenShare.js";
const props = defineProps<{
  currentMembers: ChannelMember[]; isMobileViewport: boolean;
  sharing: Pick<ReturnType<typeof useVoiceWebSocket>, "screenShareViewingStreamId">;
  controls: Pick<ReturnType<typeof useWebClientScreenShare>, "streamForMember" | "toggleForMember">;
  isSpeaking: (member: ChannelMember) => boolean;
  avatarStyle: (name: string, isSelf?: boolean, avatar?: string) => Record<string, string>;
  avatarInitial: (name: string) => string; t: (key: string) => string;
}>();
const { screenShareViewingStreamId } = props.sharing;
const { streamForMember: screenShareStreamForMember, toggleForMember: toggleScreenShareForMember } = props.controls;
const emit = defineEmits<{ memberActions: [member: ChannelMember] }>();
const screenShareIndicatorBars = [5, 10, 7, 12, 8, 10];
</script>
