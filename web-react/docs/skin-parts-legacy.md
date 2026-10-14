# 皮肤 DOM 契约 · legacy 清单（契约重置参考，不作承诺）

> 2026-10-14 静态扫描实测（镜像 `web/src/services/skin-pack.test.ts` 的扫描口径）：177 个唯一 `data-ws-part` 字面量，动态 `:data-ws-part` 绑定 0 处，admin 组件无 `ws-skin-root`/`data-ws-page=` 越界。
> 用途：DECISIONS.md #2 契约重置的参考底账——新 UI 的 part 注册表按新布局重建后另行登记；本清单只回答「旧皮肤可能命中什么」。

## 按前缀分布

| 前缀 | 数量 | 主体 |
| --- | --- | --- |
| `app.*` | 4 | 根锚点、toast、皮肤恢复/目录通知 |
| `download.*` | 6 | 下载页 |
| `favorite-server.*` | 8 | 收藏对话框 |
| `home.*` | 45 | 首页态（header/hero/join-card/表单/身份导入/收藏/手机门） |
| `language.*` | 3 | 语言切换器 |
| `skin.*` | 3 | 皮肤切换器 |
| `voice.*` | 108 | 进房态全部（shell/workspace/频道树/成员/聊天/音频坞/共享/性能/移动） |

## 全量清单

app, app.skin-catalog-notice, app.skin-recovery-notice, app.toast,
download.brand, download.card, download.card.head, download.card.meta, download.header, download.hero,
favorite-server.actions, favorite-server.cancel, favorite-server.close, favorite-server.dialog, favorite-server.field, favorite-server.field-label, favorite-server.header, favorite-server.submit,
home, home.brand, home.connect, home.content, home.device-setup, home.device-setup.open, home.download-button, home.field, home.field-label, home.footer, home.form, home.gateway-status, home.header, home.header-more, home.header-tools, home.hero, home.hero.description, home.hero.title, home.identity, home.identity-actions, home.identity-export.button, home.identity-import-dialog, home.identity-import.cancel, home.identity-import.close, home.identity-import.drop-zone, home.identity-import.error, home.identity-import.file-button, home.identity-import.footer, home.identity-import.header, home.identity-import.open, home.identity-import.security, home.identity-import.submit, home.identity-import.textarea, home.join-card, home.join-card.sonar, home.join-card.waveform, home.join-description, home.join-title, home.mobile-gate, home.notice, home.security-note, home.server-history, home.server-history.add, home.server-history.item, home.server-target,
language.menu, language.option, language.trigger,
skin.menu, skin.option, skin.trigger,
voice.activity, voice.activity-heading, voice.activity.artwork, voice.audio-dock, voice.audio-dock.controls, voice.audio-dock.microphone, voice.audio-dock.microphone-panel, voice.audio-dock.output, voice.audio-dock.output-panel, voice.audio-settings, voice.audio-status, voice.audio-status-dismiss, voice.banners, voice.breadcrumbs, voice.channel-group, voice.channel-group.fold, voice.channel-group.heading, voice.channel-group.heading-row, voice.channel-group.members, voice.chat, voice.chat.collapse, voice.chat.composer, voice.chat.empty, voice.chat.event, voice.chat.heading, voice.chat.message, voice.chat.message-avatar, voice.chat.message-body, voice.chat.message-bubble, voice.chat.messages, voice.chat.reopen, voice.chat.status, voice.chat.tab, voice.chat.tabs, voice.chat.title-row, voice.connection-status, voice.content, voice.context-menu, voice.context-menu-backdrop, voice.context-menu.header, voice.context-menu.move-submenu, voice.favorite-server-add, voice.favorite-server-chip, voice.favorite-server-rail, voice.favorite-server-rail.add, voice.favorite-server-strip, voice.favorite-switch-banner, voice.group-label, voice.header, voice.header-actions, voice.member, voice.member-panel, voice.member-panel.channels, voice.member-panel.heading, voice.member-panel.search, voice.member-row, voice.member-row.avatar, voice.member-row.copy, voice.member-row.flags, voice.member-row.volume, voice.member.avatar, voice.member.avatar-wrap, voice.member.live-indicator, voice.member.mic-status, voice.member.name, voice.member.status, voice.members, voice.members.empty, voice.microphone-status, voice.mobile-more, voice.mobile-nav, voice.performance, voice.performance.metrics, voice.performance.panel, voice.performance.route, voice.performance.status, voice.performance.webrtc-stats, voice.poke, voice.rail-identity, voice.screen-player, voice.screen-player.controls, voice.screen-player.exit, voice.screen-player.fullscreen, voice.screen-player.live, voice.screen-player.placeholder, voice.screen-player.source, voice.screen-player.stage, voice.screen-player.video, voice.screen-player.viewer-avatar, voice.screen-player.viewers, voice.screen-player.volume, voice.screen-share-error, voice.screen-share-settings, voice.screen-share-settings.actions, voice.screen-share-settings.fields, voice.screen-share-settings.heading, voice.screen-share-settings.note, voice.scroll, voice.server-header, voice.server-meta, voice.server-switcher, voice.server-switcher-backdrop, voice.server-switcher.trigger, voice.server-welcome, voice.shell, voice.speaking-strip, voice.whisper-strip, voice.workspace

## 相关锚点（非 part，皮肤契约的其余面）

- `.ws-skin-root` 根类 + `data-ws-skin`（当前皮肤 id）+ `data-ws-page`（home/voice）——挂 `.web-client` 根。
- `SkinSwitcher`：`data-ws-skin-id` / `data-ws-state`；`LanguageSwitcher`：`data-ws-language`。
- 运行时 `markCoreControls()` 给控件补 `data-ws-critical` / `data-ws-part="control"` / `data-ws-control-kind`（MutationObserver 持续标注）。
