import type { Logger } from "../logger.js";
import { formatTeamSpeakTarget, teamSpeakTargetKey } from "../domain/teamspeak-target.js";
import type { ScreenShareParticipant } from "./screen-share-coordinator.js";

// Native-discovery scan bounds (报告 21 F4)：全服成员逐个 requeststreaminfo 时，
// 单命令超时压到 3s（SDK 默认 10s），并发度封顶 8。
const DISCOVERY_COMMAND_TIMEOUT_MS = 3_000;
const DISCOVERY_CONCURRENCY = 8;

/**
 * A gateway session can connect after a native TeamSpeak stream has already
 * started. TS6 does not replay that stream in the normal welcome snapshot;
 * requeststreaminfo is the official client-protocol query for this case.
 * Rescan on each connection. Concurrent requests for the same server share
 * one running pass and one pending pass using the latest session directory.
 */
export function createScreenShareDiscovery(
  entries: ReadonlyMap<string, ScreenShareParticipant>,
  logger: Pick<Logger, "debug" | "warn">,
): { discover: (entry: ScreenShareParticipant) => Promise<void> } {
  const discoveries = new Map<string, {
    pendingEntry: ScreenShareParticipant | undefined;
    completion: Promise<void>;
  }>();

  const discover = (entry: ScreenShareParticipant): Promise<void> => {
    const targetKey = teamSpeakTargetKey(entry.target);
    const active = discoveries.get(targetKey);
    if (active) {
      active.pendingEntry = entry;
      return active.completion;
    }
    const discovery = {
      pendingEntry: entry as ScreenShareParticipant | undefined,
      completion: Promise.resolve(),
    };
    discovery.completion = Promise.resolve().then(async () => {
      try {
        while (discovery.pendingEntry) {
          const requestedEntry = discovery.pendingEntry;
          discovery.pendingEntry = undefined;
          const queryEntry = entries.get(requestedEntry.id) === requestedEntry && requestedEntry.tsClient.isConnected()
            ? requestedEntry
            : [...entries.values()].find(candidate => teamSpeakTargetKey(candidate.target) === targetKey && candidate.tsClient.isConnected());
          if (!queryEntry) continue;
          const clientIds = [...queryEntry.members.keys()].filter(clientId => Number.isInteger(clientId) && clientId > 0);
          // 全服成员逐个查询：并发度封顶、每条命令带显式超时——否则一条不应答
          // 的命令按 SDK 默认 10s 拖住整个 pass，时长随成员数线性（报告 21 F4）。
          let cursor = 0;
          const isCurrentQuery = () => entries.get(queryEntry.id) === queryEntry && queryEntry.tsClient.isConnected();
          const worker = async (): Promise<void> => {
            while (cursor < clientIds.length) {
              if (!isCurrentQuery()) return;
              const clientId = clientIds[cursor]!;
              cursor += 1;
              try {
                await queryEntry.tsClient.sendProtocolCommand(`requeststreaminfo clid=${clientId}`, DISCOVERY_COMMAND_TIMEOUT_MS);
              } catch (error: unknown) {
                logger.debug({
                  target: formatTeamSpeakTarget(queryEntry.target),
                  clientId,
                  err: error instanceof Error ? error.message : String(error),
                }, "Could not query existing TeamSpeak screen stream");
              }
            }
          };
          await Promise.all(Array.from(
            { length: Math.min(DISCOVERY_CONCURRENCY, clientIds.length) },
            () => worker(),
          ));
        }
      } finally {
        discoveries.delete(targetKey);
      }
    });
    discoveries.set(targetKey, discovery);
    return discovery.completion;
  };

  return { discover };
}
