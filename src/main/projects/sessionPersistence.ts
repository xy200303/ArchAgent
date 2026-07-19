/** Persists global and per-project conversation state without UI dependencies. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ArtifactSummary, AttachmentRef, ChatSession, SessionResource } from "../../shared/types";

export interface SessionMemoryEntry {
  source: string;
  content: string;
}

export interface PersistedStateSnapshot {
  sessions: ChatSession[];
  attachments: AttachmentRef[];
  artifacts: ArtifactSummary[];
  resources: SessionResource[];
  sessionMemories: Record<string, SessionMemoryEntry[]>;
  recentProjectPaths: string[];
}

interface PersistedStateFile extends PersistedStateSnapshot {
  version: 2;
  savedAt: string;
}

/** 项目级会话状态：会话、附件、产物与会话记忆按项目目录隔离存储。 */
export interface ProjectStateSnapshot {
  sessions: ChatSession[];
  attachments: AttachmentRef[];
  artifacts: ArtifactSummary[];
  /** Legacy resources embedded in sessions.json; read once then migrated to resources.json. */
  resources?: SessionResource[];
  sessionMemories: Record<string, SessionMemoryEntry[]>;
}

interface ProjectStateFile extends Omit<ProjectStateSnapshot, "resources"> {
  version: 1;
  savedAt: string;
}

export interface ProjectResourceSnapshot {
  resources: SessionResource[];
}

interface ProjectResourceFile extends ProjectResourceSnapshot {
  version: 1;
  savedAt: string;
}

const EMPTY_SNAPSHOT: PersistedStateSnapshot = {
  sessions: [],
  attachments: [],
  artifacts: [],
  resources: [],
  sessionMemories: {},
  recentProjectPaths: []
};

const EMPTY_PROJECT_SNAPSHOT: ProjectStateSnapshot = {
  sessions: [],
  attachments: [],
  artifacts: [],
  sessionMemories: {}
};

export function loadPersistedState(filePath: string): PersistedStateSnapshot | null {
  if (!existsSync(filePath)) return null;

  const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<PersistedStateFile>;
  if (parsed.version !== 2) return EMPTY_SNAPSHOT;
  return {
    sessions: recoverInterruptedSessions(Array.isArray(parsed.sessions) ? parsed.sessions : []),
    attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
    artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
    resources: Array.isArray(parsed.resources) ? parsed.resources : [],
    sessionMemories: isMemoryRecord(parsed.sessionMemories) ? parsed.sessionMemories : {},
    recentProjectPaths: Array.isArray(parsed.recentProjectPaths) ? parsed.recentProjectPaths : []
  };
}

export function savePersistedState(filePath: string, snapshot: PersistedStateSnapshot): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const payload: PersistedStateFile = {
    version: 2,
    savedAt: new Date().toISOString(),
    sessions: snapshot.sessions,
    attachments: snapshot.attachments,
    artifacts: snapshot.artifacts,
    resources: snapshot.resources,
    sessionMemories: snapshot.sessionMemories,
    recentProjectPaths: snapshot.recentProjectPaths
  };
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export function getProjectStateFilePath(projectPath: string): string {
  return join(projectPath, ".agent", "sessions.json");
}

export function loadProjectState(projectPath: string): ProjectStateSnapshot | null {
  const filePath = getProjectStateFilePath(projectPath);
  if (!existsSync(filePath)) return null;

  const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<ProjectStateFile>;
  if (parsed.version !== 1) return { ...EMPTY_PROJECT_SNAPSHOT };
  return {
    sessions: recoverInterruptedSessions(Array.isArray(parsed.sessions) ? parsed.sessions : []),
    attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
    artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
    ...(() => {
      const legacyResources = (parsed as { resources?: unknown }).resources;
      return Array.isArray(legacyResources) ? { resources: legacyResources as SessionResource[] } : {};
    })(),
    sessionMemories: isMemoryRecord(parsed.sessionMemories) ? parsed.sessionMemories : {}
  };
}

export function saveProjectState(projectPath: string, snapshot: ProjectStateSnapshot): void {
  const filePath = getProjectStateFilePath(projectPath);
  mkdirSync(dirname(filePath), { recursive: true });
  const payload: ProjectStateFile = {
    version: 1,
    savedAt: new Date().toISOString(),
    sessions: snapshot.sessions,
    attachments: snapshot.attachments,
    artifacts: snapshot.artifacts,
    sessionMemories: snapshot.sessionMemories
  };
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

export function getProjectResourcesFilePath(projectPath: string): string {
  return join(projectPath, ".agent", "resources.json");
}

export function loadProjectResources(projectPath: string): ProjectResourceSnapshot | null {
  const filePath = getProjectResourcesFilePath(projectPath);
  if (!existsSync(filePath)) return null;
  const parsed = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<ProjectResourceFile>;
  if (parsed.version !== 1) return { resources: [] };
  return { resources: Array.isArray(parsed.resources) ? parsed.resources : [] };
}

export function saveProjectResources(projectPath: string, snapshot: ProjectResourceSnapshot): void {
  const filePath = getProjectResourcesFilePath(projectPath);
  mkdirSync(dirname(filePath), { recursive: true });
  const payload: ProjectResourceFile = { version: 1, savedAt: new Date().toISOString(), resources: snapshot.resources };
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function isMemoryRecord(value: unknown): value is Record<string, SessionMemoryEntry[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(
    (entries) =>
      Array.isArray(entries) &&
      entries.every(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          typeof (entry as SessionMemoryEntry).source === "string" &&
          typeof (entry as SessionMemoryEntry).content === "string"
      )
  );
}

function recoverInterruptedSessions(sessions: ChatSession[]): ChatSession[] {
  return sessions.map((session) => {
    const hasInterruptedItems = session.items.some(
      (item) => (item.kind === "message" && item.role === "assistant" && !item.isFinished) || (item.kind === "tool" && item.status === "running")
    );
    if (session.status !== "running" && !hasInterruptedItems) return session;

    return {
      ...session,
      status: "idle",
      items: session.items.map((item) => {
        if (item.kind === "message" && item.role === "assistant" && !item.isFinished) {
          return {
            ...item,
            isFinished: true,
            failure: {
              code: "interrupted_by_restart",
              category: "unknown",
              message: "应用重启时生成已中断，请重新发送你的请求。"
            }
          };
        }
        if (item.kind === "tool" && item.status === "running") {
          return {
            ...item,
            status: "failed",
            errorPreview: "应用重启时工具执行已中断。"
          };
        }
        return item;
      })
    };
  });
}
