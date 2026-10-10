<template>
  <section class="page-content operations-page">
    <div class="page-heading"
      ><div
        ><h2>{{ tr("operations") }}</h2
        ><p>{{ tr("operationsLead") }}</p></div
      ><button
        class="secondary-button"
        :disabled="operationsLoading"
        @click="loadOperations"
        ><span
          v-if="operationsLoading"
          class="spinner small"
        ></span
        ><Icon
          v-else
          name="refresh"
          :size="17"
        />{{ tr("refresh") }}</button
      ></div
    >
    <div class="alert info system-notice"
      ><Icon
        name="info"
        :size="16"
      /><span>{{
        tr("updateNotice", { version: operations.diagnostics.version || "—" })
      }}</span></div
    >
    <div class="operations-grid operations-primary">
      <article class="operation-card operation-wide"
        ><header
          ><div
            ><h3>{{ tr("sessions") }}</h3
            ><p>{{ tr("sessionsLead") }}</p></div
          ><strong>{{ operations.sessions.length }}</strong></header
        ><div
          v-if="operations.sessions.length"
          class="table-wrap"
          ><table
            ><thead
              ><tr
                ><th>{{ tr("nickname") }}</th
                ><th>{{ tr("sessionState") }}</th
                ><th>{{ tr("age") }}</th
                ><th>{{ tr("memberCount") }}</th
                ><th></th></tr></thead
            ><tbody
              ><tr
                v-for="session in operations.sessions"
                :key="session.id"
                ><td
                  ><strong>{{ session.nickname }}</strong
                  ><small>{{ session.target }}</small></td
                ><td
                  ><span class="state-pill">{{ sessionStateLabel(session.state) }}</span></td
                ><td>{{ formatAge(session.ageSeconds) }}</td
                ><td>{{ session.memberCount }}</td
                ><td
                  ><button
                    class="danger-button"
                    type="button"
                    :disabled="Boolean(terminatingSession)"
                    @click="terminateSession(session)"
                    >{{
                      terminatingSession === session.id ? tr("terminating") : tr("endSession")
                    }}</button
                  ></td
                ></tr
              ></tbody
            ></table
          ></div
        ><div
          v-else
          class="operation-empty"
          ><Icon
            name="users"
            :size="22"
          /><span>{{ tr("sessionEmpty") }}</span></div
        ></article
      >
    </div>
    <div class="operations-grid lower-operations">
      <article class="operation-card diagnostics-card"
        ><header
          ><div
            ><h3>{{ tr("diagnostics") }}</h3
            ><p>{{ tr("diagnosticsLead") }}</p></div
          ><a
            class="text-link"
            href="/api/admin/diagnostics/report"
            >{{ tr("downloadReport") }}</a
          ></header
        ><dl class="diagnostic-list"
          ><div
            ><dt>{{ tr("version") }}</dt
            ><dd>{{ operations.diagnostics.version || "—" }}</dd></div
          ><div
            ><dt>{{ tr("runtime") }}</dt
            ><dd>{{ operations.diagnostics.node || "—" }}</dd></div
          ><div
            ><dt>{{ tr("platform") }}</dt
            ><dd
              >{{ operations.diagnostics.platform || "—" }} /
              {{ operations.diagnostics.arch || "—" }}</dd
            ></div
          ><div
            ><dt>{{ tr("databaseSchema") }}</dt
            ><dd>v{{ operations.diagnostics.schemaVersion || "—" }}</dd></div
          ><div
            ><dt>{{ tr("createdSessions") }}</dt
            ><dd>{{ operations.diagnostics.createdSessions }}</dd></div
          ><div
            ><dt>{{ tr("gatewayMemory") }}</dt
            ><dd>{{ operations.diagnostics.rssMb != null ? `${operations.diagnostics.rssMb} MB` : "—" }}</dd></div
          ><div
            ><dt>{{ tr("pcmFallbackShare") }}</dt
            ><dd>{{ operations.diagnostics.voiceTransports ? `${(operations.diagnostics.voiceTransports.compatRatio * 100).toFixed(1)}% (${operations.diagnostics.voiceTransports.compat}/${operations.diagnostics.voiceTransports.connected})` : "—" }}</dd></div
          ></dl
        ><button
          class="secondary-button"
          type="button"
          @click="downloadBackup"
          >{{ tr("exportBackup") }}</button
        ></article
      >
      <article class="operation-card logs-card"
        ><header
          ><div
            ><h3>{{ tr("logViewer") }}</h3
            ><p>{{ tr("logViewerLead") }}</p></div
          ><span
            v-if="!operations.logs.available"
            class="muted-label"
            >{{ tr("logsUnavailable") }}</span
          ></header
        ><div
          v-if="operations.logs.sessions.length"
          class="connection-list"
          ><div class="connection-history-heading"
            ><strong>{{ tr("connectionHistory") }}</strong
            ><small>{{ tr("connectionHistoryLead") }}</small></div
          ><div
            v-for="record in operations.logs.sessions"
            :key="record.id"
            class="connection-row"
            ><div class="connection-person"
              ><strong>{{ record.nickname }}</strong
              ><small>{{ record.target }}</small
              ><small class="connection-route">{{ connectionRoute(record) }}</small></div
            ><div class="connection-detail"
              ><span :class="['connection-status', record.status]">{{
                connectionStatusLabel(record.status)
              }}</span
              ><small
                >{{ record.connectedAt ? tr("connectedAt") : tr("connectionAttemptedAt") }}：{{
                  formatDate(record.connectedAt || record.startedAt)
                }}</small
              ><small>{{ tr("duration") }}：{{ formatAge(record.durationSeconds) }}</small
              ><small v-if="record.disconnectedAt"
                >{{ tr("disconnectedAt") }}：{{ formatDate(record.disconnectedAt) }}</small
              ><small v-if="record.reason"
                >{{ tr("failureReason") }}：{{ connectionFailureText(record.reason) }}</small
              ><small
                v-if="record.failureDetail"
                class="failure-detail"
                >{{ tr("failureDetail") }}：{{ record.failureDetail }}</small
              ></div
            ></div
          ></div
        ><div
          v-if="operations.logs.entries.length"
          class="log-list"
          ><div
            v-for="(entry, index) in operations.logs.entries"
            :key="`${entry.timestamp}-${index}`"
            class="log-row"
            ><span :class="['log-level', entry.level.toLowerCase()]">{{ entry.level }}</span
            ><div
              ><strong>{{ entry.message || "—" }}</strong
              ><small
                >{{ formatDate(entry.timestamp)
                }}<template v-if="Object.keys(entry.context).length">
                  · {{ formatContext(entry.context) }}</template
                ></small
              ></div
            ></div
          ></div
        ><div
          v-if="!operations.logs.sessions.length && !operations.logs.entries.length"
          class="operation-empty"
          ><Icon
            name="activity"
            :size="22"
          /><span>{{ tr("noLogs") }}</span></div
        ></article
      >
      <article class="operation-card audit-card"
        ><header
          ><div
            ><h3>{{ tr("audit") }}</h3
            ><p>{{ tr("auditLead") }}</p></div
          ></header
        ><ul class="event-list"
          ><li
            v-for="event in operations.audit"
            :key="`${event.event}-${event.createdAt}`"
            ><span
              ><Icon
                name="check"
                :size="14" /></span
            ><div
              ><strong>{{ eventName(event.event) }}</strong
              ><small>{{ formatDate(event.createdAt) }}</small></div
            ></li
          ><li
            v-if="!operations.audit.length"
            class="empty-event"
            >{{ tr("auditEmpty") }}</li
          ></ul
        ></article
      >
    </div>
  </section>
</template>

<script setup lang="ts">
import Icon from "../Icon.vue";
import type { useAdminOperations } from "../../composables/useAdminOperations.js";
import type { useAdminI18n } from "../../composables/useAdminI18n.js";
import type { AdminConnectionRecord } from "../../../../src/shared/admin-responses.js";

const props = defineProps<{
  model: ReturnType<typeof useAdminOperations>;
  i18n: Pick<ReturnType<typeof useAdminI18n>, "tr" | "formatDate" | "formatAge" | "sessionStateLabel" | "connectionStatusLabel" | "eventName" | "connectionFailureText">;
}>();
// Request ownership, cancellation and drafts remain in the page's controller.
const { operations, operationsLoading, terminatingSession,
  loadOperations, terminateSession, downloadBackup } = props.model;
const { tr, formatDate, formatAge, sessionStateLabel, connectionStatusLabel, eventName, connectionFailureText } = props.i18n;

function connectionRoute(record: AdminConnectionRecord) {
  return tr("connectionFromTo", { ip: record.clientIp || "—", target: record.target || "—" });
}
function formatContext(context: Record<string, string | number | boolean>) { return Object.entries(context).map(([key, value]) => `${key}=${value}`).join(" · "); }
</script>
