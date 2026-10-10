import { onScopeDispose, reactive, ref, type Ref } from "vue";
import type { AdminSession, AdminLog, AdminConnectionRecord } from "../../../src/shared/admin-responses.js";
import type { copy } from "../i18n/admin.js";
import { isAdminRequestCancelled, type AdminApi } from "../services/admin-api.js";
import { createAdminRequests } from "../services/admin-requests.js";

interface Options {
  api: AdminApi;
  errorMessage: Ref<string>;
  errorText(code?: string): string;
  tr(key: keyof typeof copy.zh, vars?: Record<string, string | number>): string;
  refreshOverview(): Promise<void>;
}

export function useAdminOperations(options: Options) {
  const requests = createAdminRequests();
  const operationsLoading = ref(false), terminatingSession = ref("");
  const operations = reactive({ sessions: [] as AdminSession[],
    diagnostics: { version: "", node: "", platform: "", arch: "", schemaVersion: 0, createdSessions: 0,
      rssMb: null as number | null, heapUsedMb: null as number | null,
      voiceTransports: null as { connected: number; webrtc: number; compat: number; compatRatio: number } | null },
    logs: { available: false, entries: [] as AdminLog[], sessions: [] as AdminConnectionRecord[] }, audit: [] as Array<{ event: string; createdAt: string }> });
  let noticeTimer: number | undefined;
  function cancelRequests() {
    requests.reset();
    operationsLoading.value = false; terminatingSession.value = "";
    if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
    noticeTimer = undefined;
  }
  function reset() {
    cancelRequests();
    operations.sessions = []; operations.audit = [];
    operations.logs = { available: false, entries: [], sessions: [] };
    operations.diagnostics = { version: "", node: "", platform: "", arch: "", schemaVersion: 0, createdSessions: 0,
      rssMb: null, heapUsedMb: null, voiceTransports: null };
  }
  onScopeDispose(reset);
  function report(error: unknown) {
    if (!isAdminRequestCancelled(error)) options.errorMessage.value = options.errorText((error as { code?: string }).code);
  }
  async function loadOperations() {
    const request = requests.begin("load");
    operationsLoading.value = true;
    try {
      const [sessions, diagnostics, logs, audit] = await Promise.all([
        options.api.sessions(request.signal), options.api.diagnostics(request.signal), options.api.logs(request.signal), options.api.audit(request.signal),
      ]);
      if (!request.isCurrent()) return;
      operations.sessions = sessions.sessions;
      operations.diagnostics = { ...diagnostics.gateway, schemaVersion: diagnostics.database.schemaVersion, createdSessions: diagnostics.sessions.created,
        rssMb: diagnostics.gateway.rssMb ?? null, heapUsedMb: diagnostics.gateway.heapUsedMb ?? null,
        voiceTransports: diagnostics.voiceTransports ?? null };
      operations.logs = logs;
      operations.audit = audit.events;
    } catch (error) { if (request.isCurrent()) report(error); }
    finally { if (request.isCurrent()) operationsLoading.value = false; request.finish(); }
  }
  async function terminateSession(session: AdminSession) {
    if (terminatingSession.value || !window.confirm(options.tr("confirmTerminate", { nickname: session.nickname }))) return;
    const request = requests.begin("terminate");
    terminatingSession.value = session.id; options.errorMessage.value = "";
    try {
      await options.api.terminateSession(session.id, request.signal);
      if (request.isCurrent()) await Promise.all([loadOperations(), options.refreshOverview()]);
    } catch (error) { if (request.isCurrent()) report(error); }
    finally { if (request.isCurrent()) terminatingSession.value = ""; request.finish(); }
  }
  async function downloadBackup() {
    const request = requests.begin("backup");
    try {
      const blob = await options.api.backup(request.signal);
      if (!request.isCurrent()) return;
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = `webspeak-backup-${new Date().toISOString().slice(0, 10)}.db`; anchor.click();
      } finally { URL.revokeObjectURL(url); }
      await loadOperations();
    } catch (error) { if (request.isCurrent()) report(error); }
    finally { request.finish(); }
  }
  return { operations, operationsLoading, terminatingSession,
    loadOperations, terminateSession, downloadBackup, cancelRequests, reset };
}
