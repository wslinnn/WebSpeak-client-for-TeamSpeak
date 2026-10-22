import { ActivityIcon, CheckIcon, ServerIcon, UsersIcon } from "lucide-react";
import { Link } from "react-router-dom";

import type { AdminMessages } from "@/i18n/admin-messages";
import type { AdminOverview } from "@/admin/admin-controller";
import { Button } from "@/components/ui/button";

// 旧 AdminView.vue 总览区平价（类名保留，样式在 admin.css）。
export function AdminOverview({ overview, messages, onDismissLegacyNotice }: {
  overview: AdminOverview;
  messages: AdminMessages;
  onDismissLegacyNotice(): void;
}) {
  const { tr, formatDate, formatUptime, eventName } = messages;
  const targetStatusText = overview.teamSpeak.status === "reachable"
    ? tr("reachable")
    : overview.teamSpeak.status === "unreachable" ? tr("unreachable") : tr("notTested");

  return (
    <section className="page-content overview-page">
      {overview.legacyConfigImported && (
        <div className="alert info import-notice">
          <span>{tr("legacyImported")}</span>
          <Button variant="ghost" type="button" onClick={onDismissLegacyNotice}>{tr("gotIt")}</Button>
        </div>
      )}
      <div className="hero-status">
        <div>
          <small>{tr("systemStatus")}</small>
          <h2>{tr("everythingRunning")}</h2>
          <p>{tr("overviewLead")}</p>
        </div>
        <span className="status-badge"><i aria-hidden="true" />{tr("running")}</span>
      </div>
      <div className="metric-grid">
        <article>
          <span><ActivityIcon size={20} aria-hidden="true" /></span>
          <small>{tr("gateway")}</small>
          <strong>{overview.gateway.version || "—"}</strong>
          <em>{formatUptime(overview.gateway.uptimeSeconds)}</em>
        </article>
        <article>
          <span><ServerIcon size={20} aria-hidden="true" /></span>
          <small>{tr("teamSpeakTarget")}</small>
          <strong>{overview.teamSpeak.target || "—"}</strong>
          <em>{targetStatusText}</em>
        </article>
        <article>
          <span><UsersIcon size={20} aria-hidden="true" /></span>
          <small>{tr("activeSessions")}</small>
          <strong>{overview.sessions.active} / {overview.sessions.limit}</strong>
          <em>{tr("peakSessions", { count: overview.sessions.peak })}</em>
        </article>
      </div>
      <div className="overview-columns">
        <article className="overview-card target-health-card">
          <header>
            <div>
              <h3>{tr("targetHealth")}</h3>
              <p>{tr("targetHealthLead")}</p>
            </div>
            <Link to="/admin/server">{tr("manage")}</Link>
          </header>
          <dl>
            <div>
              <dt>{tr("status")}</dt>
              <dd><i className={overview.teamSpeak.status} aria-hidden="true" />{targetStatusText}</dd>
            </div>
            <div>
              <dt>{tr("lastTest")}</dt>
              <dd>{formatDate(overview.teamSpeak.lastTestAt)}</dd>
            </div>
            <div>
              <dt>{tr("latency")}</dt>
              <dd>{overview.teamSpeak.latencyMs == null ? "—" : `${overview.teamSpeak.latencyMs} ms`}</dd>
            </div>
          </dl>
        </article>
        <article className="overview-card recent-events-card">
          <header>
            <div>
              <h3>{tr("recentEvents")}</h3>
              <p>{tr("recentEventsLead")}</p>
            </div>
          </header>
          <ul className="event-list">
            {overview.recentEvents.map((event) => (
              <li key={`${event.event}-${event.createdAt}`}>
                <span><CheckIcon size={14} aria-hidden="true" /></span>
                <div>
                  <strong>{eventName(event.event)}</strong>
                  <small>{formatDate(event.createdAt)}</small>
                </div>
              </li>
            ))}
            {overview.recentEvents.length === 0 && <li className="empty-event">{tr("noRecentEvents")}</li>}
          </ul>
        </article>
      </div>
    </section>
  );
}
