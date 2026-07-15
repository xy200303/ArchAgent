/** Resolves deterministic per-session workspace paths and safe folder names. */
import { join } from "node:path";

export const SESSION_WORKSPACES_DIRNAME = "workspaces";

export interface SessionWorkspaceDirs {
  workspaceDir: string;
  inputDir: string;
  outputDir: string;
}

export function resolveSessionWorkspaceDirs(dataDir: string, sessionId: string): SessionWorkspaceDirs {
  const workspaceDir = join(dataDir, SESSION_WORKSPACES_DIRNAME, sanitizeSessionWorkspaceName(sessionId));
  return {
    workspaceDir,
    inputDir: join(workspaceDir, "input"),
    outputDir: join(workspaceDir, "output")
  };
}

export function sanitizeSessionWorkspaceName(sessionId: string): string {
  return sessionId.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 96) || "session";
}
