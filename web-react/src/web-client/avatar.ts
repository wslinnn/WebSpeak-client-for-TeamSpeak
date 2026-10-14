/** 头像工具（旧 WebClient.vue avatarInitial/avatarStyle 平价）：昵称首字符 +
 *  哈希配色；自身带绿色渐变回退，头像 URL 存在时铺满裁切。 */
const AVATAR_COLORS = ["#9edbd4", "#b9d4c5", "#e8c6a8", "#c5c7e8", "#edd2d4", "#c8d9e9", "#e4d3b8"] as const;

export function avatarInitial(name: string): string {
  return (name.trim()[0] || "?").toUpperCase();
}

export function avatarStyle(name: string, isSelf = false, avatar = ""): Record<string, string> {
  const fallback = isSelf ? "linear-gradient(135deg, #4f9e0c, #7ad50a)" : "";
  let hash = 0;
  for (let index = 0; index < name.length; index++) hash = name.charCodeAt(index) + ((hash << 5) - hash);
  return {
    background: fallback || AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!,
    ...(avatar ? { backgroundImage: `url("${avatar}")`, backgroundPosition: "center", backgroundSize: "cover" } : {}),
  };
}
