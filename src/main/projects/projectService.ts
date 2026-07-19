/** Owns project directory layout, project dialogs, recent-project updates, and workspace listing. */
import electron from "electron";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type {
  ChatSession,
  ListWorkspaceFilesInput,
  ProjectInfo,
  WorkspaceFileItem
} from "../../shared/types";

const { dialog } = electron;

export function createProjectService(options: {
  sessions: Map<string, ChatSession>;
  getRecentProjectPaths: () => string[];
  setRecentProjectPaths: (paths: string[]) => void;
  schedulePersistState: () => void;
}) {
  function ensureProjectDirs(projectPath: string): void {
    for (const dir of [join(projectPath, "input"), join(projectPath, "output"), join(projectPath, ".agent")]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  function getProjectInputDir(projectPath: string): string {
    return join(projectPath, "input");
  }

  function getProjectOutputDir(projectPath: string): string {
    return join(projectPath, "output");
  }

  function getSessionInputDir(sessionId: string): string {
    const session = options.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return getProjectInputDir(session.projectPath);
  }

  function getSessionOutputDir(sessionId: string): string {
    const session = options.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return getProjectOutputDir(session.projectPath);
  }

  function ensureSessionImportDir(sessionId: string): string {
    const dir = join(getSessionInputDir(sessionId), ".agent-imports");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  function addRecentProjectPath(projectPath: string): void {
    const normalized = resolve(projectPath);
    const recentProjectPaths = options
      .getRecentProjectPaths()
      .filter((path) => resolve(path) !== normalized);
    recentProjectPaths.unshift(normalized);
    options.setRecentProjectPaths(recentProjectPaths.slice(0, 10));
    options.schedulePersistState();
  }

  async function openProject(): Promise<ProjectInfo | undefined> {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return undefined;
    }

    const projectPath = resolve(result.filePaths[0]);
    ensureProjectDirs(projectPath);
    addRecentProjectPath(projectPath);
    return { path: projectPath, name: basename(projectPath) };
  }

  async function createProject(): Promise<ProjectInfo | undefined> {
    const result = await dialog.showSaveDialog({
      properties: ["createDirectory", "showOverwriteConfirmation"],
      defaultPath: "新建项目"
    });
    if (result.canceled || !result.filePath) {
      return undefined;
    }

    const projectPath = resolve(result.filePath);
    if (existsSync(projectPath) && readdirSync(projectPath).length > 0) {
      throw new Error("请选择空文件夹或新建文件夹作为项目");
    }
    ensureProjectDirs(projectPath);
    addRecentProjectPath(projectPath);
    return { path: projectPath, name: basename(projectPath) };
  }

  function listWorkspaceFiles(input: ListWorkspaceFilesInput): WorkspaceFileItem[] {
    const projectPath = input.projectPath;
    if (!projectPath || !existsSync(projectPath)) {
      return [];
    }
    return readWorkspaceDirectory(projectPath, 0);
  }

  function readWorkspaceDirectory(dirPath: string, depth: number): WorkspaceFileItem[] {
    const MAX_DEPTH = 32;
    if (depth > MAX_DEPTH || !existsSync(dirPath)) return [];
    const entries = readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() || entry.isDirectory())
      .map((entry) => {
        const itemPath = join(dirPath, entry.name);
        const item: WorkspaceFileItem = {
          name: entry.name,
          path: itemPath,
          kind: entry.isDirectory() ? "directory" : "file",
          size: entry.isFile() ? statSync(itemPath).size : undefined
        };
        if (entry.isDirectory()) {
          item.children = readWorkspaceDirectory(itemPath, depth + 1);
        }
        return item;
      })
      .sort((left, right) => {
        if (left.kind === right.kind) return left.name.localeCompare(right.name);
        return left.kind === "directory" ? -1 : 1;
      });
  }


  function listRecentProjects(): ProjectInfo[] {
    return options
      .getRecentProjectPaths()
      .filter((path) => existsSync(path))
      .map((path) => ({ path, name: basename(path) }));
  }

  return {
    ensureProjectDirs,
    getSessionInputDir,
    getSessionOutputDir,
    ensureSessionImportDir,
    openProject,
    createProject,
    listWorkspaceFiles,
    listRecentProjects
  };
}
