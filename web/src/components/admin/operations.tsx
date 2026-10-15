import { ActivityIcon, CheckIcon, InfoIcon, RefreshCwIcon, UsersIcon } from "lucide-react";
import { useStore } from "zustand";

import type { AdminMessages } from "@/i18n/admin-messages";
import type { OperationsController } from "@/admin/operations-controller";
import type { AdminConnectionRecord } from "@shared/admin-responses";

// 旧 AdminOperations.vue 平价。诊断报告直下（普通链接，无 api 封装）沿用旧语义。
export function AdminOperations({ model, messages }: {
  model: OperationsController;
  messages: AdminMessages;
}) {
  const { tr, formatDate, formatAge, sessionStateLabel, connectionStatusLabel, eventName, connectionFailureText } = messages;
  const operations = useStore(model.store);
  const { loading, terminating } = operations;

  const connectionRoute = (record: AdminConnectionRecord) =>
    tr("connectionFromTo", { ip: record.clientIp || "—", target: record.target || "—" });
  const formatContext = (context: Record<string, string | number | boolean>) =>
    Object.entries(context).map(([key, value]) => `${key}=${value}`).join(" · ");

  return (
    <section className="page-content operations-page">
      <div className="page-heading">
        <div>
          <h2>{tr("operations")}</h2>
          <p>{tr("operationsLead")}</p>
        </div>
        <button className="secondary-button" disabled={loading} onClick={() => void model.loadOperations()}>
          {loading ? <span className="spinner small" aria-hidden="true" /> : <RefreshCwIcon size={17} aria-hidden="true" />}
          {tr("refresh")}
        </button>
      </div>
      <div className="alert info system-notice">
        <InfoIcon size={16} aria-hidden="true" />
        <span>{tr("updateNotice", { version: operations.diagnostics.version || "—" })}</span>
      </div>
      <div className="operations-grid operations-primary">
        <article className="operation-card operation-wide">
          <header>
            <div>
              <h3>{tr("sessions")}</h3>
              <p>{tr("sessionsLead")}</p>
            </div>
            <strong>{operations.sessions.length}</strong>
          </header>
          {operations.sessions.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{tr("nickname")}</th>
                    <th>{tr("sessionState")}</th>
                    <th>{tr("age")}</th>
                    <th>{tr("memberCount")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {operations.sessions.map((session) => (
                    <tr key={session.id}>
                      <td>
                        <strong>{session.nickname}</strong>
                        <small>{session.target}</small>
                      </td>
                      <td><span className="state-pill">{sessionStateLabel(session.state)}</span></td>
                      <td>{formatAge(session.ageSeconds)}</td>
                      <td>{session.memberCount}</td>
                      <td>
                        <button className="danger-button" type="button" disabled={Boolean(terminating)}
                          onClick={() => void model.terminateSession(session)}>
                          {terminating === session.id ? tr("terminating") : tr("endSession")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="operation-empty">
              <UsersIcon size={22} aria-hidden="true" />
              <span>{tr("sessionEmpty")}</span>
            </div>
          )}
        </article>
      </div>
      <div className="operations-grid lower-operations">
        <article className="operation-card diagnostics-card">
          <header>
            <div>
              <h3>{tr("diagnostics")}</h3>
              <p>{tr("diagnosticsLead")}</p>
            </div>
            <a className="text-link" href="/api/admin/diagnostics/report">{tr("downloadReport")}</a>
          </header>
          <dl className="diagnostic-list">
            <div>
              <dt>{tr("version")}</dt>
              <dd>{operations.diagnostics.version || "—"}</dd>
            </div>
            <div>
              <dt>{tr("runtime")}</dt>
              <dd>{operations.diagnostics.node || "—"}</dd>
            </div>
            <div>
              <dt>{tr("platform")}</dt>
              <dd>{operations.diagnostics.platform || "—"} / {operations.diagnostics.arch || "—"}</dd>
            </div>
            <div>
              <dt>{tr("databaseSchema")}</dt>
              <dd>v{operations.diagnostics.schemaVersion || "—"}</dd>
            </div>
            <div>
              <dt>{tr("createdSessions")}</dt>
              <dd>{operations.diagnostics.createdSessions}</dd>
            </div>
            <div>
              <dt>{tr("gatewayMemory")}</dt>
              <dd>{operations.diagnostics.rssMb != null ? `${operations.diagnostics.rssMb} MB` : "—"}</dd>
            </div>
            <div>
              <dt>{tr("pcmFallbackShare")}</dt>
              <dd>{operations.diagnostics.voiceTransports
                ? `${(operations.diagnostics.voiceTransports.compatRatio * 100).toFixed(1)}% (${operations.diagnostics.voiceTransports.compat}/${operations.diagnostics.voiceTransports.connected})`
                : "—"}</dd>
            </div>
          </dl>
          <button className="secondary-button" type="button" onClick={() => void model.downloadBackup()}>
            {tr("exportBackup")}
          </button>
        </article>
        <article className="operation-card logs-card">
          <header>
            <div>
              <h3>{tr("logViewer")}</h3>
              <p>{tr("logViewerLead")}</p>
            </div>
            {!operations.logs.available && <span className="muted-label">{tr("logsUnavailable")}</span>}
          </header>
          {operations.logs.sessions.length > 0 && (
            <div className="connection-list">
              <div className="connection-history-heading">
                <strong>{tr("connectionHistory")}</strong>
                <small>{tr("connectionHistoryLead")}</small>
              </div>
              {operations.logs.sessions.map((record) => (
                <div key={record.id} className="connection-row">
                  <div className="connection-person">
                    <strong>{record.nickname}</strong>
                    <small>{record.target}</small>
                    <small className="connection-route">{connectionRoute(record)}</small>
                  </div>
                  <div className="connection-detail">
                    <span className={["connection-status", record.status].join(" ")}>{connectionStatusLabel(record.status)}</span>
                    <small>{record.connectedAt ? tr("connectedAt") : tr("connectionAttemptedAt")}：{formatDate(record.connectedAt || record.startedAt)}</small>
                    <small>{tr("duration")}：{formatAge(record.durationSeconds)}</small>
                    {record.disconnectedAt && <small>{tr("disconnectedAt")}：{formatDate(record.disconnectedAt)}</small>}
                    {record.reason && <small>{tr("failureReason")}：{connectionFailureText(record.reason)}</small>}
                    {record.failureDetail && <small className="failure-detail">{tr("failureDetail")}：{record.failureDetail}</small>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {operations.logs.entries.length > 0 && (
            <div className="log-list">
              {operations.logs.entries.map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className="log-row">
                  <span className={["log-level", entry.level.toLowerCase()].join(" ")}>{entry.level}</span>
                  <div>
                    <strong>{entry.message || "—"}</strong>
                    <small>
                      {formatDate(entry.timestamp)}
                      {Object.keys(entry.context).length > 0 && <> · {formatContext(entry.context)}</>}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
          {operations.logs.sessions.length === 0 && operations.logs.entries.length === 0 && (
            <div className="operation-empty">
              <ActivityIcon size={22} aria-hidden="true" />
              <span>{tr("noLogs")}</span>
            </div>
          )}
        </article>
        <article className="operation-card audit-card">
          <header>
            <div>
              <h3>{tr("audit")}</h3>
              <p>{tr("auditLead")}</p>
            </div>
          </header>
          <ul className="event-list">
            {operations.audit.map((event) => (
              <li key={`${event.event}-${event.createdAt}`}>
                <span><CheckIcon size={14} aria-hidden="true" /></span>
                <div>
                  <strong>{eventName(event.event)}</strong>
                  <small>{formatDate(event.createdAt)}</small>
                </div>
              </li>
            ))}
            {operations.audit.length === 0 && <li className="empty-event">{tr("auditEmpty")}</li>}
          </ul>
        </article>
      </div>
    </section>
  );
}
