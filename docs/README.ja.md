# WebSpeak · 日本語

[プロジェクトトップ](../README.md) · [简体中文](./README.zh-CN.md) · [English](./README.en.md) · [Deutsch](./README.de.md) · [Русский](./README.ru.md)

## プロジェクト概要

| 観点 | 説明 |
| --- | --- |
| **WHAT** | WebSpeak は TeamSpeak 3 / TeamSpeak 6 向けのセルフホスト型ブラウザクライアント兼音声ゲートウェイです。 |
| **WHY** | デスクトップクライアントをインストールせず、ブラウザからチャンネルに参加できます。運用者はサーバーとデータを管理できます。 |
| **HOW** | 起動後、管理コンソールで TeamSpeak の接続先とアクセス方針を設定します。ブラウザが画面と音声を担当し、WebSpeak がゲートウェイとして接続します。 |

## オンラインデモ

現在、公開オンラインデモは提供されていません。試す場合は、以下のデプロイ手順に従って自身のインスタンスを構築してください。

## ✨ 機能

| 機能 | 説明 |
| --- | --- |
| TeamSpeak | TeamSpeak 3 / 6 に対応し、対象プロトコルを自動検出します。 |
| クロスプラットフォーム P2P 画面共有 | ブラウザユーザーと TeamSpeak 6 ネイティブクライアントが互いに画面共有を開始・視聴できます。メディアは WebRTC/ICE で直接送信し、WebSpeak はシグナリングだけを中継します。 |
| IPv6 | IPv6 の接続先と DNS から解決された IPv6 アドレスに標準対応します。 |
| チャンネルとメンバー | チャンネルツリー、リアルタイムのメンバー状態、チャンネル移動。 |
| リアルタイム音声 | Opus、互換トランスポート、内蔵 WebRTC による低遅延音声。 |
| 音声操作 | マイク、スピーカー、音量、VOX、ミュート、メンバーごとの音量調整。 |
| ブラウザ側ノイズ抑制 | マイクのノイズ抑制をブラウザの音声取得段階で任意に使用でき、サーバー側の追加処理は不要です。 |
| チャットと操作 | チャンネル/サーバーチャット、個人メッセージ、つつく、ウィスパー対象。 |
| BGM共有 | デスクトップブラウザで音声付きウィンドウやタブの音をチャンネルに共有。 |
| ID とアクセス | ID の保存、接続先の指定に加え、TeamSpeak 3 ID のインポート、変換、検証、エクスポート。 |
| 管理コンソール | 接続先、アクセス、公開メディアアドレス、IPv6 候補、音声 STUN、セッション、ログ、診断、バックアップ。 |
| プロジェクト構造 | 0.2.6 では音声ゲートウェイ、セッションイベント、音声処理、画面共有調整を分割し、音声・管理画面をコンポーネント、composable、サービスに整理しました。ライフサイクルと再接続のテストも追加しました。 |
| スキン | 保護された昼・夜・ILLUSIA スキンに加え、管理者が有効化とデフォルトを管理するインスタンス `.wskin` に対応。 |
| インターフェース | 中文、English、Deutsch、Русский、日本語、レスポンシブ表示。 |
| デプロイ | Windows x64、Linux x64/ARM64 パッケージ、Docker amd64/arm64。 |

## 🖼️ インターフェースのスクリーンショット

日本語のホーム、音声ワークスペース、オーディオ設定、メンバー操作メニューを掲載しています。

### ホーム

<p align="center"><img src="./screenshots/webspeak-ja-home.png" alt="WebSpeak 日本語ホーム" width="100%" /></p>

### 音声ワークスペース

<p align="center"><img src="./screenshots/webspeak-ja.png" alt="WebSpeak 日本語音声ワークスペース" width="100%" /></p>

### オーディオ設定

<p align="center"><img src="./screenshots/webspeak-ja-audio.png" alt="WebSpeak 日本語オーディオ設定" width="100%" /></p>

### メンバーメニュー

<p align="center"><img src="./screenshots/webspeak-ja-menu.png" alt="WebSpeak 日本語メンバーメニュー" width="100%" /></p>

## 🧩 高度な機能

### WebRTC

**管理コンソール → サーバー → 詳細設定** で有効にします。無効の状態で UDP ポート範囲（初期値 `40000–40099`）を設定し、ファイアウォールで許可して保存してください。有効中は範囲がロックされ、新しい接続で WebRTC を使用します。非対応のブラウザは互換トランスポートに戻ります。公開サイトでは HTTPS が必要です。

### リバースプロキシ / TCP トンネル背後の音声 WebRTC

管理コンソールの WebRTC 詳細設定では、次の項目を設定できます。

- **公開メディアアドレス**: WebSpeak ゲートウェイが UDP で到達可能な IP またはドメイン。プロトコル・パス・ポートは含みません。Web 入口から推定したアドレスより優先され、空欄の場合は `Origin`、`X-Forwarded-Host`、`Host` から推定します。ドメインは IP 候補に解決されます。プロキシのドメインがそのままメディアアドレスになるとは限りません。
- **IPv6 候補の有効化**: 既定では無効です。有効にすると IPv4 候補を維持したまま IPv6 候補も収集します。IPv6 ルーティングと UDP のファイアウォール許可が必要です。
- **音声 STUN サービス**: たとえば `stun:turn.teamspeak.com:3478`。ブラウザとゲートウェイが同じサービスで公開マッピングを検出します。空欄の場合は従来どおり、werift ゲートウェイはライブラリ内蔵の STUN を使い、ブラウザは STUN を設定しません。現在は IPv4 で到達できる UDP STUN のドメイン名または IPv4 アドレスのみに対応し、IPv6 リテラル、TURN、認証情報は受け付けません。IPv6 のメディア候補は STUN のスイッチとは独立しています。

保存後に再接続してください。Web ページと WebSocket がリバースプロキシ経由で到達できても、メディアの UDP が到達可能とは限りません。STUN はアドレスを検出するだけで音声を中継せず、すべての NAT を通過できる保証もありません。TCP トンネルしかなく利用できる UDP/IPv6 経路がない場合は、互換トランスポートに戻ります。設定した UDP ポート範囲全体を開放し、静的ポート転送では同じポート割り当てを維持してください。

### 画面共有の ICE 候補

画面共有のメディアは引き続きブラウザ間の直接接続を優先し、WebSpeak はシグナリングだけを中継します。初期状態では TeamSpeak の公開 STUN サービスで外部候補を検出します。STUN はメディアを運びません。認可済みの外部 TURN を使う場合は、起動前に `WEBSPEAK_SCREEN_SHARE_ICE_SERVERS` を JSON 配列で設定できます。

```json
[{"urls":"stun:turn.teamspeak.com:3478"},{"urls":"turns:turn.example.com:5349","username":"<username>","credential":"<credential>"}]
```

TURN を設定した場合、メディアは外部 TURN サービスを経由することがありますが、WebSpeak ゲートウェイは経由しません。未設定時は直接接続と STUN のみを使用します。

### クロスプラットフォーム P2P 画面共有

ブラウザユーザーと TeamSpeak 6 ネイティブクライアントは、互いの画面共有を検出・開始・視聴できます。ブラウザ間、およびブラウザとネイティブクライアント間の画面メディアは、可能な限り WebRTC/ICE の直接接続で送信されます。WebSpeak はセッション認証、共有状態、SDP/ICE シグナリングを担当しますが、画面メディア自体は転送しません。画面には配信中の状態と視聴者数が表示され、音量、全画面、終了を操作できます。取得設定は最大 1080p / 60 FPS に対応し、WebRTC 統計も確認できます。

### 依存関係と帰属

- WebRTC には [werift](https://github.com/shinyoshiaki/werift-webrtc) `0.24.4` を使用しています。upstream プロジェクトは MIT ライセンスです。
- TeamSpeak プロトコルには [EchoSixHIYA/teamspeak-js](https://github.com/EchoSixHIYA/teamspeak-js) SDK を使用しており、ビルド成果物は `vendor/teamspeak-client/` としてリポジトリに取り込まれています。

## 🚀 デプロイ

| 方法 | 用途 |
| --- | --- |
| Docker Compose | 常時稼働サーバーと簡単な更新 |
| Release パッケージ | Node.js やビルドツールを使わない起動 |
| ソースから | 開発やカスタマイズ |

### Docker Compose

```bash
git clone --depth 1 https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak.git
cd WebSpeak-client-for-TeamSpeak
docker compose pull
docker compose up -d
```

起動後に `http://<your-host>:3040/admin` を開き、初回起動時にログへ出力される一回きりのセットアップトークン（`Admin setup token: ws-setup-…`）でログインして直ちにパスワードを変更し、TeamSpeak を設定します。パスワード変更後はトークンは無効になります。データは `webspeak-data` volume に保存されます。データベースを消さない場合は `docker compose down -v` を実行しないでください。

### Release パッケージ

[GitHub Releases](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/latest) から、OS とアーキテクチャに合った `windows-x64.zip`、`linux-x64.tar.gz`、`linux-arm64.tar.gz` のいずれかをダウンロードし、展開して同梱の起動スクリプトを実行します。パッケージには Node.js 実行環境と本番用依存が含まれます。Docker イメージは amd64/arm64 に対応しています。

### ソースから

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

### よくある質問

- **ページ更新やネット切断後に「TeamSpeak サーバーから BAN された」と表示される**: これは TeamSpeak サーバーのアンチフラッド保護が頻繁な再接続に対して発動したもので、一時的です（通常は数分で解除）。少し待ってから再接続してください。WebSpeak は切断後 60 秒間セッションを保持し、その間の更新やネット復帰では TeamSpeak 側に再接続せずそのまま部屋に戻れます。明示的な「切断」では即座に退出します。
- **ログのクライアント IP がすべて 127.0.0.1 になる**: ゲートウェイは信頼されたプロキシとして宣言されない限り転送ヘッダーを無視します。リバースプロキシ越しに公開する場合は `WEBSPEAK_TRUST_PROXY=1` を設定し、プロキシに `X-Forwarded-For` を送信させてください（nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`）。この設定不備を検知すると、ゲートウェイがログに一度だけヒントを出力します。
- **更新後に部屋へどう戻る？**: 60 秒以内ならセッションが自動的に復帰し、パスワードの再入力は不要です。「切断」を押すと即座に退出し、復帰情報は消去されます。

## ⚠️ 要件と注意

- ソースからのビルドには Node.js `>=22.5` が必要です。Docker と Release には必要な実行環境が含まれます。
- WebRTC に対応した最新の Chrome、Edge などを使用してください。マイクとウィンドウ音声には通常 HTTPS が必要です。
- WebSpeak のホストから TeamSpeak に到達できる必要があります。標準音声ポートは `9987` です。
- Web サービスは `3040/TCP` を使用します。公開時は HTTPS と WebSocket をリバースプロキシ経由で公開し、`WEBSPEAK_TRUST_PROXY=1` を設定してレート制限とログが実際のクライアントアドレスを扱うようにしてください。
- IPv6 にはルーティング可能な IPv6、OS/コンテナで有効な IPv6、適切なファイアウォール設定が必要です。リテラルは `[2001:db8::1]#9987` の形式です。
- 保存したブラウザ ID は同じブラウザで同時に1接続だけ使用できます。
- BGM共有はデスクトップのみで、WebRTC が必要です。

## コミュニティと関連プロジェクト

- [Telegram グループ](https://t.me/+8qShpTcuN9A3MWY9)
- [NeteaseTSBot](https://github.com/yichen11818/NeteaseTSBot) — Web コンソール付き TeamSpeak 音楽ボット。

## 🧾 更新履歴

> 以下のバージョン履歴は upstream 時代の変遷を記録したものです。本 fork では、そのうちの一部機能（加速中継、Android クライアント、訪問者番号）を削除しています。

| バージョン | 日付 | 内容 |
| --- | --- | --- |
| [v0.2.6](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.6) | 2026-10-08 | 0.2.5 から音声ゲートウェイ、共有プロトコル、音声ワークスペース、管理モジュールを大規模に再構成。#6/#7/#10 を修正し、#9/#12 を実装。PR #13 が報告した既存 TS6 画面共有の検出漏れも修正しました。Opus、セッションのライフサイクル、モバイル操作を改善。Windows x64、Linux x64/ARM64、Docker amd64/arm64、Android arm64-v8a/armeabi-v7a/x86_64 APK を提供。 |
| [v0.2.5](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.5) | 2026-09-27 | `.wskin` スキン、管理者向けの有効化/デフォルト設定、保護された昼・夜・ILLUSIA 内蔵スキンを追加。未完成の Aurora Voice サンプルを削除し、読み込み時のちらつき、ダークモードの視認性、音声画面のアートレイヤーを修正。公式スキン開発 Agent Skill も追加しました。 |
| [v0.2.4](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.4) | 2026-09-22 | ブラウザと TeamSpeak 6 ネイティブクライアント間のクロスプラットフォーム P2P 画面共有を追加しました。STUN/外部 TURN 設定、プレーヤーと視聴者状態、1080p/60 FPS 取得設定、WebRTC 統計に対応し、共有操作と訪問者番号も改善しました。 |
| [v0.2.3](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.3) | 2026-09-19 | チャンネルメンバーの移動操作と権限に応じた直接移動を追加し、アバター表示、ミュート状態の同期、保存 ID の復元に対応しました。5 言語のスクリーンショットとドキュメントも更新しました。 |
| [v0.2.2](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.2) | 2026-09-17 | ブラウザ側マイクノイズ抑制、ロシア語・日本語 UI、言語別ウェルカム文を追加。音量操作と PR #2 を基にしたエラー表示・エラーコードを改善しました。 |
| [v0.2.1](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.1) | 2026-09-13 | 接続エラー表示を改善し、IPv6 接続先を標準対応しました。 |
| [v0.2.0](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.0) | 2026-09-10 | パスワード案内、正式な中継モード、複数中継選択、接続診断を追加しました。 |
| [v0.1.8](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.8) | 2026-09-08 | Docker 起動を簡略化し、15秒の接続タイムアウトと継続的なネットワーク監視を追加しました。 |
| [v0.1.7](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.7) | 2026-09-06 | ドイツ語、Telegram、ネットワークパフォーマンスパネル、全体音量を追加し、伴奏の音量変動を修正しました。 |
| [v0.1.6](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.6) | 2026-09-04 | デスクトップ伴奏、ID 保持の案内、サイトアイコンを追加し、WebRTC のメンバーごとの音量を修正しました。 |
| [v0.1.5](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.5) | 2026-09-04 | ID 保存ロジックを修正し、テーマ切り替えを改善しました。 |
| [v0.1.4](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.4) | 2026-09-03 | WebRTC とチャンネルチャットを修正し、管理画面・ログ・モバイルレイアウトを改善しました。 |
| [v0.1.3](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.3) | 2026-09-03 | 内蔵 WebRTC を導入し、TeamSpeak SDK を移行、メンバー同期と音声バッファリングを改善しました。 |

完全な履歴は [CHANGELOG.md](../CHANGELOG.md) を参照してください。

## ライセンス

WebSpeak は [GNU Affero General Public License v3.0 only](../LICENSE) の下で公開されています。

## 最近マージされた貢献

- GitHub のマージ記録に基づく一覧です。上のバージョン概要には、各リリースに実際に含まれる変更のみを記載しています。
- [LainHE](https://github.com/LainHE) — [PR #2](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/pull/2) でブラウザのエラー翻訳を改善し、[PR #8](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/pull/8) で拡大縮小、フローティングレイアウト、ホームのフッターを修正。
- [TimmySheep](https://github.com/TimmySheep) — [マージ済み PR #13、#15–#24](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/pulls?q=is%3Apr+is%3Amerged+author%3ATimmySheep)。既存 TS6 共有の検出、画面比率、モバイル音声・画面点灯・スキンメニュー、ID のチャンネル設定、PWA/テーマ、チャット履歴、メンバー音声状態、マイク権限などに貢献。
- [yichen11818](https://github.com/yichen11818) — [PR #25](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/pull/25) で TeamSpeak の登録済みニックネームによる接続に対応し、設定・お気に入り・招待リンクにニックネームの接続先を保持。
