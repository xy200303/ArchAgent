/** Coordinates global/project state restore, legacy migration, and debounced persistence. */
import { resolve } from "node:path";
import type { ArtifactSummary, AttachmentRef, ChatSession } from "../../shared/types";
import {
  loadPersistedState,
  loadProjectState,
  savePersistedState,
  saveProjectState,
  type PersistedStateSnapshot,
  type ProjectStateSnapshot,
  type SessionMemoryEntry
} from "./sessionPersistence";

export interface ProjectStateStore {
  restore(): void;
  schedulePersist(): void;
  flushPersisted(): void;
}

export function createProjectStateStore(options: {
  statePath: string;
  sessions: Map<string, ChatSession>;
  attachments: Map<string, AttachmentRef>;
  artifacts: Map<string, ArtifactSummary>;
  sessionMemories: Map<string, SessionMemoryEntry[]>;
  getRecentProjectPaths: () => string[];
  setRecentProjectPaths: (paths: string[]) => void;
}): ProjectStateStore {
  let persistTimer: NodeJS.Timeout | undefined;

  function snapshotGlobalState(): PersistedStateSnapshot {
    const knownSessionIds = new Set(options.sessions.keys());
    return {
      sessions: [],
      attachments: Array.from(options.attachments.values()).filter(
        (attachment) => !attachment.sessionId || !knownSessionIds.has(attachment.sessionId)
      ),
      artifacts: Array.from(options.artifacts.values()).filter(
        (artifact) => !artifact.sessionId || !knownSessionIds.has(artifact.sessionId)
      ),
      sessionMemories: {},
      recentProjectPaths: options.getRecentProjectPaths()
    };
  }

  function snapshotProjectState(projectPath: string): ProjectStateSnapshot {
    const normalized = resolve(projectPath);
    const projectSessions = Array.from(options.sessions.values()).filter(
      (session) => resolve(session.projectPath) === normalized
    );
    const sessionIds = new Set(projectSessions.map((session) => session.id));
    const memoryRecord: Record<string, SessionMemoryEntry[]> = {};
    for (const sessionId of sessionIds) {
      const memory = options.sessionMemories.get(sessionId);
      if (memory) memoryRecord[sessionId] = memory;
    }
    return {
      sessions: projectSessions,
      attachments: Array.from(options.attachments.values()).filter(
        (attachment) => attachment.sessionId !== undefined && sessionIds.has(attachment.sessionId)
      ),
      artifacts: Array.from(options.artifacts.values()).filter(
        (artifact) => artifact.sessionId !== undefined && sessionIds.has(artifact.sessionId)
      ),
      sessionMemories: memoryRecord
    };
  }

  function restore(): void {
    try {
      const state = loadPersistedState(options.statePath);
      if (!state) return;

      options.sessions.clear();
      options.attachments.clear();
      options.artifacts.clear();
      options.sessionMemories.clear();
      const recentProjectPaths = Array.isArray(state.recentProjectPaths) ? state.recentProjectPaths : [];
      options.setRecentProjectPaths(recentProjectPaths);

      const candidateProjectPaths = new Set<string>();
      for (const projectPath of recentProjectPaths) candidateProjectPaths.add(resolve(projectPath));
      for (const session of state.sessions) candidateProjectPaths.add(resolve(session.projectPath));

      const migratedProjectPaths = new Set<string>();
      for (const projectPath of candidateProjectPaths) {
        try {
          const projectState = loadProjectState(projectPath);
          if (!projectState) continue;
          migratedProjectPaths.add(projectPath);
          for (const session of projectState.sessions) options.sessions.set(session.id, session);
          for (const attachment of projectState.attachments) options.attachments.set(attachment.id, attachment);
          for (const artifact of projectState.artifacts) options.artifacts.set(artifact.id, artifact);
          for (const [sessionId, memory] of Object.entries(projectState.sessionMemories)) {
            options.sessionMemories.set(sessionId, memory);
          }
        } catch (error) {
          console.warn(`Failed to restore project state: ${projectPath}`, error);
        }
      }

      // Projects without their own state file still read the legacy global snapshot once.
      const isMigratedSession = (sessionId: string | undefined): boolean => {
        if (!sessionId) return false;
        const session = options.sessions.get(sessionId);
        return Boolean(session && migratedProjectPaths.has(resolve(session.projectPath)));
      };
      for (const session of state.sessions) {
        if (!migratedProjectPaths.has(resolve(session.projectPath))) options.sessions.set(session.id, session);
      }
      for (const attachment of state.attachments) {
        if (!isMigratedSession(attachment.sessionId)) options.attachments.set(attachment.id, attachment);
      }
      for (const artifact of state.artifacts) {
        if (!isMigratedSession(artifact.sessionId)) options.artifacts.set(artifact.id, artifact);
      }
      for (const [sessionId, memory] of Object.entries(state.sessionMemories)) {
        if (!isMigratedSession(sessionId)) options.sessionMemories.set(sessionId, memory);
      }
    } catch (error) {
      console.warn("Failed to restore persisted state:", error);
    }
  }

  function schedulePersist(): void {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = undefined;
      flushPersisted();
    }, 250);
  }

  function flushPersisted(): void {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = undefined;
    }
    const projectPaths = new Set(
      Array.from(options.sessions.values()).map((session) => resolve(session.projectPath))
    );
    for (const projectPath of projectPaths) {
      try {
        saveProjectState(projectPath, snapshotProjectState(projectPath));
      } catch (error) {
        console.warn(`Failed to persist project state: ${projectPath}`, error);
      }
    }
    try {
      savePersistedState(options.statePath, snapshotGlobalState());
    } catch (error) {
      console.warn("Failed to persist state:", error);
    }
  }

  return { restore, schedulePersist, flushPersisted };
}
