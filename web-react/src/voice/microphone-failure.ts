/**
 * Browsers only hand out a DOMException name for getUserMedia failures (and an
 * often-English message that used to reach the UI verbatim). Map every name the
 * browsers actually raise to a sentence the user can act on, and keep the
 * DOMException name as the stable failure code. TypeError is the signature of
 * `navigator.mediaDevices` being absent — an insecure (http://, non-localhost)
 * page — so it gets its own guidance instead of the generic fallback.
 *
 * Kept free of browser-only imports so it stays unit-testable under plain node.
 */
const MIC_REASON_PERMISSION = "浏览器未授予麦克风权限：请点击地址栏左侧的站点图标，将麦克风权限改为「允许」后重试";
const MIC_REASON_NOT_FOUND = "未找到可用的麦克风：请检查设备连接，并在系统设置中确认麦克风未被隐私开关关闭";
const MIC_REASON_OCCUPIED = "麦克风无法启动：可能正被其他程序占用（TeamSpeak 客户端、微信、Zoom 等），或在系统声音设置中开启了独占模式，请关闭后重试";
const MIC_REASON_INTERRUPTED = "麦克风启动被中断，请重试";
const MICROPHONE_FAILURE_REASONS: Record<string, string> = {
  NOTALLOWEDERROR: MIC_REASON_PERMISSION,
  PERMISSIONDENIEDERROR: MIC_REASON_PERMISSION,
  PERMISSION_DISMISSED: MIC_REASON_PERMISSION,
  SECURITYERROR: "浏览器在非安全环境下阻止了麦克风访问：请通过 https:// 或 localhost 打开本页",
  NOTFOUNDERROR: MIC_REASON_NOT_FOUND,
  DEVICESNOTFOUNDERROR: MIC_REASON_NOT_FOUND,
  OVERCONSTRAINEDERROR: "所选麦克风当前不可用：请在音频设置中改用其他输入设备",
  NOTREADABLEERROR: MIC_REASON_OCCUPIED,
  TRACKSTARTERROR: MIC_REASON_OCCUPIED,
  ABORTERROR: MIC_REASON_INTERRUPTED,
  INVALIDSTATEERROR: MIC_REASON_INTERRUPTED,
  TYPEERROR: "当前页面环境不允许麦克风访问：请确认通过 https:// 或 localhost 访问本站",
};

const MICROPHONE_FAILURE_FALLBACK = "麦克风不可用，请检查浏览器权限与音频设备";

const MICROPHONE_FAILURE_CODE_PREFIX = "MIC_";

/** Same shape as the composable's safeClientErrorCode, bounded to the name slot. */
function safeMicrophoneErrorCode(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Turn a getUserMedia / DOMException failure into a stable code plus a readable sentence. */
export function normalizeMicrophoneFailure(error: unknown): { code: string; message: string } {
  const rawName = error instanceof Error ? String(error.name || "") : "";
  const name = safeMicrophoneErrorCode(rawName);
  const reason = MICROPHONE_FAILURE_REASONS[name] ?? MICROPHONE_FAILURE_FALLBACK;
  return { code: `${MICROPHONE_FAILURE_CODE_PREFIX}${name || "UNAVAILABLE"}`, message: `麦克风访问失败：${reason}` };
}
