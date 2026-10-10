# WebSpeak · English

[Project home](../README.md) · [简体中文](./README.zh-CN.md) · [Deutsch](./README.de.md) · [Русский](./README.ru.md) · [日本語](./README.ja.md)

WebSpeak is a self-hosted browser client and voice gateway for TeamSpeak 3 and TeamSpeak 6. Visitors can join channels without installing a desktop client, while administrators manage the target servers, access policy, and runtime state from the web console.

## Live demo

No public live demo is available at the moment. To try WebSpeak, deploy your own instance using the instructions below.

## ✨ Features

| Capability | Description |
| --- | --- |
| TeamSpeak compatibility | Supports TeamSpeak 3 and TeamSpeak 6 and automatically detects the target protocol. |
| Cross-platform P2P screen sharing | Browser users and native TeamSpeak 6 clients can start and watch each other's screen shares; WebRTC/ICE carries media directly while WebSpeak relays negotiation signaling only. |
| IPv6 targets | IPv6 TeamSpeak targets and IPv6 addresses resolved from hostnames are supported by default. |
| Channels and members | Browse the channel tree, see live member states, and switch channels. |
| Realtime voice | Opus audio with a compatibility transport and optional bundled WebRTC low-latency transport. |
| Audio controls | Select microphones and speakers, adjust volume, test the microphone, mute, use VOX, and control member volume. |
| Browser-side noise suppression | Optional microphone noise suppression runs at the browser capture stage, without adding server-side audio processing. |
| Messaging and actions | Channel chat, server chat, private messages, poke actions, and whisper targets. |
| Desktop accompaniment | Select an audio-enabled window or browser tab and share its sound with the current channel. |
| Identity and access | Remembered identity, visitor-defined targets, and TeamSpeak 3 identity import, conversion, validation, and export. |
| Administration | Manage targets, access policy, public media address, IPv6 candidates, voice STUN, sessions, logs, diagnostics, and backups. |
| Engineering structure | In 0.2.6, gateway voice, session events, audio, and screen-share coordination were split into modules; frontend voice and admin pages were decomposed into components, composables, and services, with lifecycle and reconnect tests. |
| Skins | Protected Day, Night, and ILLUSIA skins, plus instance-managed `.wskin` appearances with administrator enable/default controls. |
| User experience | Chinese, English, German, Russian, and Japanese UI with responsive desktop/mobile layouts. |
| Self-hosting | Data stays with the operator; packages include Windows x64 and Linux x64/ARM64, and Docker supports amd64/arm64. |

## 🖼️ Screenshots

The screenshots show the English welcome page, voice workspace, audio controls, and member menu.

### Welcome page

<p align="center"><img src="./screenshots/webspeak-en-home.png" alt="WebSpeak English welcome page" width="100%" /></p>

### Voice workspace

<p align="center"><img src="./screenshots/webspeak-en.png" alt="WebSpeak English voice workspace" width="100%" /></p>

### Audio controls

<p align="center"><img src="./screenshots/webspeak-en-audio.png" alt="WebSpeak English audio controls" width="100%" /></p>

### Member menu

<p align="center"><img src="./screenshots/webspeak-en-menu.png" alt="WebSpeak English member menu" width="100%" /></p>

## 🧩 Advanced features

These features are optional. WebSpeak continues to work with the compatibility voice transport when they are disabled. Configure them under **Administration → Servers**; saved changes apply to new connections.

### WebRTC low-latency voice

WebRTC moves browser voice to a realtime media path and also enables desktop accompaniment. The current WebSpeak gateway provides it directly; no separate media server is required.

1. Sign in at `/admin` and open **Advanced settings** on the **Servers** page.
2. While WebRTC is disabled, choose the UDP start and end ports. The default range is `40000–40099`.
3. Allow the complete UDP range in the WebSpeak host's security group and firewall.
4. Enable **WebRTC** and save. New visitors will negotiate WebRTC; unsupported browsers and networks fall back to the compatibility transport.

The port range is locked while WebRTC is enabled. Disable and save WebRTC before changing it, then update the firewall rules. Public deployments also need HTTPS.

### Voice WebRTC behind a reverse proxy or TCP tunnel

The WebRTC advanced settings now include a **public media address**, **IPv6 candidates**, and a **voice STUN server**. The media address must be a gateway IP or hostname reachable over UDP, without a scheme, path or port. It overrides the address inferred from `Origin`, `X-Forwarded-Host`, or `Host`; DNS names are resolved into IP candidates. IPv6 is opt-in and retains IPv4 candidates.

Set a UDP STUN URL such as `stun:turn.teamspeak.com:3478` to use the same discovery service in the browser and gateway. Empty preserves the previous behavior: the gateway library uses its built-in STUN service while the browser has none. The gateway requires an IPv4-reachable UDP STUN hostname or IPv4 address; IPv6 literals and TURN credentials are not accepted. IPv6 media candidates work independently of STUN. Save and reconnect to apply changes.

HTTP/WebSocket reachability does not imply media reachability. Allow the complete configured UDP range and preserve port numbers when using static port forwarding. STUN discovers mappings but cannot relay audio or traverse every NAT. Deployments with only a TCP tunnel and no usable UDP/IPv6 path still fall back to compatibility transport.

### Screen-share ICE candidates

Screen-share media still prefers a direct browser-to-browser path; WebSpeak only relays negotiation signaling. By default it uses TeamSpeak's public STUN services to discover server-reflexive candidates; STUN does not carry media. If the deployment has an authorized external TURN service, set `WEBSPEAK_SCREEN_SHARE_ICE_SERVERS` before starting WebSpeak with a JSON array, for example:

```json
[{"urls":"stun:turn.teamspeak.com:3478"},{"urls":"turns:turn.example.com:5349","username":"<username>","credential":"<credential>"}]
```

With TURN configured, media may use that external TURN service but never the WebSpeak gateway; without it, only direct ICE paths and STUN are used.

### Cross-platform P2P screen sharing

Browser users and native TeamSpeak 6 clients can discover, start, and watch each other's screen shares. Screen media between browsers, and between a browser and a native client, is sent over a WebRTC/ICE peer-to-peer path whenever possible; WebSpeak handles session authorization, share state, and SDP/ICE signaling, but does not carry the screen media. The UI includes live status, viewer count, player volume, fullscreen, and exit controls. Share settings support up to 1080p and 60 FPS, with live WebRTC statistics for diagnosis.

### Dependencies and attribution

- WebRTC uses [werift](https://github.com/shinyoshiaki/werift-webrtc) `0.24.4`, whose upstream project is licensed under MIT.
- TeamSpeak protocol connectivity uses the [EchoSixHIYA/teamspeak-js](https://github.com/EchoSixHIYA/teamspeak-js) SDK; its build output is vendored into the repository at `vendor/teamspeak-client/`.

## 🧾 Changelog

> The version history below reflects the upstream era of the project; this fork has removed some of the capabilities it mentions (acceleration relay, Android client, and visitor numbering).

| Version | Date | Summary |
| --- | --- | --- |
| [v0.2.6](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.6) | 2026-10-08 | Relative to 0.2.5, broadly refactored gateway voice, shared protocol, frontend voice workspace, and admin modules; fixed #6/#7/#10, implemented #9/#12 settings, and fixed the existing-TS6-share discovery case reported in PR #13. Improved Opus/session lifecycles and mobile controls. Packages: Windows x64, Linux x64/ARM64, Docker amd64/arm64, and Android arm64-v8a/armeabi-v7a/x86_64. |
| [v0.2.5](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.5) | 2026-09-27 | Added `.wskin` skins, administrator enable/default controls, and protected Day/Night/ILLUSIA built-ins; removed the unfinished Aurora Voice sample, fixed skin-load flashes, dark-control contrast, and voice-room artwork layering, and added the official skin-development Agent Skill. |
| [v0.2.4](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.4) | 2026-09-22 | Added cross-platform P2P screen sharing between browsers and native TeamSpeak 6 clients; added STUN/external-TURN configuration, live player and viewer state, 1080p/60 FPS capture settings, and WebRTC statistics; refined screen-share interactions and added visitor numbering. |
| [v0.2.3](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.3) | 2026-09-19 | Added channel member scheduling and permission-aware direct moves; added avatar, mute-state, and remembered-identity support; refreshed feature screenshots and documentation for all five languages. |
| [v0.2.2](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.2) | 2026-09-17 | Added browser-side microphone noise suppression, Russian and Japanese UI, and per-language welcome text; refined volume interaction and error messages/codes on top of PR #2. |
| [v0.2.1](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.1) | 2026-09-13 | Improved welcome-page connection errors, preserved and safely truncated error codes, and added default IPv6 target support. |
| [v0.2.0](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.0) | 2026-09-10 | Added server-password prompts, formal relay mode, multiple relay selection, and administrator connection-reason reporting. |
| [v0.1.8](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.8) | 2026-09-08 | Simplified Docker deployment, supported local TeamSpeak targets, added a 15-second connection timeout, and made network monitoring continuous. |
| [v0.1.7](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.7) | 2026-09-06 | Added German, Telegram, network performance, and master-volume features; fixed accompaniment volume fluctuation. |
| [v0.1.6](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.6) | 2026-09-04 | Added desktop accompaniment, remembered-identity guidance, and the site icon; fixed WebRTC member volume. |
| [v0.1.5](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.5) | 2026-09-04 | Fixed identity persistence and refined the theme toggle. |
| [v0.1.4](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.4) | 2026-09-03 | Fixed WebRTC and channel chat and refined administration, logs, and mobile layouts. |
| [v0.1.3](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.3) | 2026-09-03 | Added bundled WebRTC, migrated the TeamSpeak SDK, and improved member synchronization and voice buffering. |

See the complete history in [CHANGELOG.md](../CHANGELOG.md).

## 🚀 Deployment

| Method | Best for | Environment |
| --- | --- | --- |
| Docker Compose (recommended) | Long-running servers, simple upgrades, and persistent data | Docker Engine + Docker Compose |
| Release package | Running without Node.js or build dependencies | Windows x64 or Linux x64/ARM64 |
| From source | Development, debugging, and customization | Node.js 22.5+, Git, and native build tools |

### Docker Compose (recommended)

```bash
git clone --depth 1 https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak.git
cd WebSpeak-client-for-TeamSpeak
docker compose pull
docker compose up -d
```

Open `http://<your-host>:3040` after startup. If using a reverse proxy, point it to that address and set `WEBSPEAK_TRUST_PROXY=1` so rate limits and logs see the real client address and proxy-terminated HTTPS keeps secure cookies. When WebRTC is enabled, allow the UDP range shown in the administration console. Data is stored in the `webspeak-data` volume.

```bash
docker compose ps
docker compose logs -f webspeak
```

Upgrade:

```bash
git pull --ff-only
docker compose pull
docker compose up -d
```

Do not run `docker compose down -v`; it removes the database and administrator settings.

### Release package

Download the matching `windows-x64.zip`, `linux-x64.tar.gz`, or `linux-arm64.tar.gz` from [GitHub Releases](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/latest). Extract it and run the included launcher. Packages include the Node.js runtime and production dependencies. Docker images support amd64/arm64.


### From source

```bash
git clone https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak.git
cd WebSpeak-client-for-TeamSpeak
npm ci --ignore-scripts
npm rebuild @discordjs/opus --foreground-scripts
npm --prefix web ci
npm --prefix web run build
npm run build
npm start
```

Building `@discordjs/opus` requires Python, Make, and a C/C++ toolchain.

### First-time setup

1. Open `http://<your-host>:3040/admin`.
2. Read the one-time setup token printed to the service log at first start (`Admin setup token: ws-setup-…`), sign in at `/admin` with it, and immediately set a new password of at least 12 characters; the token stops working afterwards.
3. Configure the TeamSpeak target and access mode under **Servers**, for example `voice.example.com#9987`.
4. Configure HTTPS for public access; when WebRTC is enabled, allow the UDP range shown in the console.

### FAQ

- **"Banned from the TeamSpeak server" after a refresh or a network drop**: that is the TeamSpeak server's anti-flood protection reacting to rapid reconnects; it is temporary (usually a few minutes) — wait a moment and try again. WebSpeak keeps the session alive for 60 seconds after a drop, so a refresh or network recovery returns you straight to the room with zero TeamSpeak reconnects; clicking Disconnect leaves immediately.
- **Client IPs in the logs are all 127.0.0.1**: the gateway ignores forwarded headers unless a proxy is declared trusted. Behind a reverse proxy set `WEBSPEAK_TRUST_PROXY=1` and make the proxy send `X-Forwarded-For` (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). The gateway logs a hint once when it detects this misconfiguration.
- **How do I get back into the room after a refresh?**: within 60 seconds the session resumes automatically — no password re-entry. Clicking Disconnect leaves immediately and clears the resume state.

## ⚠️ Requirements and notes

| Area | Requirement or note |
| --- | --- |
| Browser | Use a current Chrome, Edge, or other modern browser with WebRTC support. Microphone and window audio normally require HTTPS. |
| TeamSpeak network | The WebSpeak host must reach the target TeamSpeak server; the default voice port is `9987`. |
| Web network | The service uses `3040/TCP`; public deployments should expose the page and WebSocket through an HTTPS reverse proxy. |
| IPv6 | Write literal targets as `[2001:db8::1]#9987`. The host/container needs routed IPv6, IPv6 enabled in the OS and Node.js, and the relevant firewall rules. |
| WebRTC | The default range is `40000–40099/UDP`; allow it and disable WebRTC before changing the range. |
| Remembered identity | One browser identity can hold one active remembered connection. Disable it for parallel connections or use another browser profile. |
| Accompaniment | Desktop only and requires WebRTC. Enable audio sharing when selecting a window or tab. |
| Data | Docker data is in `webspeak-data`; release packages and source installs use `data/`. Back up before upgrades. |
| Session limit | One instance accepts up to 100 active browser sessions. |

## Recent contributors

- Listed from GitHub's merge records; the version summaries above describe only changes included in each release.
- [LainHE](https://github.com/LainHE) — [PR #2](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/pull/2) improved browser error translations; [PR #8](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/pull/8) fixed scaling, floating layout, and the homepage footer.
- [TimmySheep](https://github.com/TimmySheep) — [merged PRs #13 and #15–#24](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/pulls?q=is%3Apr+is%3Amerged+author%3ATimmySheep), covering existing TS6 share discovery, share aspect ratio, mobile voice/wake/skin-menu behavior, identity channel options, PWA/theme work, chat history, member audio states, and microphone permission.
- [yichen11818](https://github.com/yichen11818) — [PR #25](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/pull/25) added connections through registered TeamSpeak nicknames and preserved nickname targets in settings, favorites, and invitations.
