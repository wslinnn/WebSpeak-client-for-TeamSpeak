import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "./icon";
import { VoiceDegradedBanners } from "./voice-degraded-banners";
import type { PokeNotification } from "@/voice/session-state";

interface VoiceBannersProps {
  reconnecting: boolean;
  reconnectFailed: boolean;
  reconnectAttempt: number;
  error: string;
  audioNotice: string;
  audioNoticeCode: string;
  /** × 关闭必须带当前代码：闭锁按代码落，无参清除会把闭锁一并清掉（关不掉）。 */
  onClearAudioNotice(code: string): void;
  microphoneError: string;
  microphoneErrorCode: string;
  onClearMicrophoneError(): void;
  pokes: readonly PokeNotification[];
  switchPending: string | null;
  switchFailed: string | null;
  playNotification(kind: "poke"): void;
  onReconnect(): void;
  onLeave(): void;
  t(key: string, variables?: Record<string, string | number>): string;
  localizedMessage(message: string): string;
  localizedAudioNotice(code: string, message: string): string;
  localizedMicrophoneError(code: string, message: string): string;
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
        <Alert
          variant={reconnectFailed ? "destructive" : "warning"}
          className="reconnect-banner"
          data-ws-part="voice.connection-status"
          role={reconnectFailed ? "alert" : "status"}
        >
          <div className="reconnect-copy">
            <AlertTitle>{reconnectFailed ? t("reconnectFailed") : t("connectionInterrupted")}</AlertTitle>
            {reconnecting
              ? <AlertDescription>{t("reconnectingAttempt", { attempt: props.reconnectAttempt })}</AlertDescription>
              : <AlertDescription>{props.error}</AlertDescription>}
          </div>
          <div className="reconnect-actions">
            {reconnectFailed && (
              <Button type="button" variant="outline" onClick={props.onReconnect}>{t("reconnectNow")}</Button>
            )}
            <Button type="button" variant="ghost" onClick={props.onLeave}>{t("back")}</Button>
          </div>
        </Alert>
      )}
      <VoiceDegradedBanners
        audioNotice={props.audioNotice}
        audioNoticeCode={props.audioNoticeCode}
        onClearAudioNotice={props.onClearAudioNotice}
        microphoneError={props.microphoneError}
        microphoneErrorCode={props.microphoneErrorCode}
        onClearMicrophoneError={props.onClearMicrophoneError}
        t={t}
        localizedAudioNotice={props.localizedAudioNotice}
        localizedMicrophoneError={props.localizedMicrophoneError}
      />
      {switchPending && (
        <Alert className="favorite-switch-banner" data-ws-part="voice.favorite-switch-banner" role="status" aria-live="polite">
          <div className="reconnect-copy"><AlertTitle>{t("switchingToServer", { name: switchPending })}</AlertTitle></div>
        </Alert>
      )}
      {switchFailed && (
        <Alert className="favorite-switch-banner" data-ws-part="voice.favorite-switch-banner" role="status" aria-live="polite">
          <div className="reconnect-copy">
            <AlertTitle>{t("switchToServerFailed", { name: switchFailed })}</AlertTitle>
            {props.error && <AlertDescription>{props.localizedMessage(props.error)}</AlertDescription>}
          </div>
          <div className="reconnect-actions">
            <Button type="button" variant="outline" onClick={props.onLeave}>{t("back")}</Button>
          </div>
        </Alert>
      )}
      {visiblePokes.map((poke) => (
        <Alert key={poke.id} variant="warning" className="poke-banner" data-ws-part="voice.poke" role="status">
          <Icon name="bell" size={17} />
          <span>
            <strong>{poke.invokerName}</strong>
            {" "}
            {t("pokedYou")}
            {poke.message && <small>{t("pokeMessageSuffix", { message: poke.message })}</small>}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t("close")}
            onClick={() => {
              const timer = pokeTimers.current.get(poke.id);
              if (timer !== undefined) window.clearTimeout(timer);
              pokeTimers.current.delete(poke.id);
              setDismissedPokes((previous) => new Set(previous).add(poke.id));
            }}
          >
            <Icon name="close" size={15} />
          </Button>
        </Alert>
      ))}
    </div>
  );
}
