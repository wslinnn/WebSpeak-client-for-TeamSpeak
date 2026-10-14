import { DEFAULT_TEAM_SPEAK_PORT, splitTeamSpeakTarget } from "@/services/teamspeak-target";

export interface ServerTarget {
  address: string;
  port: string;
}

/** Join 页初始目标的查询参数解析（旧 WebClient.vue initialServerTarget 平价）：
 *  server/target 显式参数最优先；tsHost/tsPort 次之，缺省回落当前主机名 +
 *  9987。tsPort 显式给出时保留原样（含空串覆盖），不做端口建议改写。 */
export function initialServerTarget(query: URLSearchParams, location: { hostname: string }): ServerTarget {
  const explicit = query.get("server") ?? query.get("target");
  if (explicit?.trim()) return splitTeamSpeakTarget(explicit);
  const host = (query.get("tsHost") ?? location.hostname).trim();
  const port = (query.get("tsPort") ?? DEFAULT_TEAM_SPEAK_PORT).trim();
  const target = splitTeamSpeakTarget(host, port || DEFAULT_TEAM_SPEAK_PORT);
  if (query.has("tsPort")) target.port = port;
  return target;
}
