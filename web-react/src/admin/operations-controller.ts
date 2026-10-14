import { createStore } from "zustand/vanilla";

import type { AdminConnectionRecord, AdminLog, AdminSession } from "@shared/admin-responses";

import type { AdminApi } from "@/services/admin-api";
import { createAdminRequests } from "@/services/admin-requests";

export interface OperationsSnapshot {
  sessions: AdminSession[];
  diagnostics: {
    version: string;
    node: string;
    platform: string;
    arch: string;
    schemaVersion: number;
    createdSessions: number;
    rssMb: number | null;
    heapUsedMb: number | null;
    voiceTransports: { connected: number; webrtc: number; compat: number; compatRatio: number } | null;
  };
  logs: { available: boolean; entries: AdminLog[]; sessions: AdminConnectionRecord[] };
  audit: Array<{ event: string; createdAt: string }>;
}

function emptyDiagnostics(): OperationsSnapshot["diagnostics"] {
  return { version: "", node: "", platform: "", arch: "", schemaVersion: 0, createdSessions: 0, rssMb: null, heapUsedMb: null, voiceTransports: null };
}

function emptyLogs(): OperationsSnapshot["logs"] {
  return { available: false, entries: [], sessions: [] };
}

export interface OperationsStore extends OperationsSnapshot {
  loading: boolean;
  terminating: string;
}

interface Options {
  api: AdminApi;
  clearError(): void;
  report(error: unknown): void;
  confirmTerminate(nickname: string): boolean;
  refreshOverview(): Promise<void>;
}

export function createOperationsController(options: Options) {
  const requests = createAdminRequests();
  const store = createStore<OperationsStore>(() => ({
    sessions: [], diagnostics: emptyDiagnostics(), logs: emptyLogs(), audit: [], loading: false, terminating: "",
  }));

  const state = () => store.getState();
  const patch = (partial: Partial<OperationsStore>) => store.setState(partial);
  const resetData = () => patch({ sessions: [], audit: [], logs: emptyLogs(), diagnostics: emptyDiagnostics() });

  function cancelRequests() {
    requests.reset();
    patch({ loading: false, terminating: "" });
  }
  function reset() {
    cancelRequests();
    resetData();
  }

  async function loadOperations() {
    const request = requests.begin("load");
    patch({ loading: true });
    try {
      const [sessions, diagnostics, logs, audit] = await Promise.all([
        options.api.sessions(request.signal), options.api.diagnostics(request.signal), options.api.logs(request.signal), options.api.audit(request.signal),
      ]);
      if (!request.isCurrent()) return;
      patch({
        sessions: sessions.sessions,
        diagnostics: { ...diagnostics.gateway, schemaVersion: diagnostics.database.schemaVersion, createdSessions: diagnostics.sessions.created,
          rssMb: diagnostics.gateway.rssMb ?? null, heapUsedMb: diagnostics.gateway.heapUsedMb ?? null,
          voiceTransports: diagnostics.voiceTransports ?? null },
        logs,
        audit: audit.events,
      });
    } catch (error) {
      if (request.isCurrent()) options.report(error);
    } finally {
      if (request.isCurrent()) patch({ loading: false });
      request.finish();
    }
  }

  async function terminateSession(target: AdminSession) {
    if (state().terminating || !options.confirmTerminate(target.nickname)) return;
    const request = requests.begin("terminate");
    patch({ terminating: target.id });
    options.clearError();
    try {
      await options.api.terminateSession(target.id, request.signal);
      if (request.isCurrent()) await Promise.all([loadOperations(), options.refreshOverview()]);
    } catch (error) {
      if (request.isCurrent()) options.report(error);
    } finally {
      if (request.isCurrent()) patch({ terminating: "" });
      request.finish();
    }
  }

  async function downloadBackup() {
    const request = requests.begin("backup");
    try {
      const blob = await options.api.backup(request.signal);
      if (!request.isCurrent()) return;
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `webspeak-backup-${new Date().toISOString().slice(0, 10)}.db`;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      await loadOperations();
    } catch (error) {
      if (request.isCurrent()) options.report(error);
    } finally {
      request.finish();
    }
  }

  return { store, loadOperations, terminateSession, downloadBackup, cancelRequests, reset };
}

export type OperationsController = ReturnType<typeof createOperationsController>;
