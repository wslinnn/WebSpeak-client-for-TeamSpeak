/** Lab page markup and its same-origin script. Split out of rtp-lab.ts to
 *  keep the route/session module under the per-file line budget; the strings
 *  carry no state and are rendered once per request. */
export function labPage(iceServers: Array<{ urls: string }>): string {
  // ICE config rides a data attribute into the external script: the JSON only
  // ever contains STUN URLs, but escape single quotes defensively anyway.
  const iceServersAttr = JSON.stringify(iceServers).replaceAll("'", "&#39;");
  return `<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><title>RTP Lab</title>
<style>
body { font: 14px/1.6 system-ui, sans-serif; max-width: 720px; margin: 24px auto; color: #222; }
fieldset { margin: 12px 0; border: 1px solid #ccc; border-radius: 8px; }
label { margin-right: 14px; }
button { padding: 6px 14px; }
pre { background: #f6f6f6; padding: 10px; border-radius: 8px; min-height: 200px; white-space: pre-wrap; }
</style></head>
<body data-ice-servers='${iceServersAttr}'>
<h1>RTP 隔离实验室</h1>
<p>本页面与网关直连 WebRTC（不经 TeamSpeak），网关播放可切换特征的测试音。逐个模式切换并听：哪个模式静音，即锁定元凶特征。</p>
<p><button id="start">开始连接</button> <button id="apply" disabled>应用模式</button> <button id="stop" disabled>停止</button></p>
<fieldset><legend>声道</legend>
  <label><input type="radio" name="channels" value="2" checked>立体声</label>
  <label><input type="radio" name="channels" value="1">单声道</label>
</fieldset>
<fieldset><legend>节奏</legend>
  <label><input type="radio" name="pacing" value="burst" checked>TS 突发（成对帧+间隙）</label>
  <label><input type="radio" name="pacing" value="even">匀速 20ms</label>
</fieldset>
<fieldset><legend>停顿策略（词间静音）</legend>
  <label><input type="radio" name="silence" value="frames" checked>发 3 字节静音帧</label>
  <label><input type="radio" name="silence" value="none">完全停发</label>
</fieldset>
<fieldset><legend>播放方式（语音房静音判别：切换后需刷新页面）</legend>
  <label><input type="radio" name="sink" value="element" checked>直连 audio 元素</label>
  <label><input type="radio" name="sink" value="graph">Web Audio 图（复刻语音房）</label>
</fieldset>
<fieldset><legend>麦克风 audio-level 探针（开始连接时请求麦克风）</legend>
  <pre id="level" style="min-height:60px;margin:0">未连接</pre>
</fieldset>
<pre id="log"></pre>
<script src="/_rtp-lab/lab.js"></script>
</body>
</html>`;
}

export function labScript(): string {
  return `const logEl = document.getElementById("log");
const levelEl = document.getElementById("level");
const log = (msg) => { logEl.textContent += msg + "\\n"; };
// Created inside the click handler so Web Audio has sticky user activation.
let audioCtx = null;
let started = false;
const ICE_SERVERS = JSON.parse(document.body.dataset.iceServers || "[]");
const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
peer.onconnectionstatechange = () => log("peer: " + peer.connectionState);
function sinkMode() {
  const el = document.querySelector('input[name="sink"]:checked');
  return el ? el.value : "element";
}
document.querySelectorAll('input[name="sink"]').forEach(radio => {
  radio.addEventListener("change", () => { if (started) log("播放方式已选 " + sinkMode() + "（切换需刷新页面）"); });
});
peer.ontrack = (event) => {
  const trackStream = new MediaStream([event.track]);
  const ctx = audioCtx ?? new AudioContext();
  const useGraph = sinkMode() === "graph";
  log("sink: " + (useGraph ? "Web Audio 图（复刻语音房）" : "直连元素") + " ctx=" + ctx.state);
  let analyser;
  if (useGraph) {
    // Replicates the voice room's sink shape: track → source → gain →
    // analyser → master → MediaStreamDestination → hidden element. If the
    // context is not rendering, the room-side symptom (buffer never drains,
    // packetsDiscarded≈packetsReceived) reproduces here.
    const source = ctx.createMediaStreamSource(trackStream);
    const gain = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    const master = ctx.createGain();
    const destination = ctx.createMediaStreamDestination();
    source.connect(gain);
    gain.connect(analyser);
    gain.connect(master);
    master.connect(destination);
    const hidden = document.createElement("audio");
    hidden.autoplay = true;
    hidden.muted = false;
    hidden.setAttribute("playsinline", "");
    hidden.setAttribute("aria-hidden", "true");
    hidden.tabIndex = -1;
    hidden.style.position = "fixed";
    hidden.style.width = "1px";
    hidden.style.height = "1px";
    hidden.style.opacity = "0";
    hidden.style.pointerEvents = "none";
    hidden.srcObject = destination.stream;
    document.body.append(hidden);
    hidden.play().then(() => log("graph element playing")).catch(e => log("graph play blocked: " + e.message));
    window.__labGraph = { ctx, source, gain, master, destination, analyser };
  } else {
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.srcObject = trackStream;
    document.body.append(audio);
    audio.play().catch(e => log("play blocked: " + e.message));
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(trackStream).connect(analyser);
  }
  const samples = new Float32Array(analyser.fftSize);
  setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    log("analyserRMS=" + Math.sqrt(sum / samples.length).toFixed(5) + " ctx=" + ctx.state);
  }, 1500);
  setInterval(async () => {
    const report = await peer.getStats();
    report.forEach(s => {
      if (s.type === "inbound-rtp" && s.kind === "audio") {
        log(\`inbound: packets=\${s.packetsReceived} discarded=\${s.packetsDiscarded ?? 0} lost=\${s.packetsLost} audioLevel=\${s.audioLevel} totalSamples=\${s.totalSamplesReceived}\`);
      }
    });
  }, 3000);
};
async function start() {
  // Downlink only: one recvonly m-line for the gateway's sendonly track.
  peer.addTransceiver("audio", { direction: "recvonly" });
  // Optional uplink probe: a second m-line carries the microphone so the
  // gateway can report RFC 6464 audio-level values for threshold calibration.
  try {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    const micTrack = mic.getAudioTracks()[0];
    if (micTrack) {
      peer.addTransceiver(micTrack, { direction: "sendrecv" });
      log("mic: " + (micTrack.label || "default") + "（audio-level 探针已接入）");
    }
  } catch (e) {
    log("mic unavailable: " + (e.message ?? e) + "（audio-level 探针不可用）");
  }
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await new Promise(resolve => {
    if (peer.iceGatheringState === "complete") return resolve();
    peer.addEventListener("icegatheringstatechange", () => { if (peer.iceGatheringState === "complete") resolve(); });
    setTimeout(resolve, 4000);
  });
  const response = await fetch("/_rtp-lab/offer", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(peer.localDescription),
  });
  if (!response.ok) { log("offer failed: " + response.status); return; }
  const answer = await response.json();
  await peer.setRemoteDescription(answer);
  log("negotiated — tone should be audible");
}
function startLevelPoll() {
  setInterval(async () => {
    try {
      const response = await fetch("/_rtp-lab/level");
      if (!response.ok) return;
      const data = await response.json();
      const session = data.sessions && data.sessions[data.sessions.length - 1];
      if (!session) { levelEl.textContent = "无会话"; return; }
      levelEl.textContent = "level=" + (session.level ?? "—") + "（0 最响 / 127 静音）  v=" + session.voiced
        + "  parsed=" + session.parsed + "/" + session.frames;
    } catch { /* the page is going away */ }
  }, 500);
}
document.getElementById("start").addEventListener("click", async () => {
  if (started) return;
  started = true;
  document.getElementById("apply").disabled = false;
  document.getElementById("stop").disabled = false;
  startLevelPoll();
  try { audioCtx = new AudioContext(); await audioCtx.resume(); } catch (e) { log("audioCtx: " + e.message); }
  start().catch(e => log("error: " + (e.message ?? e)));
});
function readMode() {
  const value = (name) => document.querySelector(\`input[name=\${name}]:checked\`).value;
  return { channels: Number(value("channels")), pacing: value("pacing"), silence: value("silence") };
}
document.getElementById("apply").addEventListener("click", async () => {
  const mode = readMode();
  const response = await fetch("/_rtp-lab/mode", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mode),
  });
  log("mode → " + JSON.stringify((await response.json()).mode));
});
document.getElementById("stop").addEventListener("click", async () => {
  await fetch("/_rtp-lab/mode", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pacing: "stopped", channels: 1, silence: "frames" }) });
  log("stopped");
});
window.__lab = {
  get peer() { return peer; },
  get audioCtx() { return audioCtx; },
};`;
}
