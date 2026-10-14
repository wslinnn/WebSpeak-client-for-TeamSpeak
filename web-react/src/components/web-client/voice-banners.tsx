import { useEffect, useRef, useState } from "react";

import { Icon } from "./icon";
import type { PokeNotification } from "@/voice/session-state";

interface VoiceBannersProps {
  reconnecting: boolean;
  reconnectFailed: boolean;
  reconnectAttempt: number;
  error: string;
  pokes: readonly PokeNotification[];
  switchPending: string | null;
  switchFailed: string | null;
  playNotification(kind: "poke"): void;
  onReconnect(): void;
  onLeave(): void;
  t(key: string, variables?: Record<string, string | number>): string;
}

const POKE_VISIBLE_MS = 9_000;

/** 壳级状态横幅（旧 voice-banners 平价）：断线/切服横幅与 poke 提示。放在
 *  .workspace 之外，移动端页签切换藏不住它们。poke 同屏最新三条、9 秒自动消退；
 *  到达时的提示音是纯外部副作用，dismissed 集合只在计时回调里落账。 */
export function VoiceBanners(props: VoiceBannersProps) {
  const { reconnecting, reconnectFailed, pokes, switchPending, switchFailed, playNotification, t } = props;
  const [dismissedPokes, setDismissedPokes] = useState<ReadonlySet<string>>(() => new Set());
  const pokeTimers = useRef(new Map<string, number>());
  const lastPokeLength = useRef(pokes.length);
  useEffect(() => {
    const length = pokes.length;
    if (length === lastPokeLength.current) return;
    const grew = length > lastPokeLength.current;
    lastPokeLength.current = length;
    if (!grew) return;
    const latest = pokes[length - 1];
    if (!latest) return;
    playNotification("poke");
    const timer = window.setTimeout(() => {
      setDismissedPokes((previous) => new Set(previous).add(latest.id));
      pokeTimers.current.delete(latest.id);
    }, POKE_VISIBLE_MS);
    pokeTimers.current.set(latest.id, timer);
  }, [pokes, playNotification]);
  useEffect(() => {
    const timers = pokeTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);
  const visiblePokes = pokes.slice(-3).filter((poke) => !dismissedPokes.has(poke.id));

  return (
    <div className="voice-banners" data-ws-part="voice.banners">
      {(reconnecting || reconnectFailed) && (
        <div
          className={reconnectFailed ? "reconnect-banner failed" : "reconnect-banner"}
          data-ws-part="voice.connection-status"
          role={reconnectFailed ? "alert" : "status"}
        >
          <div className="reconnect-copy">
            <strong>{reconnectFailed ? t("reconnectFailed") : t("connectionInterrupted")}</strong>
            {reconnecting
              ? <span>{t("reconnectingAttempt", { attempt: props.reconnectAttempt })}</span>
              : <span>{props.error}</span>}
          </div>
          <div className="reconnect-actions">
            {reconnectFailed && (
              <button type="button" className="secondary-button" onClick={props.onReconnect}>{t("reconnectNow")}</button>
            )}
            <button type="button" className="text-button" onClick={props.onLeave}>{t("back")}</button>
          </div>
        </div>
      )}
      {switchPending && (
        <div className="favorite-switch-banner" data-ws-part="voice.favorite-switch-banner" role="status" aria-live="polite">
          <div className="reconnect-copy"><strong>{t("switchingToServer", { name: switchPending })}</strong></div>
        </div>
      )}
      {switchFailed && (
        <div className="favorite-switch-banner" data-ws-part="voice.favorite-switch-banner" role="status" aria-live="polite">
          <div className="reconnect-copy"><strong>{t("switchToServerFailed", { name: switchFailed })}</strong></div>
          <div className="reconnect-actions">
            <button type="button" className="secondary-button" onClick={props.onLeave}>{t("back")}</button>
          </div>
        </div>
      )}
      {visiblePokes.map((poke) => (
        <div key={poke.id} className="poke-banner" data-ws-part="voice.poke" role="status">
          <Icon name="bell" size={17} />
          <span>
            <strong>{poke.invokerName}</strong>
            {" "}
            {t("pokedYou")}
            {poke.message && <small>{t("pokeMessageSuffix", { message: poke.message })}</small>}
          </span>
          <button
            type="button"
            onClick={() => {
              const timer = pokeTimers.current.get(poke.id);
              if (timer !== undefined) window.clearTimeout(timer);
              pokeTimers.current.delete(poke.id);
              setDismissedPokes((previous) => new Set(previous).add(poke.id));
            }}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
