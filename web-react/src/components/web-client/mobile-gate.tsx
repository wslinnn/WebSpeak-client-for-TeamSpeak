import { Icon } from "./icon";

interface MobileGateProps {
  title: string;
  description: string;
  downloadLabel: string;
  continueLabel: string;
  hint: string;
  onContinue(): void;
}

/** 手机类访客拦截页（旧 MobileGate.vue 平价）：推荐用 PC 或 Android 客户端，
 *  「继续」是一次性选择，由调用方写 webspeak:mobile-gate。文案经 props 传入保持无 i18n 依赖。 */
export function MobileGate({ title, description, downloadLabel, continueLabel, hint, onContinue }: MobileGateProps) {
  return (
    <section className="mobile-gate" data-ws-part="home.mobile-gate">
      <div className="mobile-gate-card">
        <span className="mobile-gate-icon"><Icon name="headset" size={26} /></span>
        <h1>{title}</h1>
        <p className="mobile-gate-copy">{description}</p>
        <div className="mobile-gate-actions">
          <a className="mobile-gate-primary" href="/download">
            <Icon name="download" size={16} />
            {downloadLabel}
          </a>
          <button type="button" className="mobile-gate-continue" onClick={onContinue}>
            <Icon name="monitor" size={16} />
            {continueLabel}
          </button>
        </div>
        <p className="mobile-gate-hint">{hint}</p>
      </div>
    </section>
  );
}
