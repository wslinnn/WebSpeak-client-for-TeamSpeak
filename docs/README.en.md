# WebSpeak · English

[Project home](../README.md) · [简体中文](./README.zh-CN.md)

WebSpeak is a self-hosted browser client and voice gateway for TeamSpeak 3 and TeamSpeak 6. Visitors join channels without installing a desktop client, while administrators manage target servers, access policy, and runtime state from the web console.

## Live demo

No public live demo is available. Deploy your own instance using the instructions below.

## Features

| Capability | Description |
| --- | --- |
| TeamSpeak compatibility | Supports TeamSpeak 3 and TeamSpeak 6 and automatically detects the target protocol. |
| IPv6 targets | IPv6 literal targets and IPv6 addresses resolved from hostnames are supported by default. |
| Realtime voice | Opus audio. WebRTC is the primary low-latency transport, with a WebSocket compatibility transport available. |
| Channels and members | Browse the channel tree, see live member states, switch channels, and move members when permitted. |
| Audio controls | Microphone and speaker selection, per-member volume, VOX, microphone test, microphone gain, and echo cancellation. |
| Browser-side noise suppression | Optional GTCRN suppression runs at the browser capture stage, without adding server-side audio processing. |
| Messaging and actions | Channel chat, server chat, private messages, poke actions, and whisper targets. |
| Desktop accompaniment | Select an audio-enabled window or browser tab and share its sound with the current channel. |
| Cross-platform screen sharing | Media travels end to end over WebRTC between browsers and native TeamSpeak 6 clients; the gateway only relays negotiation signaling. |
| Identity and access | Remembered identity, TeamSpeak 3 identity import/conversion/validation/export, and visitor-defined targets. |
| Administration | Manage targets, access policy, WebRTC, sessions, audit logs, diagnostics, and backups. |
| UI and deployment | Chinese and English interfaces, responsive desktop/mobile layouts, and Day/Night themes; self-hosting via Docker or release packages. |

## Screenshots

The screenshots below show the English welcome page, voice workspace, audio controls, and member menu.

### Welcome page

<p align="center"><img src="./screenshots/webspeak-en-home.png" alt="WebSpeak English welcome page" width="100%" /></p>

### Voice workspace

<p align="center"><img src="./screenshots/webspeak-en.png" alt="WebSpeak English voice workspace" width="100%" /></p>

### Audio controls

<p align="center"><img src="./screenshots/webspeak-en-audio.png" alt="WebSpeak English audio controls" width="100%" /></p>

### Member menu

<p align="center"><img src="./screenshots/webspeak-en-menu.png" alt="WebSpeak English member menu" width="100%" /></p>

## Advanced features

Every advanced feature is optional. Configure them under Server in the administration console; changes apply to new connections.

### Low-latency voice over WebRTC

WebRTC moves browser voice onto a realtime media channel and also carries desktop accompaniment. The current WebSpeak gateway provides the media service; no separate media server is required.

1. Sign in to `/admin` and open the advanced parameters under Server.
2. While WebRTC is disabled, set the UDP port range — `40000–41999` by default.
3. Allow the entire UDP range in the WebSpeak host's security group and firewall.
4. Enable WebRTC and save. Visitors negotiate it after reconnecting.

The port range locks while WebRTC is enabled. To change it, disable WebRTC and save first, then adjust the range and firewall rules. Public deployments also need HTTPS.

### Voice behind a reverse proxy or TCP tunnel

The WebRTC advanced parameters expose:

- **Public media address**: an IP or hostname the gateway is reachable at over UDP, without scheme, path, or port. When empty, it is inferred from `Origin`, `X-Forwarded-Host`, or `Host`. A proxy hostname is not necessarily the media address.
- **Enable IPv6 candidates**: off by default; when on, IPv4 is retained and IPv6 is collected too. Requires routable IPv6 and matching UDP firewall rules.
- **Voice STUN server**: for example `stun:turn.teamspeak.com:3478`, used by both the browser and the gateway to discover public mappings. When empty, the gateway keeps using its built-in STUN and the browser configures none. This field only accepts IPv4-reachable UDP STUN hostnames or addresses — not IPv6 literals, TURN, or credentials.

Reconnect after saving. HTTP/WebSocket reachability does not imply media reachability over UDP; STUN only discovers addresses and never relays audio. With a TCP tunnel and no usable UDP/IPv6 path, voice stays on the compatibility transport.

### ICE candidates for screen sharing

Screen-share media always takes a direct path between browsers; WebSpeak only relays negotiation signaling. The gateway answers STUN itself (UDP `3478`; `WEBSPEAK_STUN_PORT` changes it, `0` disables it). With a **Public media address** configured, screen sharing prefers `stun:<address>:3478` to discover public candidates and falls back to TeamSpeak's public STUN. Cross-network direct connections require UDP `3478` to be open.

STUN cannot traverse symmetric NAT, including carrier-grade NAT. When both peers sit behind such a network with no IPv6, no direct path exists — that is a network-condition limit.

To define a fully custom candidate list, including an external TURN server, set `WEBSPEAK_SCREEN_SHARE_ICE_SERVERS` before starting WebSpeak. The value is a JSON array or a comma-separated URL list:

```json
[{"urls":"stun:turn.teamspeak.com:3478"},{"urls":"turns:turn.example.com:5349","username":"<username>","credential":"<credential>"}]
```

With TURN configured, media may traverse that external service but never the WebSpeak gateway; without it, only direct paths and STUN are used.

### Cross-platform screen sharing

Browser users and native TeamSpeak 6 clients can discover, start, and watch each other's shares. The page provides live status, viewer counts, player volume, fullscreen and exit controls, capture resolution and frame-rate selection, and WebRTC statistics. When negotiation fails it reports the discovery servers actually tried, the candidate count, and first-frame proof, so cross-network problems can be located.

### Dependencies and attribution

- WebRTC uses [werift](https://github.com/shinyoshiaki/werift-webrtc) `0.24.4`, MIT licensed upstream.
- The TeamSpeak protocol uses the build output of `@honeybbq/teamspeak` 1.0.0-beta.26, vendored under `vendor/teamspeak/` (MIT); see `VENDOR.md` there before upgrading.
- Noise suppression uses the GTCRN model from [@sapphi-red/web-noise-suppressor](https://github.com/sapphi-red/web-noise-suppressor) (MIT).

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for the complete history.

| Version | Date | Summary |
| --- | --- | --- |
| [v0.3.0](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.3.0) | 2026-11-18 | First official release of this repository. Voice path reworked (shared mixing bus, encoder alignment with the official client, silence timeline, bounded egress); screen sharing gained a built-in STUN server and cross-network diagnostics; security baseline (one-time setup token, security headers, rate limits, proxy trust); administration and frontend moved to React 19 with UI primitives. Removed accelerated relay, Android client, DemoView, visitor counter, and skin system. |

## Deployment

| Option | Best for | Requirements |
| --- | --- | --- |
| Docker Compose (recommended) | Long-running instances, simple upgrades, persistent data | Docker Engine + Docker Compose |
| Release packages | No Node.js or build toolchain on the host | Windows x64 or Linux x64/ARM64 |
| From source | Development, debugging, and customization | Node.js 22.22.2+, Git, and local build tools |

### Docker Compose (recommended)

```bash
git clone --depth 1 https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak.git
cd WebSpeak-client-for-TeamSpeak
docker compose pull
docker compose up -d
```

Open `http://<your-host>:3040`. Behind a reverse proxy, point it at that address: a loopback proxy on the same host is trusted by default (`WEBSPEAK_TRUST_PROXY=0` opts out); for a proxy on another host or container network, declare it with `WEBSPEAK_TRUSTED_PROXIES`. When WebRTC is enabled, allow the UDP range shown in the console. Data lives in the `webspeak-data` volume.

```bash
docker compose ps
docker compose logs -f webspeak
```

Upgrading:

```bash
git pull --ff-only
docker compose pull
docker compose up -d
```

Never run `docker compose down -v`, which deletes the database and administrator settings.

### Release packages

Download the `windows-x64.zip`, `linux-x64.tar.gz`, or `linux-arm64.tar.gz` matching your platform from [Releases](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/latest) and run the bundled launcher. Packages include the Node.js runtime and production dependencies. Docker images cover amd64 and arm64.

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

### First-time configuration

1. Open `http://<your-host>:3040/admin`.
2. Read the one-time setup token that the first start prints to the log (`Admin setup token: ws-setup-…`), sign in with it, and immediately set a new password of at least 12 characters. The token stops working once a password exists.
3. On the Server page, configure the TeamSpeak target and access policy, for example `voice.example.com#9987`.
4. For public use, configure HTTPS; when WebRTC is enabled, allow the UDP range shown in the console.

### Troubleshooting

- **"Banned by the TeamSpeak server" after a refresh or network drop**: this is the target server's anti-flood protection after rapid reconnects and usually clears within minutes. WebSpeak keeps a session for 60 seconds after a disconnect, so a refresh or restored network returns you to the same room with no reconnect on the TeamSpeak side. Choosing Disconnect leaves immediately.
- **Every logged client IP is 127.0.0.1**: the gateway only believes forwarding headers from a declared or loopback proxy. This usually means `WEBSPEAK_TRUST_PROXY=0` was set explicitly, or the proxy does not send `X-Forwarded-For` (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). For a proxy on another host, declare it with `WEBSPEAK_TRUSTED_PROXIES=10.0.0.5,172.16.0.0/12`.
- **Returning to the room after a refresh**: reopening the page within 60 seconds restores the previous room without re-entering a password. Choosing Disconnect leaves immediately and clears the resume information.
- **Screen sharing only works on the same network**: confirm a Public media address is set and UDP `3478` is open. Behind symmetric NAT with no IPv6 there is no direct path; configure an external TURN server.

## Requirements and caveats

| Item | Requirement or caveat |
| --- | --- |
| Browser | A current Chrome, Edge, or other modern browser with WebRTC. Microphone and window audio usually require HTTPS. |
| TeamSpeak network | The WebSpeak host must reach the target TeamSpeak server; the default voice port is `9987`. |
| Web service | The gateway listens on `3040/TCP`; public deployments should serve HTTP and WebSocket through an HTTPS reverse proxy. |
| IPv6 | Write IPv6 literals as `[2001:db8::1]#9987`. The host or container needs routable IPv6, an IPv6-enabled OS and Node.js, plus matching firewall rules. |
| WebRTC | Uses `40000–41999/UDP` by default; allow the entire range when enabled, and disable WebRTC before changing it. |
| Screen sharing | Cross-network direct connections require UDP `3478`. |
| Remembered identity | One browser identity holds a single active connection at a time; disable remember-me for the second connection or use another browser profile. |
| Accompaniment | Desktop only and requires WebRTC; tick the audio option when picking a window or tab. |
| Data | Docker keeps data in the `webspeak-data` volume; packages and source runs use `data/`. Back up before upgrading. |
| Session ceiling | Up to 100 active browser sessions per instance. |
| Deployment security boundary | Same-origin checks (`Origin` must match `Host`, enforced on the voice WebSocket upgrade too) only stop cross-origin requests — they do **not** prevent DNS rebinding. Expose the gateway only on a trusted network (firewall/ACL, intranet, or VPN) and put a reverse proxy you control, on a different host, at the public edge. Do not expose `3040/TCP` to an untrusted network. **Proxy note**: both HTTP and WebSocket locations must preserve the public Host — nginx rewrites Host to the upstream address by default, so set `proxy_set_header Host $host;` explicitly (with the `Upgrade`/`Connection` headers), or voice connections are rejected with 1008 `ORIGIN_REJECTED`. |
| Browser storage and passwords | Remembering a server password is always a local behaviour: open mode stores it in the IndexedDB favourites record, fixed mode in a dedicated `localStorage` key. Both are **plaintext**, scoped to this device and origin, and removable via Clear local data. Page-side CSP narrows the XSS surface but does not encrypt browser storage — do not rely on password memory on shared or public computers. |
| Administrator password hashing | Passwords use scrypt (`N=2^15, r=8, p=1`, about 32 MiB per attempt), with parameters stored alongside the credential so raising the cost later does not invalidate old passwords. Deployments with spare memory may raise `N` in `src/security/admin-password.ts` together with `maxmem`. |

## Environment variables

| Variable | Purpose |
| --- | --- |
| `WEBSPEAK_DATA_DIR` | Persistent data directory; defaults to the project `data/`, Docker uses `/data` |
| `WEBSPEAK_PORT` | HTTP port, `3040` by default |
| `WEBSPEAK_LOG_LEVEL` | Set to `debug` for verbose logging |
| `WEBSPEAK_SDK_DEBUG` | Set to `1` to enable TeamSpeak SDK protocol logging (may contain credentials; off by default) |
| `WEBSPEAK_TRUST_PROXY` | Set to `0` to stop trusting loopback proxies (trust is on by default) |
| `WEBSPEAK_TRUSTED_PROXIES` | Comma-separated trusted proxy IPs/CIDRs, overriding the previous setting |
| `WEBSPEAK_STUN_PORT` | Built-in STUN port, `3478` by default; set to `0` to disable |
| `WEBSPEAK_SCREEN_SHARE_ICE_SERVERS` | Overrides the screen-share ICE server list |
| `WEBSPEAK_RTP_DEBUG` | Enables the RTP lab diagnostics used for voice troubleshooting |
