# WebSpeak · Deutsch

[Projektstartseite](../README.md) · [简体中文](./README.zh-CN.md) · [English](./README.en.md) · [Русский](./README.ru.md) · [日本語](./README.ja.md)

WebSpeak ist ein selbst gehosteter Webclient und ein Sprach-Gateway für TeamSpeak 3 und TeamSpeak 6. Nutzer können ohne Desktop-Client im Browser Kanälen beitreten; Administratoren verwalten Zielserver, Zugriff und Laufzeitstatus über die Webkonsole.

## Live-Demo

Derzeit ist keine öffentliche Live-Demo verfügbar. Um WebSpeak auszuprobieren, richten Sie bitte eine eigene Instanz nach der Anleitung unten ein.

## ✨ Funktionen

| Funktion | Beschreibung |
| --- | --- |
| TeamSpeak-Kompatibilität | Unterstützt TeamSpeak 3 und TeamSpeak 6 und erkennt das Zielprotokoll automatisch. |
| Plattformübergreifendes P2P-Bildschirmteilen | Browsernutzer und native TeamSpeak-6-Clients können die Bildschirmfreigabe gegenseitig starten und ansehen; WebRTC/ICE überträgt Medien direkt, WebSpeak leitet nur die Signalisierung weiter. |
| IPv6-Ziele | IPv6-TeamSpeak-Ziele und über DNS aufgelöste IPv6-Adressen werden standardmäßig unterstützt. |
| Kanäle und Mitglieder | Kanalstruktur und aktuelle Mitglieder anzeigen und Kanäle wechseln. |
| Echtzeit-Sprache | Opus-Audio mit kompatiblem Transport und optional integriertem WebRTC für geringere Latenz. |
| Audiosteuerung | Mikrofon und Lautsprecher auswählen, Lautstärke regeln, testen, stummschalten, VOX und individuelle Mitgliedslautstärke. |
| Browserseitige Geräuschunterdrückung | Optionale Mikrofon-Geräuschunterdrückung in der Browseraufnahme, ohne zusätzliche serverseitige Audioverarbeitung. |
| Nachrichten und Aktionen | Kanal- und Serverchat, private Nachrichten, Anstupsen und Flüsterziele. |
| Desktop-Begleitton | Audio eines freigegebenen Fensters oder Browser-Tabs im aktuellen Kanal teilen. |
| Identität und Zugriff | Gespeicherte Identität, eigene Ziele sowie Import, Konvertierung, Prüfung und Export von TeamSpeak-3-Identitäten. |
| Administration | Ziele, Zugriff, öffentliche Medienadresse, IPv6-Kandidaten, Sprach-STUN, Sitzungen, Protokolle, Diagnosen und Backups verwalten. |
| Projektstruktur | In 0.2.6 wurden Sprach-Gateway, Sitzungsereignisse, Audio und Bildschirmfreigabe in Module aufgeteilt; Sprach- und Admin-Oberflächen in Komponenten, Composables und Dienste zerlegt und um Lebenszyklus- und Wiederverbindungstests ergänzt. |
| Skins | Geschützte Tages-, Nacht- und ILLUSIA-Skins sowie instanzverwaltete `.wskin`-Designs mit Aktivierungs- und Standardauswahl im Adminbereich. |
| Oberfläche | Chinesische, englische, deutsche, russische und japanische Oberfläche sowie responsive Desktop-/Mobilansicht. |
| Selbsthosting | Daten bleiben beim Betreiber; Pakete für Windows x64 und Linux x64/ARM64, Docker für amd64/arm64. |

## 🖼️ Screenshots

Die Screenshots zeigen die deutsche Willkommensseite, den Sprachbereich, die Audiosteuerung und das Mitgliedermenü.

### Willkommensseite

<p align="center"><img src="./screenshots/webspeak-de-home.png" alt="WebSpeak deutsche Willkommensseite" width="100%" /></p>

### Sprachbereich

<p align="center"><img src="./screenshots/webspeak-de.png" alt="WebSpeak deutscher Sprachbereich" width="100%" /></p>

### Audiosteuerung

<p align="center"><img src="./screenshots/webspeak-de-audio.png" alt="WebSpeak deutsche Audiosteuerung" width="100%" /></p>

### Mitgliedermenü

<p align="center"><img src="./screenshots/webspeak-de-menu.png" alt="WebSpeak deutsches Mitgliedermenü" width="100%" /></p>

## 🧩 Erweiterte Funktionen

Diese Funktionen sind optional. Ohne sie arbeitet WebSpeak weiterhin mit dem kompatiblen Sprachtransport. Die Einstellungen befinden sich unter **Administration → Server** und gelten für neue Verbindungen.

### WebRTC-Sprache mit niedriger Latenz

WebRTC verwendet für Browser-Sprache einen Echtzeit-Medienpfad und ermöglicht außerdem Desktop-Begleitton. Das aktuelle WebSpeak-Gateway stellt WebRTC selbst bereit; ein zusätzlicher Medienserver ist nicht erforderlich.

1. Unter `/admin` anmelden und auf der Seite **Server** die **Erweiterten Einstellungen** öffnen.
2. Bei deaktiviertem WebRTC Start- und Endport für UDP festlegen. Der Standardbereich ist `40000–40099`.
3. Den gesamten UDP-Bereich in Sicherheitsgruppe und Firewall des WebSpeak-Hosts freigeben.
4. **WebRTC** aktivieren und speichern. Nicht unterstützte Browser oder Netzwerke wechseln automatisch zum kompatiblen Transport.

Der Portbereich ist bei aktiviertem WebRTC gesperrt. Zum Ändern WebRTC zuerst deaktivieren und speichern, danach die Firewall-Regeln anpassen. Für öffentliche Bereitstellungen ist HTTPS erforderlich.

### Sprach-WebRTC hinter Reverse Proxy oder TCP-Tunnel

In den erweiterten WebRTC-Einstellungen der Administration lassen sich:

- **Öffentliche Medienadresse**: IP oder Domain, unter der das WebSpeak-Gateway per UDP erreichbar ist; ohne Protokoll, Pfad oder Port. Sie hat Vorrang vor der aus dem Webseiteneintritt abgeleiteten Adresse; bleibt sie leer, wird die Adresse aus `Origin`, `X-Forwarded-Host` oder `Host` abgeleitet. Domains werden in IP-Kandidaten aufgelöst. Eine Proxy-Domain ist nicht automatisch eine Medienadresse.
- **IPv6-Kandidaten aktivieren**: Standardmäßig deaktiviert; bei Aktivierung bleiben IPv4-Kandidaten erhalten und es werden zusätzlich IPv6-Kandidaten gesammelt. Dafür müssen IPv6-Routen bestehen und der UDP-Bereich in der Firewall freigegeben sein.
- **Sprach-STUN-Dienst**: zum Beispiel `stun:turn.teamspeak.com:3478`; Browser und Gateway nutzen denselben Dienst, um ihre öffentliche Abbildung zu ermitteln. Bleibt das Feld leer, gilt das bisherige Verhalten: Das werift-Gateway verwendet den in der Bibliothek eingebauten STUN-Dienst, der Browser keinen. Unterstützt werden derzeit nur per IPv4 erreichbare UDP-STUN-Domains oder IPv4-Adressen; IPv6-Literale, TURN und Zugangsdaten werden nicht akzeptiert. IPv6-Medienkandidaten sind unabhängig vom STUN-Schalter.

Nach dem Speichern neu verbinden. Dass Webseite und WebSocket über den Reverse Proxy erreichbar sind, bedeutet nicht, dass die Medien-UDP-Pakete ankommen; STUN findet nur Adressen, überträgt keinen Ton und garantiert kein NAT-Traversal. Mit nur einem TCP-Tunnel und ohne nutzbaren UDP-/IPv6-Pfad wird weiterhin der kompatible Transport verwendet. Der gesamte konfigurierte UDP-Portbereich sollte freigegeben werden; bei statischer Portweiterleitung muss die Portzuordnung unverändert bleiben.

### ICE-Kandidaten für Bildschirmfreigabe

Die Medien der Bildschirmfreigabe versuchen weiterhin eine direkte Browser-zu-Browser-Verbindung; WebSpeak leitet nur die Signalisierung weiter. Standardmäßig werden die öffentlichen TeamSpeak-STUN-Dienste zur Ermittlung öffentlicher Kandidaten verwendet. STUN überträgt keine Medien. Ein autorisierter externer TURN-Dienst kann über `WEBSPEAK_SCREEN_SHARE_ICE_SERVERS` als JSON-Array konfiguriert werden, zum Beispiel:

```json
[{"urls":"stun:turn.teamspeak.com:3478"},{"urls":"turns:turn.example.com:5349","username":"<username>","credential":"<credential>"}]
```

Mit TURN kann die Medienübertragung diesen externen Dienst verwenden, aber niemals das WebSpeak-Gateway. Ohne TURN werden nur direkte ICE-Pfade und STUN verwendet.

### Plattformübergreifendes P2P-Bildschirmteilen

Browsernutzer und native TeamSpeak-6-Clients können Bildschirmfreigaben gegenseitig erkennen, starten und ansehen. Zwischen Browsern sowie zwischen Browser und nativem Client werden die Bildschirmmedien möglichst über eine direkte WebRTC/ICE-Peer-to-Peer-Verbindung übertragen; WebSpeak übernimmt Sitzungsberechtigung, Freigabestatus und SDP-/ICE-Signalisierung, transportiert aber keine Bildschirmmedien. Die Oberfläche zeigt Live-Status und Zuschauerzahl und bietet Lautstärke-, Vollbild- und Beenden-Steuerung. Für die Aufnahme stehen bis zu 1080p und 60 FPS sowie WebRTC-Statistiken zur Verfügung.

### Abhängigkeiten und Hinweise zur Herkunft

- WebRTC verwendet [werift](https://github.com/shinyoshiaki/werift-webrtc) `0.24.4`; das Upstream-Projekt steht unter MIT-Lizenz.
- Die TeamSpeak-Protokollverbindung verwendet den [EchoSixHIYA/teamspeak-js](https://github.com/EchoSixHIYA/teamspeak-js)-SDK; der Build-Output ist als `vendor/teamspeak-client/` ins Repository eingebracht.

## 🧾 Änderungsprotokoll

> Die folgende Versionshistorie beschreibt die Entwicklung in der Upstream-Ära; dieser Fork hat einige der dort genannten Fähigkeiten entfernt (Beschleunigungs-Relay, Android-Client, Besuchernummerierung).

| Version | Datum | Zusammenfassung |
| --- | --- | --- |
| [v0.2.6](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.6) | 2026-10-08 | Gegenüber 0.2.5 wurden Sprach-Gateway, gemeinsame Protokolle, Sprachoberfläche und Admin-Module umfassend umstrukturiert; #6/#7/#10 behoben, #9/#12 umgesetzt und der in PR #13 gemeldete Fall bereits aktiver TS6-Freigaben behoben. Opus- und Sitzungslebenszyklen sowie mobile Steuerung verbessert. Pakete: Windows x64, Linux x64/ARM64, Docker amd64/arm64 und Android arm64-v8a/armeabi-v7a/x86_64. |
| [v0.2.5](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.5) | 2026-09-27 | `.wskin`-Skins, Aktivierungs-/Standardverwaltung und geschützte Tages-, Nacht- und ILLUSIA-Skins ergänzt; unfertiges Aurora-Voice-Beispiel entfernt, Skin-Ladeblitze, dunkle Bedienelemente und Artwork-Ebenen im Sprachbereich korrigiert sowie offiziellen Skin-Entwicklungs-Agent-Skill hinzugefügt. |
| [v0.2.4](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.4) | 2026-09-22 | Plattformübergreifendes P2P-Bildschirmteilen zwischen Browsern und nativen TeamSpeak-6-Clients ergänzt; STUN-/externes-TURN-Konfiguration, Live-Player und Zuschauerstatus, Aufnahmeoptionen bis 1080p/60 FPS und WebRTC-Statistiken hinzugefügt; Bildschirmfreigabe-Interaktion verbessert und Besucherzählung ergänzt. |
| [v0.2.3](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.3) | 2026-09-19 | Mitgliederplanung und direkte Verschiebung nach Berechtigung ergänzt; Avatar-, Stummschaltstatus- und Identitätsunterstützung hinzugefügt; Screenshots und Dokumentation für alle fünf Sprachen aktualisiert. |
| [v0.2.2](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.2) | 2026-09-17 | Browserseitige Mikrofon-Geräuschunterdrückung, russische und japanische Oberfläche sowie sprachabhängige Begrüßungstexte ergänzt; Lautstärkeinteraktion und Fehlertexte/-codes auf Basis von PR #2 verbessert. |
| [v0.2.1](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.1) | 2026-09-13 | Verbindungsfehler auf der Willkommensseite verbessert, Fehlercodes erhalten und sicher gekürzt sowie IPv6-Ziele standardmäßig unterstützt. |
| [v0.2.0](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.2.0) | 2026-09-10 | Passwortabfrage, dedizierter Relay-Modus, Auswahl mehrerer Relays und Ursachendarstellung in der Administration ergänzt. |
| [v0.1.8](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.8) | 2026-09-08 | Docker-Bereitstellung vereinfacht, lokale TeamSpeak-Ziele unterstützt, 15-Sekunden-Timeout ergänzt und kontinuierliche Netzwerküberwachung eingeführt. |
| [v0.1.7](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.7) | 2026-09-06 | Deutsch, Telegram, Netzwerkleistung und Gesamtlautstärke ergänzt; Lautstärkeschwankungen beim Begleitton behoben. |
| [v0.1.6](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.6) | 2026-09-04 | Desktop-Begleitton, Hinweise zur gespeicherten Identität und Website-Symbol ergänzt; WebRTC-Mitgliederlautstärke korrigiert. |
| [v0.1.5](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.5) | 2026-09-04 | Identitätsspeicherung korrigiert und Designumschaltung verbessert. |
| [v0.1.4](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.4) | 2026-09-03 | WebRTC und Kanalchat korrigiert sowie Administration, Protokolle und Mobilansicht verbessert. |
| [v0.1.3](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/tag/v0.1.3) | 2026-09-03 | Integriertes WebRTC, aktualisiertes TeamSpeak-SDK und bessere Mitgliedersynchronisierung und Sprachpufferung. |

Vollständige Historie: [CHANGELOG.md](../CHANGELOG.md).

## 🚀 Bereitstellung

| Methode | Geeignet für | Umgebung |
| --- | --- | --- |
| Docker Compose (empfohlen) | Dauerbetrieb, einfache Updates und persistente Daten | Docker Engine + Docker Compose |
| Release-Paket | Betrieb ohne Node.js und Build-Werkzeuge | Windows x64 oder Linux x64/ARM64 |
| Aus dem Quellcode | Entwicklung und Anpassungen | Node.js 22.5+, Git und native Build-Werkzeuge |

### Docker Compose (empfohlen)

```bash
git clone --depth 1 https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak.git
cd WebSpeak-client-for-TeamSpeak
docker compose pull
docker compose up -d
```

Nach dem Start ist WebSpeak unter `http://<dein-host>:3040` erreichbar. Bei einem Reverse Proxy auf diese Adresse zeigen und `WEBSPEAK_TRUST_PROXY=1` setzen, damit Begrenzung und Protokoll die echte Client-Adresse sehen und hinter dem Proxy terminiertes HTTPS sichere Cookies behält. Für WebRTC den im Adminbereich angezeigten UDP-Bereich freigeben. Die Daten liegen im Volume `webspeak-data`.

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

`docker compose down -v` nicht ausführen, da dadurch Datenbank und Administratoreinstellungen gelöscht werden.

### Release-Paket

Das passende `windows-x64.zip`, `linux-x64.tar.gz` oder `linux-arm64.tar.gz` aus den [GitHub Releases](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/releases/latest) herunterladen und den enthaltenen Starter ausführen. Die Pakete enthalten Node.js und Produktionsabhängigkeiten. Docker unterstützt amd64/arm64.


### Aus dem Quellcode

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

Für den Bau von `@discordjs/opus` werden Python, Make und eine C/C++-Toolchain benötigt.

### Erste Konfiguration

1. `http://<dein-host>:3040/admin` öffnen.
2. Das einmalige Setup-Token aus dem Dienstprotokoll des ersten Starts lesen (`Admin setup token: ws-setup-…`), damit bei `/admin` anmelden und sofort ein neues Passwort mit mindestens 12 Zeichen setzen; danach wird das Token ungültig.
3. Unter **Server** TeamSpeak-Ziel und Zugriffsmethode konfigurieren, zum Beispiel `voice.example.com#9987`.
4. Für öffentliche Nutzung HTTPS einrichten; bei aktiviertem WebRTC den im Adminbereich angezeigten UDP-Bereich freigeben.

### Häufige Fragen

- **„Vom TeamSpeak-Server gebannt“ nach Aktualisierung oder Netzabbruch**: Das ist der Anti-Flood-Schutz des TeamSpeak-Servers bei schnellen Wiederanläufen; er ist temporär (meist wenige Minuten) — kurz warten und erneut versuchen. WebSpeak hält die Sitzung nach einem Abbruch 60 Sekunden lang — eine Aktualisierung oder Netzrückkehr führt direkt zurück in den Raum, ohne dass TeamSpeak neu verbindet; ein bewusstes Trennen verlässt sofort.
- **Client-IPs im Log sind alle 127.0.0.1**: Das Gateway ignoriert Weiterleitungs-Header, solange kein Proxy als vertrauenswürdig deklariert ist. Hinter einem Reverse Proxy `WEBSPEAK_TRUST_PROXY=1` setzen und den Header `X-Forwarded-For` durchreichen (nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). Das Gateway meldet diese Fehlkonfiguration einmalig im Log.
- **Wie komme ich nach einer Aktualisierung zurück in den Raum?**: Innerhalb von 60 Sekunden wird die Sitzung automatisch fortgesetzt — ohne erneute Passworteingabe. Ein Klick auf „Trennen“ verlässt sofort und löscht die Wiederanlauf-Informationen.

## ⚠️ Voraussetzungen und Hinweise

| Bereich | Hinweis |
| --- | --- |
| Browser | Aktuelles Chrome, Edge oder ein moderner WebRTC-fähiger Browser wird empfohlen. Mikrofon- und Fenster-Audio benötigen normalerweise HTTPS. |
| TeamSpeak-Netzwerk | Der WebSpeak-Host muss den Zielserver erreichen können; der Standard-Sprachport ist `9987`. |
| Webnetzwerk | Der Dienst verwendet `3040/TCP`; öffentlich sollte ein HTTPS-Reverse-Proxy für Seite und WebSocket verwendet werden. |
| IPv6 | Literale Ziele als `[2001:db8::1]#9987` eintragen. Host/Container benötigen geroutetes IPv6, aktiviertes IPv6 in Betriebssystem und Node.js sowie passende Firewall-Regeln. |
| WebRTC | Standardbereich `40000–40099/UDP`; den gesamten Bereich freigeben und WebRTC vor einer Änderung deaktivieren. |
| Gespeicherte Identität | Eine Browseridentität kann nur eine aktive gespeicherte Verbindung halten. Für parallele Verbindungen deaktivieren oder ein anderes Browserprofil verwenden. |
| Begleitton | Nur auf dem Desktop verfügbar und WebRTC erforderlich. Bei Fenster- oder Tab-Freigabe auch Audio freigeben. |
| Daten | Docker verwendet `webspeak-data`; Release-Pakete und Quellcode verwenden `data/`. Vor Updates sichern. |
| Sitzungslimit | Eine Instanz akzeptiert bis zu 100 aktive Browser-Sitzungen. |

## Kürzlich zusammengeführte Beiträge

- Die Liste folgt den GitHub-Merge-Einträgen; die Versionszusammenfassungen oben nennen nur Änderungen, die in der jeweiligen Version enthalten sind.
- [LainHE](https://github.com/LainHE) — [PR #2](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/pull/2) verbesserte Browser-Fehlermeldungen; [PR #8](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/pull/8) korrigierte Skalierung, schwebendes Layout und Fußzeile der Startseite.
- [TimmySheep](https://github.com/TimmySheep) — [zusammengeführte PRs #13 und #15–#24](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/pulls?q=is%3Apr+is%3Amerged+author%3ATimmySheep) zu vorhandenen TS6-Freigaben, Seitenverhältnis, mobiler Sprache/Bildschirm-Wachhalten/Skin-Menü, Kanaloptionen der Identität, PWA/Design, Chatverlauf, Mitglieder-Audiozuständen und Mikrofonberechtigungen.
- [yichen11818](https://github.com/yichen11818) — [PR #25](https://github.com/wslinnn/WebSpeak-client-for-TeamSpeak/pull/25) ermöglichte Verbindungen über registrierte TeamSpeak-Nicknames und bewahrte Nickname-Ziele in Einstellungen, Favoriten und Einladungen.
