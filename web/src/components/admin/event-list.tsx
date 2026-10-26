import {
  CircleCheckIcon, CircleXIcon, DownloadIcon, FileUpIcon, InfoIcon, KeyRoundIcon,
  LogInIcon, LogOutIcon, SettingsIcon, ShieldAlertIcon, SparklesIcon, UserXIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { AdminMessages } from "@/i18n/admin-messages";

export interface AdminAuditEvent {
  event: string;
  createdAt: string;
  details: Record<string, string | number>;
}

type EventTone = "neutral" | "success" | "warning" | "danger";

// 事件类型 → 图标 + 语义色：登录失败红、测试失败琥珀、成功绿，其余中性。
// 未登记的事件回落中性 Info 图标，不会报错。
const EVENT_META: Record<string, { icon: LucideIcon; tone: EventTone }> = {
  ADMIN_LOGIN_SUCCEEDED: { icon: LogInIcon, tone: "success" },
  ADMIN_LOGIN_FAILED: { icon: ShieldAlertIcon, tone: "danger" },
  ADMIN_LOGOUT: { icon: LogOutIcon, tone: "neutral" },
  ADMIN_INITIALIZED: { icon: SparklesIcon, tone: "neutral" },
  ADMIN_PASSWORD_CHANGED: { icon: KeyRoundIcon, tone: "neutral" },
  ADMIN_BACKUP_EXPORTED: { icon: DownloadIcon, tone: "neutral" },
  ADMIN_SESSION_TERMINATED: { icon: UserXIcon, tone: "warning" },
  CONNECTION_TEST_SUCCEEDED: { icon: CircleCheckIcon, tone: "success" },
  CONNECTION_TEST_FAILED: { icon: CircleXIcon, tone: "danger" },
  SETTINGS_CHANGED: { icon: SettingsIcon, tone: "neutral" },
  LEGACY_CONFIG_IMPORTED: { icon: FileUpIcon, tone: "neutral" },
};

// 总览「最近事件」与运营页「审计」共用的事件流渲染。
export function AdminEventList({ events, messages, emptyText }: {
  events: AdminAuditEvent[];
  messages: AdminMessages;
  emptyText: string;
}) {
  const { eventName, formatRelative, formatDate, auditDetail } = messages;
  return (
    <ul className="event-list">
      {events.map((event) => {
        const meta = EVENT_META[event.event] ?? { icon: InfoIcon, tone: "neutral" as const };
        const detail = auditDetail(event.event, event.details);
        return (
          <li key={`${event.event}-${event.createdAt}`}>
            <span className={["event-icon", meta.tone].join(" ")} aria-hidden="true">
              <meta.icon size={14} />
            </span>
            <div className="event-copy">
              <strong>{eventName(event.event)}</strong>
              {detail && <small>{detail}</small>}
            </div>
            <time dateTime={event.createdAt} title={formatDate(event.createdAt)}>
              {formatRelative(event.createdAt)}
            </time>
          </li>
        );
      })}
      {events.length === 0 && <li className="empty-event">{emptyText}</li>}
    </ul>
  );
}
