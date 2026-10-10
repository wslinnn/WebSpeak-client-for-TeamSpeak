<template>
  <div
    :class="[
      'web-client',
      'ws-skin-root',
      `language-${language}`,
      { 'skin-initializing': !skinReady, 'keyboard-open': mobileViewport.keyboardOpen },
    ]"
    :lang="language"
    :style="{ '--ws-viewport-height': `${mobileViewport.height}px`, '--ws-viewport-top': `${mobileViewport.top}px` }"
    data-ws-part="app"
    :data-ws-page="voiceShellVisible ? 'voice' : 'home'"
  >
    <!-- Connection / welcome screen -->
    <section
      v-if="!voiceShellVisible"
      class="join-page"
      data-ws-part="home"
    >
      <WebClientHeader
        v-model:language="language"
        v-model:skin-id="activeSkinId"
        :brand-name="skinHomeCopy.brandName || siteName"
        :app-version="appVersion"
        :skin-options="skinOptions"
        :t="t"
        @skin-change="onSkinChange"
        @language-change="persistLanguage"
      />

      <MobileGate
        v-if="mobileGateActive"
        :t="t"
        @continue="continueOnMobile"
      />

      <main
        v-else
        class="join-content"
        data-ws-part="home.content"
      >
        <div
          class="join-copy"
          data-ws-part="home.hero"
        >
          <div
            class="eyebrow"
            data-ws-part="home.hero.eyebrow"
            ><span class="eyebrow-dot"></span> {{ skinHomeCopy.eyebrow || t("privateAudio") }}</div
          >
          <h1 data-ws-part="home.hero.title"
            >{{ skinHomeCopy.title || t("joinLine1") }}<br /><em>{{
              skinHomeCopy.titleAccent || t("joinLine2")
            }}</em></h1
          >
          <p
            class="join-description"
            data-ws-part="home.hero.description"
            >{{ skinHomeCopy.description || localizedWelcomeText }}</p
          >
          <div
            class="promise-list"
            data-ws-part="home.features"
          >
            <div
              v-for="feature in skinHomeFeatures"
              :key="feature.id"
              class="promise-item"
              data-ws-part="home.feature"
              :data-ws-feature-id="feature.id"
              ><span :class="['promise-icon', feature.tone]"
                ><Icon
                  :name="feature.icon"
                  :size="16" /></span
              ><span
                ><b>{{ feature.title }}</b
                ><small>{{ feature.description }}</small></span
              ></div
            >
          </div>
        </div>

        <div
          class="join-card"
          data-ws-part="home.join-card"
        >
          <div
            class="join-card-effects"
            aria-hidden="true"
          >
            <span
              class="join-card-waveform"
              data-ws-part="home.join-card.waveform"
              ><i
                v-for="bar in 9"
                :key="bar"
              ></i
            ></span>
            <span
              class="join-card-sonar"
              data-ws-part="home.join-card.sonar"
              ><i
                v-for="ring in 3"
                :key="ring"
              ></i
            ></span>
          </div>
          <h2 data-ws-part="home.join-title">{{
            skinHomeCopy.welcomeTitle || t("welcomeBack")
          }}</h2>
          <p
            class="card-lead"
            data-ws-part="home.join-description"
            >{{ skinHomeCopy.welcomeDescription || t("joinLead") }}</p
          >

          <div
            v-if="voiceState.error"
            class="notice error-notice"
            data-ws-part="home.notice"
            data-ws-state="error"
            ><span class="notice-symbol">!</span
            ><span class="notice-content"
              ><span v-if="retryWaiting">{{ t("retryLater", { seconds: retrySecondsLeft }) }}</span
              ><span v-else>{{ localizedMessage(voiceState.error) }}</span
              ><code v-if="voiceState.errorCode"
                >{{ t("errorCode") }}: {{ visibleErrorCode(voiceState.errorCode) }}</code
              ></span
            ></div
          >
          <div
            v-if="browserError"
            class="notice warning-notice"
            data-ws-part="home.notice"
            data-ws-state="warning"
            ><span class="notice-symbol">i</span
            ><span>{{ localizedMessage(browserError) }}</span></div
          >
          <div
            v-if="browserWarning"
            class="notice warning-notice"
            data-ws-part="home.notice"
            data-ws-state="warning"
            ><span class="notice-symbol">i</span
            ><span>{{ localizedMessage(browserWarning) }}</span></div
          >
          <div
            v-if="!serverConfigLoading && !initialized && !publicConfigFailed"
            class="notice warning-notice"
            data-ws-part="home.notice"
            data-ws-state="unconfigured"
            ><span class="notice-symbol">i</span
            ><span
              >{{ t("notConfigured") }} <a href="/admin">{{ t("configureNow") }}</a></span
            ></div
          >
          <div
            v-if="publicConfigFailed && !serverConfigLoading"
            class="notice warning-notice"
            data-ws-part="home.notice"
            data-ws-state="warning"
            ><span class="notice-symbol">!</span
            ><span
              >{{ t("configLoadFailed") }}
              <button type="button" class="text-button" @click="reloadPublicConfig">{{ t("retryAction") }}</button></span
            ></div
          >
          <div
            v-if="!localPersistenceAvailable"
            class="notice warning-notice"
            data-ws-part="home.notice"
            data-ws-state="storage-warning"
            ><span class="notice-symbol">i</span
            ><span>{{ t("localPersistenceUnavailable") }}</span></div
          >

          <JoinForm
            v-if="initialized"
            :autofocus-nickname="!isMobileViewport"
            v-model:server-host="serverHost"
            v-model:server-port="serverPort"
            v-model:server-password="serverPassword"
            v-model:nickname="nickname"
            v-model:channel="channel"
            v-model:remember-identity="rememberIdentity"
            v-model:remember-server-password="rememberServerPassword"
            :access-mode="accessMode"
            :open-target-prefill-blocked="openTargetPrefillBlocked"
            :quick-servers="quickServers"
            :is-favorite="isFavorite"
            :identity-export-busy="identityExportBusy"
            :has-identity="Boolean(identityMaterial)"
            :connecting="voiceState.connecting"
            :join-disabled="joinDisabled"
            :join-retry-seconds="retrySecondsShown"
            :t="t"
            @connect="doConnect"
            @disconnect="doDisconnect"
            @open-device-settings="settingsOpen = true"
            @select-server="selectLocalServer"
            @connect-server="connectFromServerTab"
            @toggle-favorite="toggleFavorite"
            @toggle-quick-favorite="toggleQuickServerFavorite"
            @open-favorite-dialog="openFavoriteServerDialog()"
            @edit-favorite="editFavoriteServer"
            @import-identity="openIdentityImport"
            @export-identity="exportIdentity"
          />
          <div
            class="join-meta"
            data-ws-part="home.security-note"
            ><Icon
              name="lock"
              :size="14"
            />
            {{ t("connectionAuthorized") }}</div
          >
        </div>
      </main>

      <IdentityImportDialog
        v-if="identityImportOpen"
        v-model="identityImportText"
        :busy="identityImportBusy"
        :reading="identityFileReading"
        :error="identityImportError"
        :t="t"
        @close="closeIdentityImport"
        @submit="importIdentity"
        @file="readIdentityFile"
      />

      <footer
        class="join-footer"
        data-ws-part="home.footer"
      >
        <span>{{ skinHomeCopy.brandName || siteName }}</span><span class="footer-separator">·</span
        ><span>{{ t("teamSpeakClient") }}</span
        ><span class="footer-spacer"></span
        ><button
          type="button"
          class="clear-local-button"
          @click="clearBrowserData"
          >{{ t("clearLocalData") }}</button
        >
      </footer>

    </section>

    <!-- Connected application shell -->
    <div
      v-else
      :class="['app-shell', `mobile-view-${mobileSection}`]"
      :data-performance-open="performancePanelOpen ? 'true' : 'false'"
      data-ws-part="voice.shell"
      @click="memberMenu = null"
    >
      <!-- Shell-level status banners sit outside .workspace so a mobile tab
           switch (which hides the workspace) can never hide them. -->
      <div class="voice-banners" data-ws-part="voice.banners">
        <div
          v-if="voiceState.reconnecting || voiceState.reconnectFailed"
          :class="['reconnect-banner', { failed: voiceState.reconnectFailed }]"
          data-ws-part="voice.connection-status"
          :role="voiceState.reconnectFailed ? 'alert' : 'status'"
        >
          <div class="reconnect-copy"
            ><strong>{{
              voiceState.reconnectFailed ? t("reconnectFailed") : t("connectionInterrupted")
            }}</strong
            ><span v-if="voiceState.reconnecting">{{
              t("reconnectingAttempt", { attempt: voiceState.reconnectAttempt })
            }}</span
            ><span v-else>{{ localizedMessage(voiceState.error) }}</span></div
          >
          <div class="reconnect-actions"
            ><button
              v-if="voiceState.reconnectFailed"
              type="button"
              class="secondary-button"
              @click="reconnectMobile"
              >{{ t("reconnectNow") }}</button
            ><button
              type="button"
              class="text-button"
              @click="leaveVoiceWorkspace"
              >{{ t("back") }}</button
            ></div
          >
        </div>
        <div
          v-if="voiceState.audioNotice"
          class="reconnect-banner degraded"
          data-ws-part="voice.audio-status"
          role="status"
          ><div class="reconnect-copy"
            ><strong>{{ t("audioStatus") }}</strong
            ><span>{{
              localizedAudioNotice(voiceState.audioNoticeCode, voiceState.audioNotice)
            }}</span></div
          ></div
        >
        <div
          v-if="voiceState.microphoneError"
          class="reconnect-banner degraded"
          data-ws-part="voice.microphone-status"
          role="status"
          ><div class="reconnect-copy"
            ><strong>{{ t("microphone") }}</strong
            ><span>{{
              localizedMicrophoneError(voiceState.microphoneErrorCode, voiceState.microphoneError)
            }}</span></div
          ><button
            type="button"
            class="text-button"
            @click="clearMicrophoneError"
            >{{ t("close") }}</button
          ></div
        >
        <div
          v-for="poke in visiblePokes"
          :key="poke.id"
          class="poke-banner"
          data-ws-part="voice.poke"
          role="status"
          ><Icon
            name="bell"
            :size="17" /><span
            ><strong>{{ poke.invokerName }}</strong> {{ t("pokedYou")
            }}<small v-if="poke.message">{{ t("pokeMessageSuffix", { message: poke.message }) }}</small></span
          ><button
            type="button"
            @click="dismissPoke(poke.id)"
            ><Icon
              name="close"
              :size="15" /></button
        ></div>
      </div>
      <main
        class="workspace"
        data-ws-part="voice.workspace"
      >
        <div
          v-if="accessMode === 'open' && quickServers.length"
          class="favorite-server-strip"
          data-ws-part="voice.favorite-server-strip"
          role="toolbar"
          :aria-label="t('favoriteServers')"
        >
          <button
            v-for="server in quickServers"
            :key="server.id"
            type="button"
            class="favorite-server-chip"
            data-ws-part="voice.favorite-server-chip"
            :class="{ active: server.address === currentTarget }"
            :aria-pressed="server.address === currentTarget"
            :disabled="Boolean(favoriteSwitchPending) || voiceState.connecting"
            :title="server.label"
            :aria-label="t('switchToServer', { name: server.label })"
            @click="switchToQuickServer(server)"
          ><span
              class="favorite-server-chip-initial"
              aria-hidden="true"
            >{{ avatarInitial(server.label) }}</span><span
              class="favorite-server-chip-label"
            >{{ server.label }}</span><Icon
              v-if="server.isFavorite"
              class="favorite-server-chip-star"
              name="star"
              :size="11"
            /></button>
          <button
            type="button"
            class="favorite-server-add"
            data-ws-part="voice.favorite-server-add"
            :aria-label="t('addFavoriteServer')"
            :title="t('addFavoriteServer')"
            @click="openFavoriteServerDialog()"
          ><Icon
              name="plus"
              :size="14"
          /></button>
        </div>
        <div
          v-if="favoriteSwitchPending || favoriteSwitchFailed"
          class="favorite-switch-banner"
          data-ws-part="voice.favorite-switch-banner"
          role="status"
          aria-live="polite"
        >
          <div
            class="reconnect-copy"
          ><strong>{{ favoriteSwitchFailed
            ? t("switchToServerFailed", { name: favoriteSwitchFailed })
            : t("switchingToServer", { name: favoriteSwitchPending ?? "" }) }}</strong
            ><span v-if="favoriteSwitchFailed && favoriteSwitchError">{{ favoriteSwitchError }}</span></div>
          <div
            class="reconnect-actions"
          ><button
            v-if="favoriteSwitchFailed"
            type="button"
            class="secondary-button"
            @click="leaveVoiceWorkspace"
          >{{ t("back") }}</button></div>
        </div>
        <header
          class="workspace-header"
          data-ws-part="voice.header"
        >
          <div
            class="breadcrumbs"
            data-ws-part="voice.breadcrumbs"
            ><span class="mobile-brand">TeamSpeak <em>Web</em></span
            ><span class="crumb-muted">{{ t("serverBreadcrumb") }}</span
            ><Icon
              name="chevron-right"
              :size="14"
            /><strong>{{ currentChannelName }}</strong></div
          >
          <div
            class="workspace-actions"
            data-ws-part="voice.header-actions"
          >
            <button
              v-if="accessMode === 'open'"
              type="button"
              class="header-action favorite-current-toggle"
              data-ws-part="voice.favorite-current-toggle"
              :aria-pressed="isFavorite"
              :title="isFavorite ? t('removeFavorite') : t('saveFavorite')"
              :aria-label="isFavorite ? t('removeFavorite') : t('saveFavorite')"
              @click="toggleFavorite"
            ><Icon
                name="star"
                :size="17"
            /></button>
            <VoicePerformancePanel
              :model="performance"
              :screen-share-web-rtc-stats="screenShareWebRtcStats"
              :t="t"
            />
            <button
              v-if="isMobileViewport"
              class="header-action microphone-header-toggle"
              :class="{ muted: microphoneMuted }"
              :title="microphoneMuted ? t('unmuteMic') : t('muteMic')"
              :aria-label="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')"
              :aria-pressed="!microphoneMuted"
              @click="toggleMicrophone"
              ><Icon
                :name="microphoneMuted ? 'mic-off' : 'mic'"
                :size="18"
            /></button>
            <button
              v-if="isMobileViewport"
              class="header-action"
              :title="t('audioSettings')"
              :aria-label="t('audioSettings')"
              @click="settingsOpen = true"
              ><Icon
                name="settings"
                :size="18"
            /></button>
            <SkinSwitcher
              v-model="activeSkinId"
              class="workspace-skin-switcher"
              :menu-label="t('skinSelector')"
              :options="skinOptions"
              @change="onSkinChange"
            />
            <LanguageSwitcher
              v-model="language"
              class="workspace-language"
              :menu-label="t('languageMenu')"
              @change="persistLanguage"
            />
            <button
              class="disconnect-button"
              :aria-label="t('exit')"
              @click="leaveVoiceWorkspace"
              ><Icon
                name="door"
                :size="17"
              /><span>{{ t("exit") }}</span></button
            >
          </div>
        </header>

        <ScreenShareSettingsDialog
          v-if="screenShareSettingsOpen"
          :model="screenShareControls"
          :t="t"
          @close="screenShareSettingsOpen = false"
        />

        <div
          class="workspace-scroll"
          data-ws-part="voice.scroll"
        >
          <div
            class="workspace-content"
            data-ws-part="voice.content"
          >
            <section
              :class="['voice-section', { 'mobile-section-hidden': mobileSection !== 'voice' }]"
              data-ws-part="voice.activity"
            >
              <div
                class="voice-activity-artwork"
                data-ws-part="voice.activity.artwork"
                aria-hidden="true"
              ></div>
              <div
                class="section-heading"
                data-ws-part="voice.activity-heading"
                ><div
                  ><span class="section-kicker">{{ t("voiceActivity") }}</span
                  ><h2>{{ t("speakingNow") }}</h2></div
                ><span class="section-counter">{{
                  t("onlineShort", { count: currentMembers.length })
                }}</span></div
              >
              <div
                v-if="screenShareError"
                class="screen-share-inline-error"
                data-ws-part="voice.screen-share-error"
                role="alert"
                ><Icon
                  name="info"
                  :size="15"
                /> <span>{{ screenShareErrorText }}</span></div
              >
              <ScreenSharePlayer
                v-if="screenShareViewing"
                :model="screenShareControls"
                :screen-share-remote-stream="screenShareRemoteStream"
                :screen-share-remote-volume="screenShareRemoteVolume"
                :screen-share-error="screenShareError"
                :leave-screen-share="leaveScreenShare"
                :avatar-initial="avatarInitial"
                :t="t"
              />
              <VoiceMemberCards
                :current-members="currentMembers"
                :is-mobile-viewport="isMobileViewport"
                :sharing="memberSharingState"
                :controls="screenShareControls"
                :is-speaking="isSpeaking"
                :avatar-style="avatarStyle"
                :avatar-initial="avatarInitial"
                :t="t"
                @member-actions="openMemberActions"
                @stop-share="stopScreenShare"
              />
              <WhisperControls
                v-if="whisperTargetIds.size"
                :targets="whisperTargets"
                :active="whisperActive"
                :enabled="!isMobileViewport || mobileSection === 'voice'"
                :controls="audioControls"
                :t="t"
                @clear="clearWhisperTargets"
              />
              <div class="mobile-voice-controls">
                <button
                  type="button"
                  class="mobile-voice-toggle"
                  :class="{ muted: microphoneMuted }"
                  :aria-label="t('microphone')"
                  :title="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')"
                  :aria-pressed="!microphoneMuted"
                  @click="toggleMicrophone"
                  ><Icon
                    :name="microphoneMuted ? 'mic-off' : 'mic'"
                    :size="18"
                  /><span>{{ t("microphone") }}</span></button
                >
                <button
                  type="button"
                  class="mobile-voice-toggle"
                  :class="{ muted: outputMuted }"
                  :aria-label="t('speaker')"
                  :title="outputMuted ? t('outputMuted') : t('speaker')"
                  :aria-pressed="!outputMuted"
                  @click="toggleOutputMute"
                  ><Icon :name="outputMuted ? 'volume-off' : 'volume'" :size="18" /><span>{{ t("speaker") }}</span></button
                >
                <button type="button" class="mobile-voice-leave" :aria-label="t('exit')" :title="t('exit')" @click="leaveVoiceWorkspace"><Icon name="door" :size="17" /></button
                >
              </div>
            </section>

            <!-- Mobile chat tab hides the voice cards entirely; this strip is
                 the only place telling the user who is talking right now. -->
            <div
              v-if="isMobileViewport && mobileSection === 'chat' && speakingNowNames.length"
              class="whisper-strip"
              data-ws-part="voice.speaking-strip"
              role="status"
            >
              <div class="whisper-strip-copy"
                ><strong
                  ><Icon
                    name="volume"
                    :size="15"
                  />
                  {{ t("speakingNow") }}</strong
                ><span>{{ speakingNowNames.join("、") }}</span></div
              >
            </div>

            <ChatPanel
              :model="chat"
              :t="t"
              :current-channel-name="currentChannelName"
              :mobile-hidden="mobileSection !== 'chat'"
              :server-events="serverEvents"
              :avatar-style="avatarStyle"
              :avatar-initial="avatarInitial"
              :message-avatar="messageAvatar"
              :format-time="formatTime"
            />
          </div>
        </div>
      </main>

      <ChannelMemberPanel
        v-model:query="memberQuery"
        :model="memberControls"
        :filtered-member-channels="filteredMemberChannels"
        :current-channel-id="currentChannel?.id"
        :mobile-visible="mobileSection === 'channels'"
        :is-mobile-viewport="isMobileViewport"
        :volumes="volumes"
        :folded-channels="foldedChannels"
        :avatar-style="avatarStyle"
        :avatar-initial="avatarInitial"
        :range-style="rangeStyle"
        :t="t"
        @select-channel="selectChannel"
        @toggle-fold="toggleChannelFold"
        @volume-input="onVolInput"
      >
        <div v-if="isMobileViewport" class="mobile-member-controls" role="toolbar" :aria-label="t('desktopAudioControls')">
          <button type="button" class="mobile-voice-toggle" :class="{ muted: microphoneMuted }" :aria-label="t('microphone')" :title="microphoneMuted ? t('microphoneMuted') : t('microphoneActive')" :aria-pressed="!microphoneMuted" @click="toggleMicrophone"><Icon :name="microphoneMuted ? 'mic-off' : 'mic'" :size="20" /><span>{{ t('microphone') }}</span></button>
          <button type="button" class="mobile-voice-toggle" :class="{ muted: outputMuted }" :aria-label="t('speaker')" :title="outputMuted ? t('outputMuted') : t('speaker')" :aria-pressed="!outputMuted" @click="toggleOutputMute"><Icon :name="outputMuted ? 'volume-off' : 'volume'" :size="20" /><span>{{ t('speaker') }}</span></button>
          <button type="button" class="mobile-member-leave" :aria-label="t('exit')" :title="t('exit')" @click="leaveVoiceWorkspace"><Icon name="door" :size="18" /></button>
        </div>
        <AudioDock
          v-if="!isMobileViewport"
          :model="audioDockState"
          :controls="audioControls"
          :t="t"
          :range-style="rangeStyle"
          @settings="settingsOpen = true"
          @output-mute="toggleOutputMute"
        />
      </ChannelMemberPanel>

      <section
        v-if="mobileSection === 'more'"
        class="mobile-more-panel"
        data-ws-part="voice.mobile-more"
      >
        <span class="section-kicker">{{ t("voiceActivity") }}</span>
        <h2>{{ t("mobileMore") }}</h2>
        <p class="more-group-label">{{ t("audioGroup") }}</p>
        <button
          type="button"
          :class="{ muted: microphoneMuted }"
          @click="toggleMicrophone"
          ><Icon
            :name="microphoneMuted ? 'mic-off' : 'mic'"
            :size="18"
          />
          {{ microphoneMuted ? t("unmuteMic") : t("muteMic") }}</button
        >
        <button
          type="button"
          @click="settingsOpen = true"
          ><Icon
            name="settings"
            :size="18"
          />
          {{ t("audioSettings") }}</button
        >
        <p class="more-group-label">{{ t("appearanceGroup") }}</p>
        <SkinSwitcher
          v-model="activeSkinId"
          class="mobile-skin-switcher"
          :menu-label="t('skinSelector')"
          :options="skinOptions"
          @change="onSkinChange"
        />
        <div class="language-menu-row"
          ><Icon
            name="globe"
            :size="18" /><span>{{ t("languageMenu") }}</span
          ><LanguageSwitcher
            v-model="language"
            :menu-label="t('languageMenu')"
            @change="persistLanguage"
        /></div>
        <button
          type="button"
          class="danger"
          @click="leaveVoiceWorkspace"
          ><Icon
            name="door"
            :size="18"
          />
          {{ t("exit") }}</button
        >
      </section>

      <nav
        class="mobile-nav"
        data-ws-part="voice.mobile-nav"
        :aria-label="t('mobileNavigation')"
      >
        <button
          type="button"
          :class="{ active: mobileSection === 'channels' }"
          :aria-current="mobileSection === 'channels' ? 'page' : undefined"
          @click="selectMobileSection('channels')"
          ><Icon
            name="volume"
            :size="18"
          /><span>{{ t("mobileChannels") }}</span></button
        >
        <button
          type="button"
          :class="{ active: mobileSection === 'chat' }"
          :aria-current="mobileSection === 'chat' ? 'page' : undefined"
          @click="selectMobileSection('chat')"
          ><Icon
            name="message"
            :size="18"
          /><span>{{ t("mobileChat") }}</span></button
        >
        <button
          type="button"
          :class="{ active: mobileSection === 'voice' }"
          :aria-current="mobileSection === 'voice' ? 'page' : undefined"
          @click="selectMobileSection('voice')"
          ><Icon
            name="mic"
            :size="18"
          /><span>{{ t("mobileVoice") }}</span></button
        >
        <button
          type="button"
          :class="{ active: mobileSection === 'more' }"
          :aria-current="mobileSection === 'more' ? 'page' : undefined"
          @click="selectMobileSection('more')"
          ><Icon
            name="more"
            :size="18"
          /><span>{{ t("mobileMore") }}</span></button
        >
      </nav>
    </div>

    <MemberActionsMenu
      :model="memberControls"
      :is-mobile-viewport="isMobileViewport"
      :volumes="volumes"
      :whisper-target-ids="whisperTargetIds"
      :range-style="rangeStyle"
      :t="t"
      @private-chat="openPrivateChat"
      @volume-input="onVolInput"
    />

    <!-- Protected channel password modal -->
    <ChannelPasswordDialog
      v-if="channelPasswordDialog.open"
      v-model="channelPasswordDialog.password"
      :busy="channelPasswordDialog.submitting"
      :error="channelPasswordDialog.error"
      :t="t"
      @cancel="cancelChannelPassword"
      @submit="submitChannelPassword"
    />

    <!-- TeamSpeak server password modal -->
    <ServerPasswordDialog
      v-if="serverPasswordDialog.open"
      v-model="serverPasswordDialog.password"
      :error-code="serverPasswordDialog.errorCode"
      :t="t"
      @cancel="onServerPasswordCancel"
      @submit="submitServerPassword"
    />

    <!-- Audio settings modal -->
    <AudioSettingsDialog
      v-if="settingsOpen"
      :model="audioSettingsState"
      :controls="audioControls"
      :microphone-error="voiceState.microphoneError"
      :microphone-error-code="voiceState.microphoneErrorCode"
      :is-mobile-viewport="isMobileViewport"
      :desktop-notifications-enabled="desktopNotificationsEnabled"
      :on-desktop-notifications-toggle="onDesktopNotificationsToggle"
      :t="t"
      :localized-message="localizedMessage"
      :localized-microphone-error="localizedMicrophoneError"
      :range-style="rangeStyle"
      @close="settingsOpen = false"
    />

    <!-- Root-level overlays: both connection and voice pages trigger them, so
         they must live outside the v-if/v-else page branches. -->
    <div
      v-if="skinRecoveryNotice"
      class="skin-recovery-notice"
      data-ws-part="app.skin-recovery-notice"
      role="alert"
    >
      <span>{{ t("skinRecoveryNotice") }}</span>
      <button
        type="button"
        :aria-label="t('close')"
        @click="skinRecoveryNotice = false"
      ><Icon
          name="close"
          :size="14"
      /></button>
    </div>

    <FavoriteServerDialog
      v-if="favoriteServerDialogOpen"
      :initial="favoriteServerDialogInitial"
      :known-favorite-addresses="favoriteServers.map(favorite => favorite.address)"
      :t="t"
      @close="closeFavoriteServerDialog"
      @save="saveFavoriteServerDraft"
    />

    <div
      v-if="toast"
      :class="['toast', { warn: toastTone === 'warn' }]"
      data-ws-part="app.toast"
      role="status"
      ><Icon
        :name="toastTone === 'warn' ? 'alert' : 'check'"
        :size="16"
      />
      {{ toast }}</div
    >
  </div>
</template>

<script setup lang="ts">
import { observeMobileViewport } from "../services/mobile-viewport.js";
import { readMobileGateSignals, shouldShowMobileGate, storeMobileGateChoice } from "../services/mobile-gate.js";
import MobileGate from "../components/web-client/MobileGate.vue";
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from "vue";
import Icon from "../components/Icon.vue";
import VoiceMemberCards from "../components/web-client/VoiceMemberCards.vue";
import VoicePerformancePanel from "../components/web-client/VoicePerformancePanel.vue";
import ScreenShareSettingsDialog from "../components/web-client/ScreenShareSettingsDialog.vue";
import ScreenSharePlayer from "../components/web-client/ScreenSharePlayer.vue";
import AudioDock from "../components/web-client/AudioDock.vue";
import WhisperControls from "../components/web-client/WhisperControls.vue";
import AudioSettingsDialog from "../components/web-client/AudioSettingsDialog.vue";
import ChannelPasswordDialog from "../components/web-client/ChannelPasswordDialog.vue";
import ServerPasswordDialog from "../components/web-client/ServerPasswordDialog.vue";
import ChannelMemberPanel from "../components/web-client/ChannelMemberPanel.vue";
import MemberActionsMenu from "../components/web-client/MemberActionsMenu.vue";
import JoinForm from "../components/web-client/JoinForm.vue";
import ChatPanel from "../components/web-client/ChatPanel.vue";
import WebClientHeader from "../components/web-client/WebClientHeader.vue";
import IdentityImportDialog from "../components/web-client/IdentityImportDialog.vue";
import FavoriteServerDialog, { type FavoriteServerDraft } from "../components/web-client/FavoriteServerDialog.vue";
import type { QuickServer } from "../services/quick-servers.js";
import { usePublicSkin } from "../composables/usePublicSkin.js";
import { useWebClientIdentity } from "../composables/useWebClientIdentity.js";
import LanguageSwitcher from "../components/LanguageSwitcher.vue";
import SkinSwitcher, { type SkinOption } from "../components/SkinSwitcher.vue";
import { useWebClientChat } from "../composables/useWebClientChat.js";
import { useWebClientAudioControls } from "../composables/useWebClientAudioControls.js";
import { useWebClientChannels } from "../composables/useWebClientChannels.js";
import { useWebClientConnection } from "../composables/useWebClientConnection.js";
import { useWebClientMembers } from "../composables/useWebClientMembers.js";
import { useVoiceWebSocket, type ChatMessage } from "../composables/useVoiceWebSocket.js";
import { useWebClientScreenShare } from "../composables/useWebClientScreenShare.js";
import { useWebClientPerformance } from "../composables/useWebClientPerformance.js";
import { useWebClientI18n } from "../composables/useWebClientI18n.js";
import { useWebClientPublicConfig } from "../composables/useWebClientPublicConfig.js";
import { useWebClientServerHistory } from "../composables/useWebClientServerHistory.js";
import { useVoiceServerSwitch } from "../composables/useVoiceServerSwitch.js";
import { useChannelFold } from "../composables/useChannelFold.js";
import { getInitialLanguage, type Language } from "../i18n/web-client.js";
import { clearLocalData as clearStoredLocalData, clearNamespacedStorageEntries, isLocalPersistenceAvailable, loadLocalPreferences, loadStoredIdentity, removeStoredIdentity, saveLocalPreferences, saveStoredIdentity } from "../services/local-persistence.js";
import type { InstalledSkin, SkinHomeCopy } from "../services/skin-pack.js";
import { isPublicSkinEnabled } from "../services/skin-catalog.js";
import { BUILTIN_DARK_SKIN, BUILTIN_LIGHT_SKIN } from "../services/skin-runtime.js";
import { applyTheme, getStoredTheme, type ThemeMode } from "../services/theme.js";
import { createScreenWakeLockController, getScreenWakeLockApi, type ScreenWakeLockController, type ScreenWakeLockSnapshot } from "../services/screen-wake-lock.js";
import { desktopNotificationPermission, readDesktopNotificationSetting, requestDesktopNotificationPermission, showBackgroundTabNotification, writeDesktopNotificationSetting } from "../services/desktop-notifications.js";
import { clearVoiceSessionIntent } from "../voice/session-intent.js";
import { createMobileAwayController, type MobileAwayController } from "../services/mobile-away.js";
import { combineTeamSpeakTarget, DEFAULT_TEAM_SPEAK_PORT, splitTeamSpeakTarget } from "../services/teamspeak-target.js";

const {
  state: voiceState,
  sessionEpoch,
  members,
  channels,
  chatMessages,
  serverEvents,
  pokeNotifications,
  microphoneMuted,
  noiseSuppressionEnabled,
  inputVolume,
  outputVolume,
  outputMuted,
  notificationVolume,
  voxThreshold,
  inputDevices,
  outputDevices,
  selectedInputDeviceId,
  selectedOutputDeviceId,
  outputDeviceSupported,
  audioPermission,
  audioContextState,
  identityMaterial,
  micLevel,
  microphoneTestActive,
  testAudioUrl,
  speakingIds,
  volumes,
  whisperTargetIds,
  whisperActive,
  setVolume,
  setInputVolume,
  setNoiseSuppressionEnabled,
  setOutputVolume,
  toggleOutputMute,
  setVoxThreshold,
  setNotificationVolume,
  prepareInputDevices,
  refreshAudioDevices,
  setInputDevice,
  setOutputDevice,
  startMicrophoneTest,
  stopMicrophoneTest,
  playNotification,
  connect,
  reconnectNow,
  tryResumeVoiceSession,
  disconnect,
  switchChannel,
  moveClient,
  sendTextMessage,
  sendServerMessage,
  sendPrivateMessage,
  sendPoke,
  setAway,
  setWhisperTargets,
  setWhisperActive,
  setMicrophoneMuted,
  accompanimentActive,
  accompanimentErrorCode,
  screenShareStreams,
  screenShareActive,
  screenShareStarting,
  screenShareViewing,
  screenShareViewingStreamId,
  screenShareRemoteStream,
  screenShareError,
  screenShareErrorCode,
  screenShareRemoteVolume,
  screenShareWebRtcStats,
  startAccompaniment,
  stopAccompaniment,
  startScreenShare,
  stopScreenShare,
  joinScreenShare,
  leaveScreenShare,
  checkSupport,
  checkBrowserWarning,
  clearMicrophoneError,
  watchMicrophonePermission,
  clearError,
  measureVoiceAudioStatus,
} = useVoiceWebSocket();
const performance = useWebClientPerformance(computed(() => voiceState.connected), measureVoiceAudioStatus);
const { panelOpen: performancePanelOpen } = performance;

const query = new URLSearchParams(location.search);
const initialChannel = query.get("channel") ?? "";
const initialTarget = initialServerTarget();
const nickname = ref(localStorage.getItem("webspeak:nickname") ?? "");
const channel = ref(initialChannel);
const serverHost = ref(initialTarget.address);
const serverPort = ref(initialTarget.port);
const serverPassword = ref("");
const rememberIdentity = ref(localStorage.getItem("webspeak:remember-identity") !== "0");
const browserError = ref("");
// Degraded-but-usable environment findings (e.g. no AudioDecoder): shown as a
// warning while WebRTC voice stays available, unlike the join-blocking error.
const browserWarning = ref("");
// Phone-class visitors get the PC/Android recommendation page instead of the
// join form; the one-time "continue" choice lives in localStorage.
const mobileGateActive = ref(shouldShowMobileGate(readMobileGateSignals(window)));
function continueOnMobile(): void {
  storeMobileGateChoice("continue");
  mobileGateActive.value = false;
}
const memberQuery = ref("");
const selectedChannelId = ref("");
const settingsOpen = ref(false);
// Channel fold memory, scoped to the current server target so switching
// servers swaps the remembered collapsed set with it.
const { folded: foldedChannels, toggle: toggleChannelFold } = useChannelFold(
  () => combineTeamSpeakTarget(serverHost.value, serverPort.value),
);
// Password-retry backoff (PASSWORD_RETRY_LATER): park the join button until the
// gateway's retryAfterMs elapses, with a live seconds countdown in its place.
const retryNowTick = ref(Date.now());
let retryTicker: number | undefined;
const retryWaiting = computed(() => voiceState.retryNotUntil > retryNowTick.value);
const retrySecondsLeft = computed(() => Math.max(1, Math.ceil((voiceState.retryNotUntil - retryNowTick.value) / 1000)));
// The join button swaps its label only during an actual backoff window —
// retrySecondsLeft alone would floor at 1 even with no backoff at all.
const retrySecondsShown = computed(() => retryWaiting.value ? retrySecondsLeft.value : 0);
watch(retryWaiting, (waiting) => {
  if (!waiting || retryTicker !== undefined) return;
  retryNowTick.value = Date.now();
  retryTicker = window.setInterval(() => {
    retryNowTick.value = Date.now();
    if (!retryWaiting.value) {
      window.clearInterval(retryTicker);
      retryTicker = undefined;
    }
  }, 1000);
});
onUnmounted(() => { if (retryTicker !== undefined) window.clearInterval(retryTicker); });
const channelPasswordDialog = reactive({ open: false, channelId: "", password: "", error: "", submitting: false });
const serverPasswordDialog = reactive({ open: false, password: "", errorCode: "" });
const toast = ref("");
const toastTone = ref<"info" | "warn">("info");
const localPersistenceAvailable = isLocalPersistenceAvailable();
const identityReady = ref(!localPersistenceAvailable);
const mobileSection = ref<"channels" | "chat" | "voice" | "more">("channels");
const isMobileViewport = ref(window.matchMedia("(max-width: 740px)").matches);
let mobileAwayController: MobileAwayController | undefined;
const shouldKeepScreenAwake = computed(() => isMobileViewport.value && (voiceState.connected || voiceState.connecting || voiceState.reconnecting));
const screenWakeLockState = ref<ScreenWakeLockSnapshot>({ supported: false, enabled: false, active: false, requesting: false, unavailable: false });
let screenWakeLockController: ScreenWakeLockController | undefined;
const mobileViewport = reactive({ height: window.innerHeight, top: 0, keyboardOpen: false });
let stopViewportObservation: (() => void) | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const language = ref<Language>(getInitialLanguage());
const activeSkin = shallowRef<InstalledSkin | null>(null);
const skinMessageOverrides = computed(() => resolveSkinMessages(activeSkin.value, language.value));
const { t: translate, localizedMessage, localizedAudioNotice, localizedMicrophoneError, visibleErrorCode } = useWebClientI18n(language);
function t(key: string, variables: Record<string, string | number> = {}) {
  const template = skinMessageOverrides.value[key];
  // WebSpeak's own locale dictionaries are the complete baseline; a skin only
  // replaces non-empty strings it explicitly provides.
  if (template === undefined || !template.trim()) return translate(key, variables);
  return Object.entries(variables).reduce((value, [name, replacement]) => value.replaceAll(`{{${name}}}`, String(replacement)), template);
}
const {
  open: identityImportOpen, text: identityImportText, error: identityImportError,
  busy: identityImportBusy, reading: identityFileReading, exporting: identityExportBusy,
  show: openIdentityImport, close: closeIdentityImport, reset: resetIdentityOperations, restore: restoreIdentity,
  readFile: readIdentityFile, submit: importIdentity, exportIdentity,
} = useWebClientIdentity({ identityMaterial, rememberIdentity, nickname, t, showToast });
const {
  favoriteServers,
  quickServers,
  isFavorite,
  currentTarget,
  rememberServerPassword,
  loadSavedServers,
  recordCurrentServer,
  selectLocalServer,
  syncFavoritePassword,
  toggleFavorite,
  toggleQuickServerFavorite,
  upsertFavoriteServer,
  clearServerHistory,
} = useWebClientServerHistory({ serverHost, serverPort, serverPassword, nickname, channel, rememberIdentity, identityMaterial, t, showToast });
const favoriteServerDialogOpen = ref(false);
const favoriteServerDialogInitial = ref<Partial<FavoriteServerDraft> | null>(null);
// Without an explicit draft the "add" entries prefill from the join form, so
// the common path ("I typed the address, now save it") is add-free typing.
function openFavoriteServerDialog(initial?: Partial<FavoriteServerDraft>): void {
  favoriteServerDialogInitial.value = initial ?? {
    ...(serverHost.value ? { address: serverHost.value } : {}),
    ...(serverPort.value ? { port: serverPort.value } : {}),
    ...(nickname.value ? { nickname: nickname.value } : {}),
  };
  favoriteServerDialogOpen.value = true;
}
// Right-click / long-press on a favorite row: prefill the dialog with the
// stored entry so it can be renamed or re-pointed without connecting first.
function editFavoriteServer(server: QuickServer): void {
  const target = splitTeamSpeakTarget(server.address);
  openFavoriteServerDialog({
    label: server.label,
    address: target.address,
    port: target.port,
    nickname: server.nickname ?? "",
    channel: server.lastChannelHint?.name ?? "",
    password: server.password ?? "",
  });
}
function closeFavoriteServerDialog(): void {
  favoriteServerDialogOpen.value = false;
  favoriteServerDialogInitial.value = null;
}
function saveFavoriteServerDraft(draft: FavoriteServerDraft): void {
  void upsertFavoriteServer(draft);
}
// In-voice server switching: the voice shell stays mounted while the switch is
// in flight, so the user watches a status banner instead of a join-form flash.
const {
  pending: favoriteSwitchPending,
  failed: favoriteSwitchFailed,
  active: favoriteSwitchActive,
  begin: beginFavoriteSwitch,
  fail: failFavoriteSwitch,
  settle: settleFavoriteSwitch,
} = useVoiceServerSwitch(() => voiceState.errorCode);
const voiceShellVisible = computed(() => voiceState.connected || voiceState.reconnecting || voiceState.reconnectFailed || favoriteSwitchActive.value);
// The banner's small line explains WHY a switch failed; safety-timeout and
// cancel failures carry no gateway error and simply leave it empty.
const favoriteSwitchError = ref("");
watch(favoriteSwitchFailed, (failed) => {
  favoriteSwitchError.value = failed ? localizedMessage(voiceState.error) : "";
});
function switchToQuickServer(server: QuickServer): void {
  if (favoriteSwitchPending.value || voiceState.connecting) return;
  // Same-target row clicks are not switches; channel changes go through the
  // channel tree. A different server is an explicit departure: the internal
  // disconnect closes with code 1000, so the gateway tears the old TeamSpeak
  // session down instead of parking it in the detach pool.
  if (server.address === currentTarget.value) return;
  beginFavoriteSwitch(server.label || server.address);
  const target = splitTeamSpeakTarget(server.address);
  serverHost.value = target.address;
  serverPort.value = target.port;
  if (server.nickname) nickname.value = server.nickname;
  channel.value = server.lastChannelHint?.name ?? "";
  serverPassword.value = server.password ?? "";
  rememberServerPassword.value = Boolean(server.password);
  // doConnect silently no-ops on an invalid form (e.g. no nickname): fail the
  // banner now instead of hanging until the safety timeout.
  if (!canJoin.value) {
    failFavoriteSwitch();
    return;
  }
  doConnect();
}
function leaveVoiceWorkspace(): void {
  settleFavoriteSwitch();
  doDisconnect();
}
function onServerPasswordCancel(): void {
  // Cancelling the password prompt ends the switch attempt: resolve the
  // pending banner right away instead of waiting out the safety timer.
  failFavoriteSwitch();
  cancelServerPassword();
}
const {
  accessMode,
  initialized,
  siteName,
  appVersion,
  openTargetPrefillBlocked,
  serverConfigLoading,
  publicConfigFailed,
  localizedWelcomeText,
  loadPublicConfig,
  reloadPublicConfig,
} = useWebClientPublicConfig({ serverHost, serverPort, language, t });
const themeMode = ref<ThemeMode>(getStoredTheme());
applyTheme(themeMode.value);
const publicSkin = usePublicSkin({ activeSkin, themeMode, appVersion: () => appVersion.value });
const { activeSkinId, skinReady, installedSkins, catalogSkins, recoveryNotice: skinRecoveryNotice, select: onSkinChange, initialize: initializeSkin } = publicSkin;
const skinOptions = computed<SkinOption[]>(() => [
  ...catalogSkins.value.map((skin) => ({
    value: skin.id,
    label: skin.id === BUILTIN_LIGHT_SKIN ? t("skinDay") : skin.id === BUILTIN_DARK_SKIN ? t("skinNight") : skin.id === "community.illusia-voice" ? t("skinIllusia") : skin.name,
    icon: skin.id === BUILTIN_LIGHT_SKIN ? "sun" : skin.id === BUILTIN_DARK_SKIN ? "moon" : "compass",
  })),
  ...installedSkins.value.filter((skin) => !catalogSkins.value.some((item) => item.id === skin.id) && isPublicSkinEnabled(skin.id)).map((skin) => ({ value: skin.id, label: skin.name, icon: "compass" })),
]);
const skinHomeCopy = computed<SkinHomeCopy>(() => resolveSkinHomeCopy(activeSkin.value, language.value));
const skinHomeFeatures = computed(() => {
  const defaults = [
    { id: "quality", title: t("highQuality"), description: t("opusAudio"), icon: "waveform", tone: "" },
    { id: "realtime", title: t("realtime"), description: t("membersSync"), icon: "users", tone: "sand" },
  ];
  const features = [...defaults];
  const custom = skinHomeCopy.value.features ?? [];
  const icons = ["waveform", "shield", "users"];
  const tones = ["", "mint", "sand"];
  custom.forEach((feature, index) => {
    const base = defaults[index];
    const replacement = {
      id: base?.id ?? `custom-${index}`,
      title: feature.title.trim() || base?.title || "",
      description: feature.description.trim() || base?.description || "",
      icon: base?.icon ?? icons[index % icons.length],
      tone: base?.tone ?? tones[index % tones.length],
    };
    if (base) features[index] = replacement;
    else if (replacement.title && replacement.description) features.push(replacement);
  });
  return features;
});
const audioControls = useWebClientAudioControls({
  settingsOpen,
  microphoneMuted,
  inputVolume,
  voxThreshold,
  notificationVolume,
  micLevel,
  microphoneTestActive,
  accompanimentActive,
  accompanimentErrorCode,
  whisperTargetIds,
  prepareInputDevices,
  setInputVolume,
  setNoiseSuppressionEnabled,
  setOutputVolume,
  setVoxThreshold,
  setNotificationVolume,
  setInputDevice,
  setOutputDevice,
  setMicrophoneMuted,
  startMicrophoneTest,
  stopMicrophoneTest,
  startAccompaniment,
  stopAccompaniment,
  setWhisperActive,
  localizedMessage,
  showToast,
  t,
});
function enableScreenWakeLockForSession(): void {
  if (isMobileViewport.value) screenWakeLockController?.enable();
}
function reconnectMobile(): void {
  enableScreenWakeLockForSession();
  reconnectNow();
}
const { toggleMicrophone, stopWhisperTalk } = audioControls;
const audioDockState = { microphoneMuted, inputVolume, outputVolume, outputMuted, noiseSuppressionEnabled, accompanimentActive, micLevel };
const audioSettingsState = {
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
};


function initialServerTarget() {
  const explicit = query.get("server") ?? query.get("target");
  if (explicit?.trim()) return splitTeamSpeakTarget(explicit);
  const host = (query.get("tsHost") ?? location.hostname).trim();
  const port = (query.get("tsPort") ?? DEFAULT_TEAM_SPEAK_PORT).trim();
  const target = splitTeamSpeakTarget(host, port || DEFAULT_TEAM_SPEAK_PORT);
  if (query.has("tsPort")) target.port = port;
  return target;
}

function persistLanguage() {
  localStorage.setItem("webspeak:language", language.value);
  void saveLocalPreferences({ schemaVersion: 1, language: language.value });
}

const screenShareControls = useWebClientScreenShare({
  streams: screenShareStreams,
  viewing: screenShareViewing,
  viewingStreamId: screenShareViewingStreamId,
  remoteStream: screenShareRemoteStream,
  remoteVolume: screenShareRemoteVolume,
  error: screenShareError,
  errorCode: screenShareErrorCode,
  selectedOutputDeviceId,
  startScreenShare,
  joinScreenShare,
  leaveScreenShare,
  nickname,
  avatarStyle,
  t,
});
const { settingsOpen: screenShareSettingsOpen, errorText: screenShareErrorText } = screenShareControls;
const memberSharingState = { screenShareActive, screenShareStarting, screenShareViewingStreamId, settingsOpen: screenShareSettingsOpen };
const {
  channelTree,
  currentChannel,
  currentChannelName,
  currentMembers,
  memberChannels,
  filteredMemberChannels,
  whisperTargets,
} = useWebClientChannels({
  channels,
  members,
  clientId: computed(() => voiceState.tsClientId),
  selectedChannelId,
  channelName: channel,
  memberQuery,
  whisperTargetIds,
  t,
});
// Speakers in the current channel, in roster order — feeds the mobile chat
// tab's speaking strip.
const speakingNowNames = computed(() => currentMembers.value
  .filter(member => speakingIds.has(member.id))
  .map(member => member.nickname));
const memberControls = useWebClientMembers({
  channels: memberChannels,
  currentChannel,
  members,
  speakingIds,
  whisperTargetIds,
  moveClient,
  setWhisperTargets,
  sendPoke,
  setAway,
  onManualStatusChange: () => mobileAwayController?.preserveManualStatus(),
  stopWhisperTalk,
  localizedMessage,
  showToast,
  t,
});
const { away, memberMenu, clearWhisperTargets, isSpeaking, openMemberActions, setAutomaticAway } = memberControls;
const chat = useWebClientChat({
  messages: chatMessages,
  members,
  currentChannel,
  currentChannelName,
  selectedChannelId,
  clientId: computed(() => voiceState.tsClientId),
  connected: computed(() => voiceState.connected),
  sessionEpoch,
  serverKey: computed(() => combineTeamSpeakTarget(serverHost.value, serverPort.value)),
  isMobileViewport,
  mobileSection,
  closeMemberMenu: () => { memberMenu.value = null; },
  sendTextMessage,
  sendServerMessage,
  sendPrivateMessage,
  notifyPrivateMessage: () => playNotification("private"),
  t,
});
watch(() => mobileViewport.height, () => chat.scrollIfFollowing(), { flush: "post" });
const { tab: chatTab, openPrivateChat } = chat;
const {
  canJoin,
  doConnect,
  doDisconnect,
  submitServerPassword,
  cancelServerPassword,
  selectChannel,
  submitChannelPassword,
  cancelChannelPassword,
} = useWebClientConnection({
  initialized,
  accessMode,
  isConnecting: computed(() => voiceState.connecting),
  errorCode: computed(() => voiceState.errorCode),
  errorMessage: computed(() => localizedMessage(voiceState.error)),
  channelSwitchedChannelId: computed(() => voiceState.channelSwitchedChannelId),
  nickname,
  channelName: channel,
  serverHost,
  serverPort,
  serverPassword,
  rememberIdentity,
  identityMaterial,
  selectedChannelId,
  channels: channelTree,
  clientId: computed(() => voiceState.tsClientId),
  channelPasswordDialog,
  serverPasswordDialog,
  chatTab,
  beforeConnect: enableScreenWakeLockForSession,
  connect,
  disconnect,
  switchChannel,
  clearError,
  saveNickname: (value) => {
    localStorage.setItem("webspeak:nickname", value);
    void saveLocalPreferences({ schemaVersion: 1, lastNickname: value });
  },
  showToast,
  localizedMessage,
  t,
});
const joinDisabled = computed(() => !canJoin.value || serverConfigLoading.value || !identityReady.value || voiceState.connecting || retryWaiting.value || Boolean(browserError.value));
/** Clicking a saved server tab is an executed decision: fill the form and
 *  connect immediately. An incomplete decision (no nickname) fills and hands
 *  the user the missing field instead. */
function connectFromServerTab(entry: { address: string; nickname?: string; channel?: string; password?: string }): void {
  selectLocalServer(entry);
  if (joinDisabled.value) {
    if (!nickname.value.trim()) void nextTick(() => document.getElementById("nickname")?.focus());
    return;
  }
  doConnect();
}
// Fixed mode has no server tabs: once the admin target and the favorites are
// loaded, auto-fill the remembered password so joining stays one click.
watch([currentTarget, favoriteServers], () => {
  if (accessMode.value !== "fixed" || rememberServerPassword.value || serverPassword.value) return;
  const id = currentTarget.value.trim().toLocaleLowerCase();
  const favorite = favoriteServers.value.find((item) => item.id === id);
  if (favorite?.password) {
    serverPassword.value = favorite.password;
    rememberServerPassword.value = true;
  }
}, { immediate: true });
const visiblePokes = computed(() => pokeNotifications.slice(-3));
const pokeAutoDismissTimers = new Map<string, number>();
const desktopNotificationsEnabled = ref(readDesktopNotificationSetting());
async function onDesktopNotificationsToggle(event: Event): Promise<void> {
  const enabled = (event.target as HTMLInputElement).checked;
  desktopNotificationsEnabled.value = enabled;
  writeDesktopNotificationSetting(enabled);
  if (!enabled || desktopNotificationPermission() === "granted") return;
  // Ask from the toggle's user gesture; reverting silently keeps the stored
  // flag in sync with what the browser actually allows.
  const permission = await requestDesktopNotificationPermission();
  if (permission === "granted") {
    showToast(t("desktopNotificationsOn"));
    return;
  }
  desktopNotificationsEnabled.value = false;
  writeDesktopNotificationSetting(false);
  showToast(t("desktopNotificationsBlocked"), "warn");
}

watch(() => pokeNotifications.length, (length, previousLength) => {
  const latest = pokeNotifications[length - 1];
  if (!latest || length <= previousLength) return;
  const body = `${latest.invokerName} ${t("pokedYou")}${latest.message ? t("pokeMessageSuffix", { message: latest.message }) : ""}`;
  playNotification("poke");
  // Foreground users read the banner; only a hidden tab with an explicit
  // opt-in also raises a system notification. No toast — it duplicated the
  // banner one-for-one.
  showBackgroundTabNotification(desktopNotificationsEnabled.value, t("poke"), body);
  // Banners used to pile up indefinitely; each one now leaves on its own
  // unless dismissed manually first.
  if (!pokeAutoDismissTimers.has(latest.id)) {
    pokeAutoDismissTimers.set(latest.id, window.setTimeout(() => {
      pokeAutoDismissTimers.delete(latest.id);
      dismissPoke(latest.id);
    }, 9_000));
  }
});
onUnmounted(() => {
  for (const timer of pokeAutoDismissTimers.values()) window.clearTimeout(timer);
  pokeAutoDismissTimers.clear();
});
watch(rememberIdentity, (remember) => {
  localStorage.setItem("webspeak:remember-identity", remember ? "1" : "0");
  if (!remember) {
    identityMaterial.value = "";
    void removeStoredIdentity();
  }
});
watch([rememberIdentity, identityMaterial], ([remember, material]) => {
  if (remember && material) void saveStoredIdentity(material);
  if (!remember && material) identityMaterial.value = "";
});
watch(() => voiceState.connected, (connected) => {
  if (!connected) return;
  playNotification("connected");
  recordCurrentServer();
  // A pending server switch is over (succeeded or superseded): drop the
  // banner and the safety timer, including any stale failure banner.
  settleFavoriteSwitch();
  // Store the working password (including a dialog-retried one) only now —
  // a wrong password submitted earlier must not survive as "remembered".
  void syncFavoritePassword();
});
watch(() => voiceState.connected || voiceState.reconnecting || voiceState.reconnectFailed, (roomVisible) => {
  if (roomVisible) resetIdentityOperations();
}, { flush: "sync" });

watch(() => voiceState.reconnecting, (reconnecting, wasReconnecting) => {
  if (reconnecting && !wasReconnecting) {
    playNotification("disconnected");
  }
});
watch(() => voiceState.reconnectFailed, (failed, wasFailed) => {
  if (failed && !wasFailed) playNotification("reconnectFailed");
});
watch(shouldKeepScreenAwake, (keepAwake) => {
  if (!screenWakeLockController) return;
  if (keepAwake) screenWakeLockController.enable();
  else screenWakeLockController.disable();
});
watch([() => voiceState.connected, isMobileViewport], () => mobileAwayController?.sync());
watch(screenWakeLockState, (state, previous) => {
  if (!state.unavailable || previous.unavailable || !shouldKeepScreenAwake.value) return;
  showToast(t(state.supported ? "screenWakeLockUnavailable" : "screenWakeLockUnsupported"));
});

let deviceChangeHandler: (() => void) | undefined;
let viewportMediaQuery: MediaQueryList | undefined;
let viewportChangeHandler: (() => void) | undefined;

onMounted(() => {
  mobileAwayController = createMobileAwayController(document, window, {
    isMobileClient: () => isMobileViewport.value,
    isConnected: () => voiceState.connected,
    isAway: () => away.value,
    setAway: setAutomaticAway,
  });
  mobileAwayController.sync();
  screenWakeLockController = createScreenWakeLockController(getScreenWakeLockApi(), document, state => { screenWakeLockState.value = state; });
  if (shouldKeepScreenAwake.value) screenWakeLockController.enable();
  stopViewportObservation = observeMobileViewport(window, value => Object.assign(mobileViewport, value));
  // The selected skin is applied to this public root, never to the admin DOM.
  applyTheme(themeMode.value);
  browserError.value = checkSupport() ?? "";
  browserWarning.value = checkBrowserWarning() ?? "";
  // Explicit join navigation (shared server link, direct target parameters)
  // outranks a stale resume intent: skip the auto-resume and drop the
  // old intent so it cannot shadow this destination later either.
  const joinIntentParams = new URLSearchParams(location.search);
  if (["server", "tsHost", "target"].some((key) => joinIntentParams.has(key))) clearVoiceSessionIntent();
  // A reload in a tab that still holds a reconnect token rebuilds the voice
  // session instead of dropping the user back onto the join form.
  else tryResumeVoiceSession();
  void watchMicrophonePermission();
  void loadPublicConfig();
  void initializeSkin();
  void loadLocalPreferences().then((preferences) => {
    if (!localStorage.getItem("webspeak:language") && (preferences.language === "zh" || preferences.language === "en" || preferences.language === "de" || preferences.language === "ru" || preferences.language === "ja")) language.value = preferences.language;
  });
  void restoreIdentity(async () => {
    const stored = await loadStoredIdentity();
    return stored && localStorage.getItem("webspeak:remember-identity") === "1" ? stored.privateMaterial : null;
  }).finally(() => {
    identityReady.value = true;
  });
  void loadSavedServers();
  deviceChangeHandler = () => { void refreshAudioDevices().catch(() => undefined); };
  navigator.mediaDevices?.addEventListener("devicechange", deviceChangeHandler);
  viewportMediaQuery = window.matchMedia("(max-width: 740px)");
  viewportChangeHandler = () => {
    isMobileViewport.value = viewportMediaQuery?.matches ?? false;
    if (!isMobileViewport.value) memberMenu.value = null;
    else if (accompanimentActive.value) void stopAccompaniment();
  };
  viewportChangeHandler();
  viewportMediaQuery.addEventListener?.("change", viewportChangeHandler);
});
onUnmounted(() => {
  mobileAwayController?.dispose();
  screenWakeLockController?.dispose();
  stopViewportObservation?.();
  disconnect();
  if (deviceChangeHandler) navigator.mediaDevices?.removeEventListener("devicechange", deviceChangeHandler);
  if (viewportMediaQuery && viewportChangeHandler) viewportMediaQuery.removeEventListener?.("change", viewportChangeHandler);
  if (toastTimer) clearTimeout(toastTimer);
});

function selectMobileSection(section: typeof mobileSection.value): void {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  memberMenu.value = null;
  mobileSection.value = section;
}

async function clearBrowserData(): Promise<void> {
  if (!window.confirm(t("clearLocalDataConfirm"))) return;
  resetIdentityOperations();
  publicSkin.cancel();
  await clearStoredLocalData();
  // Namespace sweep, not an enumerated key list: every webspeak:* setting —
  // past and future — dies here, including the mobile-gate choice, the
  // desktop-notification opt-in and the voice-session resume token.
  clearNamespacedStorageEntries(localStorage);
  clearNamespacedStorageEntries(sessionStorage);
  await publicSkin.reset();
  identityMaterial.value = "";
  rememberIdentity.value = false;
  clearServerHistory();
  showToast(t("localDataCleared"));
}

function dismissPoke(id: string): void {
  const timer = pokeAutoDismissTimers.get(id);
  if (timer !== undefined) {
    window.clearTimeout(timer);
    pokeAutoDismissTimers.delete(id);
  }
  const index = pokeNotifications.findIndex((poke) => poke.id === id);
  if (index >= 0) pokeNotifications.splice(index, 1);
}

function showToast(message: string, tone: "info" | "warn" = "info") {
  toast.value = message;
  toastTone.value = tone;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ""; }, 2800);
}

function avatarInitial(name: string) {
  return (name.trim()[0] || "?").toUpperCase();
}

const avatarColors = ["#9edbd4", "#b9d4c5", "#e8c6a8", "#c5c7e8", "#edd2d4", "#c8d9e9", "#e4d3b8"];
function avatarStyle(name: string, isSelf = false, avatar = "") {
  const fallback = isSelf ? "linear-gradient(135deg, #006a64, #2e9f96)" : "";
  let hash = 0;
  for (let index = 0; index < name.length; index++) hash = name.charCodeAt(index) + ((hash << 5) - hash);
  return {
    background: fallback || avatarColors[Math.abs(hash) % avatarColors.length],
    ...(avatar ? { backgroundImage: `url("${avatar}")`, backgroundPosition: "center", backgroundSize: "cover" } : {}),
  };
}

function messageAvatar(message: ChatMessage): string {
  const member = members.find((candidate) =>
    (typeof message.senderId === "number" && candidate.id === message.senderId) ||
    (Boolean(message.senderUid) && candidate.uid === message.senderUid),
  );
  return member?.avatar ?? "";
}

function formatTime(timestamp: number) {
  const locale = language.value === "zh" ? "zh-CN" : language.value === "de" ? "de-DE" : language.value === "ru" ? "ru-RU" : language.value === "ja" ? "ja-JP" : "en-US";
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function rangeStyle(value: number, max: number) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return { background: `linear-gradient(to right, #006a64 0%, #006a64 ${percent}%, #e7eceb ${percent}%, #e7eceb 100%)` };
}

function onVolInput(clientId: number, event: Event) {
  setVolume(clientId, Number((event.target as HTMLInputElement).value) / 100);
}

function resolveSkinHomeCopy(skin: InstalledSkin | null, locale: Language): SkinHomeCopy {
  const content = skin?.contentData;
  if (!content) return {};
  const fullLocale = locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : locale === "de" ? "de-DE" : locale === "ru" ? "ru-RU" : "ja-JP";
  const candidates = [...new Set([content.defaultLocale, locale, fullLocale])];
  const result: SkinHomeCopy = {};
  for (const candidate of candidates) Object.assign(result, content.locales[candidate]?.home ?? {});
  return result;
}

function resolveSkinMessages(skin: InstalledSkin | null, locale: Language): Record<string, string> {
  const content = skin?.contentData;
  if (!content) return {};
  const fullLocale = locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : locale === "de" ? "de-DE" : locale === "ru" ? "ru-RU" : "ja-JP";
  const candidates = [...new Set([content.defaultLocale, locale, fullLocale])];
  const result: Record<string, string> = {};
  for (const candidate of candidates) Object.assign(result, content.locales[candidate]?.messages ?? {});
  return result;
}
</script>

<style scoped src="../styles/web-client.css"></style>

<style scoped src="../styles/web-client-mobile.css"></style>
