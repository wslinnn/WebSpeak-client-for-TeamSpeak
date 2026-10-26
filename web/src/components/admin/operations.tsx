import { ActivityIcon, InfoIcon, RefreshCwIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import { AdminEventList } from "@/components/admin/event-list";

import type { AdminMessages } from "@/i18n/admin-messages";
import type { OperationsController } from "@/admin/operations-controller";
import type { AdminConnectionRecord } from "@shared/admin-responses";

type OperationsSection = "sessions" | "logs" | "audit" | "maintenance";
const OPERATIONS_SECTIONS: OperationsSection[] = ["sessions", "logs", "audit", "maintenance"];

function normalizeSection(value: string | null): OperationsSection {
  return value === "logs" || value === "audit" || value === "maintenance" ? value : "sessions";
}

const LOG_FILTER_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"] as const;
type LogFilterLevel = (typeof LOG_FILTER_LEVELS)[number];

// FATAL 按 ERROR 过滤与计数；未知级别（协议扩展兜底）归入 INFO。
function filterLevelOf(level: string): LogFilterLevel {
  if (level === "FATAL") return "ERROR";
  return (LOG_FILTER_LEVELS as readonly string[]).includes(level) ? (level as LogFilterLevel) : "INFO";
}

// 旧 AdminOperations.vue 平价 + 上游 a2f91e6 的分区页签化：section 落在
// ?section= 查询参数（URL 即状态），深链与点击共用一条路。
export function AdminOperations({ model, messages }: {
  model: OperationsController;
  messages: AdminMessages;
}) {
  const { tr, formatDate, formatAge, formatRelative, formatLogTime, logMessage, logContextParts, sessionStateLabel, connectionStatusLabel, connectionFailureText } = messages;
  const operations = useStore(model.store);
  const { loading, terminating } = operations;
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = normalizeSection(searchParams.get("section"));
  const selectSection = (section: OperationsSection) =>
    setSearchParams(section === "sessions" ? {} : { section }, { replace: true });
  const sectionLabels: Record<OperationsSection, string> = {
    sessions: tr("sessions"),
    logs: tr("logViewer"),
    audit: tr("audit"),
    maintenance: tr("diagnostics"),
  };

  // 级别筛选片：默认全开，点片隐藏/显示该级别；条数常显，一眼看出严重度分布。
  const [hiddenLevels, setHiddenLevels] = useState<ReadonlySet<LogFilterLevel>>(() => new Set());
  const levelCounts: Record<LogFilterLevel, number> = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0 };
  for (const entry of operations.logs.entries) levelCounts[filterLevelOf(entry.level)] += 1;
  const visibleEntries = operations.logs.entries.filter((entry) => !hiddenLevels.has(filterLevelOf(entry.level)));
  const toggleLevel = (level: LogFilterLevel) => setHiddenLevels((current) => {
    const next = new Set(current);
    if (next.has(level)) { next.delete(level); } else { next.add(level); }
    return next;
  });

  // 完整起止时刻与 technical 细节收进行悬停提示，行内只留一句话。
  const connectionRowTitle = (record: AdminConnectionRecord) =>
    [
      `${record.connectedAt ? tr("connectedAt") : tr("connectionAttemptedAt")} ${formatDate(record.connectedAt || record.startedAt)}`,
      record.disconnectedAt ? `${tr("disconnectedAt")} ${formatDate(record.disconnectedAt)}` : "",
      record.failureDetail ? `${tr("failureDetail")} ${record.failureDetail}` : "",
    ].filter(Boolean).join(" · ");

  return (
    <section className="page-content operations-page">
      <div className="page-heading">
        <div>
          <h2>{tr("operations")}</h2>
          <p>{tr("operationsLead")}</p>
        </div>
        <Button type="button" variant="outline" disabled={loading} onClick={() => void model.loadOperations()}>
          {loading ? <span className="spinner small" aria-hidden="true" /> : <RefreshCwIcon size={17} aria-hidden="true" />}
          {tr("refresh")}
        </Button>
      </div>
      <div className="alert info system-notice">
        <InfoIcon size={16} aria-hidden="true" />
        <span>{tr("updateNotice", { version: operations.diagnostics.version || "—" })}</span>
      </div>
      <nav className="admin-section-nav" aria-label={tr("operations")}>
        {OPERATIONS_SECTIONS.map((section) => (
          <button key={section} type="button" aria-current={activeSection === section ? "page" : undefined}
            onClick={() => selectSection(section)}>
            {sectionLabels[section]}
            {section === "sessions" && <span className="admin-tab-count">{operations.sessions.length}</span>}
          </button>
        ))}
      </nav>
      {activeSection === "sessions" && (
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
                        <Button type="button" variant="destructive" size="sm" disabled={Boolean(terminating)}
                          onClick={() => void model.terminateSession(session)}>
                          {terminating === session.id ? tr("terminating") : tr("endSession")}
                        </Button>
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
      )}
      {activeSection === "maintenance" && (
      <div className="operations-grid">
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
          <Button type="button" variant="outline" onClick={() => void model.downloadBackup()}>
            {tr("exportBackup")}
          </Button>
        </article>
      </div>
      )}
      {activeSection === "logs" && (
      <div className="operations-grid">
        <article className="operation-card logs-card">
          <header>
            <div>
              <h3>{tr("logViewer")}</h3>
              <p>{tr("logViewerLead")}</p>
            </div>
            {!operations.logs.available && <span className="muted-label">{tr("logsUnavailable")}</span>}
          </header>
          {operations.logs.entries.length > 0 && (
            <div className="log-filter" role="group" aria-label={tr("logFilter")}>
              {LOG_FILTER_LEVELS.map((level) => (
                <button key={level} type="button"
                  className={["log-filter-chip", level.toLowerCase()].join(" ")}
                  aria-pressed={!hiddenLevels.has(level)}
                  disabled={levelCounts[level] === 0}
                  onClick={() => toggleLevel(level)}>
                  {level}
                  <span className="log-filter-count">{levelCounts[level]}</span>
                </button>
              ))}
            </div>
          )}
          {operations.logs.sessions.length > 0 && (
            <div className="connection-list">
              <div className="connection-history-heading">
                <strong>{tr("connectionHistory")}</strong>
                <small>{tr("connectionHistoryLead")}</small>
              </div>
              {operations.logs.sessions.map((record) => {
                const routeParts: string[] = [];
                if (record.target && record.target !== "—") routeParts.push(record.target);
                if (record.clientIp && record.clientIp !== "—") routeParts.push(`${tr("ctxClientIp")} ${record.clientIp}`);
                if (record.status === "failed" && record.reason) routeParts.push(connectionFailureText(record.reason));
                const anchor = record.disconnectedAt ?? record.connectedAt ?? record.startedAt;
                return (
                  <div key={record.id} className="connection-row" title={connectionRowTitle(record)}>
                    <span className={["connection-status", record.status].join(" ")}>{connectionStatusLabel(record.status)}</span>
                    <div className="connection-person">
                      <strong>{record.nickname}</strong>
                      {routeParts.length > 0 && <small className="connection-route">{routeParts.join(" · ")}</small>}
                    </div>
                    <div className="connection-when">
                      {record.durationSeconds != null && <small>{tr("duration")} {formatAge(record.durationSeconds)}</small>}
                      <small>{formatRelative(anchor)}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {visibleEntries.length > 0 ? (
            <div className="log-list">
              {visibleEntries.map((entry, index) => {
                const level = filterLevelOf(entry.level);
                const parts = logContextParts(entry.context);
                return (
                  <div key={`${entry.timestamp}-${index}`} className="log-row" data-level={level}>
                    {level === "WARN" || level === "ERROR"
                      ? <span className={`log-level ${entry.level.toLowerCase()}`}>{entry.level}</span>
                      : <span className="log-dot" aria-hidden="true" />}
                    <time className="log-time" dateTime={entry.timestamp ?? undefined}
                      title={entry.timestamp ? formatDate(entry.timestamp) : undefined}>
                      {formatLogTime(entry.timestamp)}
                    </time>
                    <div>
                      <strong>{logMessage(entry.message) || "—"}</strong>
                      {parts.length > 0 && <small>{parts.join(" · ")}</small>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : operations.logs.entries.length > 0 ? (
            <div className="operation-empty">
              <ActivityIcon size={22} aria-hidden="true" />
              <span>{tr("noLogs")}</span>
            </div>
          ) : null}
          {operations.logs.sessions.length === 0 && operations.logs.entries.length === 0 && (
            <div className="operation-empty">
              <ActivityIcon size={22} aria-hidden="true" />
              <span>{tr("noLogs")}</span>
            </div>
          )}
        </article>
      </div>
      )}
      {activeSection === "audit" && (
      <div className="operations-grid">
        <article className="operation-card audit-card">
          <header>
            <div>
              <h3>{tr("audit")}</h3>
              <p>{tr("auditLead")}</p>
            </div>
          </header>
          <AdminEventList events={operations.audit} messages={messages} emptyText={tr("auditEmpty")} />
        </article>
      </div>
      )}
    </section>
  );
}
