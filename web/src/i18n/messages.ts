import type { Language } from "./web-client-language";

/** Framework-free i18n message layer — the former useWebClientI18n composable
 *  with the Vue Ref flattened into a plain parameter. The React hook layer
 *  subscribes to locale state and delegates here. zh is the source language and
 *  en the only other UI language; the retired de/ru/ja branches were removed
 *  with the language shrink. t() only needs pack[key] ?? key as its fallback
 *  (the parity test guarantees en covers the zh key set). */
export function createWebClientMessages(language: Language, pack: Record<string, string>) {

function t(key: string, variables: Record<string, string | number> = {}) {
  let value = pack[key] ?? key;
  for (const [name, replacement] of Object.entries(variables)) value = value.replaceAll(`{{${name}}}`, String(replacement));
  return value;
}

function localizedMessage(message: string) {
  if (message === "等待 WebSpeak 网关响应超时，请检查网络后重试") return t("joinRequestTimeout");
  if (language === "zh") return message;
  const errorCodeMatch = message.match(/错误代码：([A-Z0-9_-]{1,64})）(?:：([^，。]+))?/);
  if (errorCodeMatch) {
    const code = errorCodeMatch[1];
    const detail = errorCodeMatch[2] ? `: ${errorCodeMatch[2]}` : "";
    const operation = message.startsWith("操作失败");
    return `${operation ? "Operation" : "TeamSpeak connection"} failed (error code: ${code})${detail}. Check your input, network, and server status`;
  }
  const exact: Record<string, string> = {
    "语音功能需要 HTTPS 安全连接：浏览器仅在 https:// 或 localhost 页面开放麦克风，请改用安全地址访问": "Voice features require a secure context: browsers only expose the microphone on https:// or localhost pages. Reopen the site via a secure address",
    "操作超时，请稍后重试": "Operation timed out. Try again shortly",
    "当前浏览器不支持麦克风访问，请更换最新版 Chrome 或 Edge": "This browser does not support microphone access. Switch to an up-to-date Chrome or Edge",
    "当前浏览器不支持 Web Audio 音频处理，请更换最新版 Chrome 或 Edge": "This browser does not support Web Audio processing. Switch to an up-to-date Chrome or Edge",
    "当前浏览器不支持音频解码，兼容传输模式下可能听不到声音，请使用最新版 Chrome 或 Edge": "This browser does not support audio decoding; the compatibility transport may be silent. Use the latest Chrome or Edge",
    "当前浏览器不支持扬声器设备选择，将使用默认输出设备": "Output device selection is not supported by this browser. Using the default output device",
    "所选扬声器当前不可用": "The selected speaker is not available",
    "麦克风设备已断开或权限被回收，采集已停止：请在音频设置中重新选择设备或重新授权": "The microphone was disconnected or permission was revoked and capture has stopped. Re-pick a device or re-grant permission in audio settings",
    "麦克风被系统或浏览器静音，其他成员暂时听不到你": "The microphone is muted by the system or browser — others cannot hear you right now",
    "输出设备将在语音通道建立后生效，当前连接尚未建立音频输出": "The output device takes effect once the voice channel is established; the current connection has no audio output yet",
    "请求来源不受信任，请从正确的网站入口重新打开": "The request origin is not trusted. Reopen the official WebSpeak page",
    "WebSpeak 尚未完成配置，请联系管理员": "WebSpeak has not been configured yet. Contact the administrator",
    "请求过于频繁，请稍后重试": "Too many requests. Try again shortly",
    "TeamSpeak 连接已断开": "The TeamSpeak connection was closed",
    "连接已断开": "The connection was closed",
    "此 TeamSpeak 身份已在另一个浏览器页面使用，请关闭另一条连接或取消“保持身份”后重试": "This TeamSpeak identity is already used by another browser page. Close that connection or clear ‘Remember identity’ and try again",
    "TeamSpeak 服务器地址无效": "The TeamSpeak server address is invalid",
    "昵称长度不符合 TeamSpeak 服务器要求，至少 3 个字符，请修改后重试": "The nickname length does not meet the TeamSpeak server requirements (at least 3 characters). Change it and try again",
    "TeamSpeak 服务器连接失败": "Could not connect to the TeamSpeak server",
    "找不到 TeamSpeak 服务器主机名，请检查地址": "The TeamSpeak server hostname could not be resolved. Check the address",
    "无法到达 TeamSpeak 服务器，请检查网络或地址": "The TeamSpeak server is unreachable. Check the network or address",
    "TeamSpeak 服务器拒绝了连接，请检查端口和服务状态": "The TeamSpeak server refused the connection. Check the port and server status",
    "TeamSpeak 连接被服务器或网络重置，请稍后重试": "The TeamSpeak connection was reset by the server or network. Try again shortly",
    "连接 TeamSpeak 超时，请检查网络或服务器状态": "The TeamSpeak connection timed out. Check the network or server status",
    "该服务器需要密码，请输入密码后重试": "This server requires a password. Enter it and try again",
    "服务器密码错误，请重新输入": "The server password is incorrect. Enter it again",
    "TeamSpeak 协议协商失败": "TeamSpeak protocol negotiation failed",
    "TeamSpeak 服务器拒绝了连接": "The TeamSpeak server rejected the connection",
    "TeamSpeak 连接失败，请检查地址、网络或服务器状态": "TeamSpeak connection failed. Check the address, network, or server status",
    "服务器当前已满，请稍后重试": "The server is full. Try again shortly",
    "服务器当前已满或拒绝了连接，请稍后重试": "The server is full or rejected the connection. Try again shortly",
    "WebSpeak 尚未配置 TeamSpeak 目标。": "The WebSpeak TeamSpeak target has not been configured",
    "此 TeamSpeak 服务器地址不允许连接": "This TeamSpeak server address is not allowed",
    "请输入有效的昵称": "Enter a valid nickname",
    "消息格式无效": "The message format is invalid",
    "请求标识无效": "The request id is invalid",
    "不支持的操作": "This operation is not supported",
    "操作参数无效": "The operation payload is invalid",
    "频道标识无效": "The channel id is invalid",
    "成员标识无效": "The member id is invalid",
    "频道密码无效": "The channel password is invalid",
    "文字消息无效": "The text message is invalid",
    "戳一戳消息无效": "The poke message is invalid",
    "离开状态无效": "The away status is invalid",
    "音频帧格式无效": "The audio frame is invalid",
    "私语目标无效": "The whisper targets are invalid",
    "私语状态无效": "The whisper state is invalid",
    "请先选择私语目标": "Choose a whisper target first",
    "私语目标已离线": "A whisper target is offline",
    "TeamSpeak 会话尚未就绪": "The TeamSpeak session is not ready",
    "频道切换失败": "Channel switch failed",
    "该频道需要密码": "This channel requires a password",
    "该频道已满": "This channel is full",
    "你没有执行此操作的权限": "You do not have permission to perform this action",
    "不能移动自己的客户端": "You cannot move yourself",
    "目标频道不可用": "The target channel is unavailable",
    "成员已离线或当前不可见": "The member is offline or no longer visible",
    "成员已离线": "This member is offline",
    "操作失败": "The operation failed",
    "语音会话票据缺失或已过期，请返回列表重新进入语音空间": "The voice session token is missing or expired. Return to the list and enter the voice space again",
    "语音网关拒绝了本次连接：身份无效，请取消“保持身份”后重新进入": "The voice gateway rejected the connection because the identity is invalid. Clear ‘Remember identity’ and try again",
    "语音网关拒绝了本次连接：身份无效或无法在此页面使用，请取消“保持身份”后重新进入": "The voice gateway rejected the connection because the identity is invalid or unavailable on this page. Clear ‘Remember identity’ and try again",
    "与语音网关的网络连接异常中断（掉线或代理断开），并非 TeamSpeak 服务器拒绝连接，请检查网络后重新进入": "The voice gateway connection was interrupted (offline or proxy disconnected); the TeamSpeak server did not reject it. Check your network and enter again",
    "语音网关会话意外结束，请重新进入语音空间": "The voice gateway session ended unexpectedly. Enter the voice space again",
    "语音网关未能创建 TeamSpeak 客户端（服务器可能已关闭或地址不可达），请确认服务器地址或稍后重试": "The voice gateway could not create a TeamSpeak client. The server may be offline or unreachable; check the address and try again",
    "该昵称已被服务器上的其他用户占用，请更换昵称": "This nickname is already in use on the server. Choose another one",
    "该昵称已被占用，请更换昵称": "This nickname is already in use. Choose another one",
    "你的身份安全等级低于该服务器要求，请提升后重试": "Your identity security level is below what this server requires. Raise it and try again",
    "该身份建立的连接数已达上限，请关闭其他连接后重试": "This identity reached its connection limit. Close the other connections and try again",
    "客户端版本过旧，服务器拒绝连接，请升级后重试": "Your client version is outdated and the server rejected the connection. Update and try again",
    "客户端版本过旧，服务器拒绝了该操作": "Your client version is outdated, so the server rejected this action",
    "操作过于频繁，已被服务器洪水防护暂时拒绝，请稍后重试": "Too many requests: the server flood protection rejected you temporarily. Try again shortly",
    "操作过于频繁，请稍后重试": "Too many requests. Try again shortly",
    "你已被该服务器封禁，无法连接": "You are banned from this server, so the connection is refused",
    "你已被该服务器封禁": "You are banned from this server",
    "你已被服务器移出": "You were removed from the server",
    "TeamSpeak 服务器正在关闭，暂时无法连接": "The TeamSpeak server is shutting down and is unreachable right now",
    "TeamSpeak 服务器未能完成连接初始化，请检查地址、端口或稍后重试": "The TeamSpeak server could not finish initialising the connection. Check the address and port, or try again shortly",
    "TeamSpeak 服务器拒绝了参数，通常是昵称长度或格式不合规": "The TeamSpeak server rejected the parameters, usually because the nickname length or format is invalid",
  };
  if (exact[message]) return exact[message];
  if (message.startsWith("麦克风访问失败：")) return `Microphone access failed: ${message.slice(8)}`;
  if (message.startsWith("切换失败：")) return `Channel switch failed: ${message.slice(5)}`;
  return message;
}

function localizedAudioNotice(code: string, message: string) {
  if (language === "zh") return message;
  const normalizedCode = visibleErrorCode(code || "AUDIO_NOTICE");
  const messages: Record<string, { en: string }> = {
    WEBRTC_FALLBACK: {
      en: `WebRTC realtime voice is unavailable (error code: ${normalizedCode}). Compatibility transport is active; latency and audio quality may be lower`,
    },
    WEBRTC_DISABLED: {
      en: "The gateway has WebRTC disabled; voice uses the compatibility transport (WebSocket). Latency and audio quality may be lower — WebRTC can be enabled in the admin console",
    },
    WEBRTC_UNSUPPORTED: {
      en: "This browser does not support WebRTC; voice uses the compatibility transport (WebSocket). Latency and audio quality may be lower",
    },
    PLAYBACK_BLOCKED: {
      en: "The browser blocked automatic audio playback. Click the page or allow audio playback for this site",
    },
    DEVICE_LIST_UNAVAILABLE: {
      en: "Audio devices could not be listed. The browser default devices will be used",
    },
    OUTPUT_DEVICE_UNAVAILABLE: {
      en: "The selected audio output could not be activated. Check the device connection or choose another speaker",
    },
    AUDIO_CONTEXT_SUSPENDED: {
      en: "Browser audio processing is paused. Click the page once to resume microphone and speaker audio",
    },
    AUDIO_ENCODER_UNAVAILABLE: {
      en: `Microphone audio could not be encoded (error code: ${normalizedCode}). Other members may not hear you`,
    },
  };
  return messages[code]?.en ?? localizedMessage(message);
}

/**
 * Microphone failures arrive as a stable `MIC_*` code plus a zh source
 * message. The code keys the translation (mirroring localizedAudioNotice) so
 * each failure reason gets actionable guidance in the UI language; unknown
 * codes fall back to the message's localized "麦克风访问失败：" prefix.
 */
function localizedMicrophoneError(code: string, message: string) {
  if (language === "zh") return message;
  const micPermission = {
    en: "The browser has not granted microphone access. Click the icon at the left of the address bar, set the microphone permission to Allow, and try again",
  };
  const micNotFound = {
    en: "No usable microphone was found. Check the device connection and make sure microphone access is allowed in the system privacy settings",
  };
  const micOccupied = {
    en: "The microphone could not be started. It may be held by another app (TeamSpeak client, WeChat, Zoom…) or blocked by an exclusive-mode option in the system sound settings",
  };
  const micInterrupted = {
    en: "Starting the microphone was interrupted. Try again",
  };
  const messages: Record<string, { en: string }> = {
    MIC_NOTALLOWEDERROR: micPermission,
    MIC_PERMISSIONDENIEDERROR: micPermission,
    MIC_PERMISSION_DISMISSED: micPermission,
    MIC_SECURITYERROR: {
      en: "The browser blocked microphone access in an insecure context. Open this page via https:// or localhost",
    },
    MIC_NOTFOUNDERROR: micNotFound,
    MIC_DEVICESNOTFOUNDERROR: micNotFound,
    MIC_OVERCONSTRAINEDERROR: {
      en: "The selected microphone is unavailable. Pick another input device in the audio settings",
    },
    MIC_NOTREADABLEERROR: micOccupied,
    MIC_TRACKSTARTERROR: micOccupied,
    MIC_ABORTERROR: micInterrupted,
    MIC_INVALIDSTATEERROR: micInterrupted,
    MIC_TYPEERROR: {
      en: "This page's environment does not allow microphone access. Make sure the site is opened via https:// or localhost",
    },
  };
  const entry = messages[code];
  if (entry) return entry.en;
  const detail = message.startsWith("麦克风访问失败：") ? message.slice(8) : message;
  return `Microphone access failed: ${detail}`;
}

function visibleErrorCode(code: string): string {
  const normalized = String(code || "CONNECTION_FAILED")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (normalized || "CONNECTION_FAILED").slice(0, 64);
}

  return { t, localizedMessage, localizedAudioNotice, localizedMicrophoneError, visibleErrorCode };

}

export type WebClientMessages = ReturnType<typeof createWebClientMessages>;

/** 语言包加载窗口的空转消息集：视图层在真消息就绪前渲染 null（见
 *  useWebClientMessages），此桩只为让解构与 hook 顺序不分支。 */
export const pendingWebClientMessages: WebClientMessages = {
  t: (key) => key,
  localizedMessage: (message) => message,
  localizedAudioNotice: (message) => message,
  localizedMicrophoneError: (_code, message) => message,
  visibleErrorCode: (code) => code,
};
