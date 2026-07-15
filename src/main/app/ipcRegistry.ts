/** Registers the stable preload IPC contract against explicit domain-service dependencies. */
import electron from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";
import { resolve } from "node:path";
import type {
  AppMetadata,
  AppSettings,
  ArtifactListInput,
  ArtifactSummary,
  AttachmentRef,
  ChatPromptInput,
  ChatSession,
  ClipboardAttachmentInput,
  CreateDirectoryInput,
  CreateFileInput,
  CreateSessionInput,
  DeleteFileInput,
  ListWorkspaceFilesInput,
  PasteAttachmentInput,
  PickAttachmentInput,
  ProjectInfo,
  ReadBinaryFileInput,
  ReadBinaryFileResult,
  ReadTextFileInput,
  RenameSessionInput,
  UpdateAppSettingsInput,
  WorkspaceFileItem,
  WriteTextFileInput
} from "../../shared/types";
import type { SceneCommandInput, SceneCommandResult, SceneSnapshot } from "../../shared/modeling3d/sceneContracts";
import { buildArtifactPreview } from "../files/artifactPreview";
import { checkRuntime } from "../runtime/runtimeDiagnostics";

const { BrowserWindow, clipboard, ipcMain, shell } = electron;

export function registerIpcHandlers(options: {
  getAppMetadata: () => AppMetadata;
  listRecentProjects: () => ProjectInfo[];
  createWindow: (projectPath?: string) => void;
  openProject: () => Promise<ProjectInfo | undefined>;
  createProject: () => Promise<ProjectInfo | undefined>;
  sessions: Map<string, ChatSession>;
  createSession: (projectPath: string) => ChatSession;
  renameSession: (input: RenameSessionInput) => ChatSession;
  deleteSession: (sessionId: string) => ChatSession[];
  handlePrompt: (input: ChatPromptInput) => Promise<{ accepted: true }>;
  abortPrompt: (sessionId: string) => void;
  pickAttachments: (input: PickAttachmentInput) => Promise<AttachmentRef[]>;
  importClipboardAttachments: (input: ClipboardAttachmentInput) => AttachmentRef[];
  pasteAttachmentsFromClipboard: (input: PasteAttachmentInput) => AttachmentRef[];
  attachments: Map<string, AttachmentRef>;
  artifacts: Map<string, ArtifactSummary>;
  schedulePersistState: () => void;
  listArtifacts: (input?: ArtifactListInput) => ArtifactSummary[];
  readTextFile: (input: ReadTextFileInput) => Promise<{ content: string; size: number }>;
  readBinaryFile: (input: ReadBinaryFileInput) => Promise<ReadBinaryFileResult>;
  writeTextFile: (input: WriteTextFileInput) => Promise<void>;
  createFile: (input: CreateFileInput) => Promise<void>;
  createDirectory: (input: CreateDirectoryInput) => Promise<void>;
  deleteFile: (input: DeleteFileInput, parentWindow?: BrowserWindowType) => Promise<void>;
  revealFile: (filePath: string) => Promise<void>;
  isPathWithinAllowed: (filePath: string) => boolean;
  loadSettings: () => AppSettings;
  saveSettings: (input: UpdateAppSettingsInput) => AppSettings;
  listWorkspaceFiles: (input: ListWorkspaceFilesInput) => WorkspaceFileItem[];
  projectRootDir: string;
  resourcesDir?: string;
  rootDir: string;
  now: () => string;
  getSceneSnapshot: () => SceneSnapshot;
  executeSceneCommand: (command: SceneCommandInput) => SceneCommandResult;
}): void {
  ipcMain.handle("app:metadata", options.getAppMetadata);
  ipcMain.handle("app:recent-projects", options.listRecentProjects);
  ipcMain.handle("app:new-window", (_event, projectPath?: string) => options.createWindow(projectPath));
  ipcMain.handle("project:open", options.openProject);
  ipcMain.handle("project:create", options.createProject);
  ipcMain.handle("session:list", (_event, projectPath: string) =>
    Array.from(options.sessions.values()).filter((session) => resolve(session.projectPath) === resolve(projectPath))
  );
  ipcMain.handle("session:create", (_event, input: CreateSessionInput) => options.createSession(input.projectPath));
  ipcMain.handle("session:rename", (_event, input: RenameSessionInput) => options.renameSession(input));
  ipcMain.handle("session:delete", (_event, sessionId: string) => options.deleteSession(sessionId));
  ipcMain.handle("chat:prompt", (_event, input: ChatPromptInput) => options.handlePrompt(input));
  ipcMain.handle("chat:abort", (_event, sessionId: string) => options.abortPrompt(sessionId));
  ipcMain.handle("attachment:pick", (_event, input: PickAttachmentInput) => options.pickAttachments(input));
  ipcMain.handle("attachment:import-clipboard", (_event, input: ClipboardAttachmentInput) =>
    options.importClipboardAttachments(input)
  );
  ipcMain.handle("attachment:paste-from-clipboard", (_event, input: PasteAttachmentInput) =>
    options.pasteAttachmentsFromClipboard(input)
  );
  ipcMain.handle("clipboard:write-text", (_event, text: string) => clipboard.writeText(String(text)));
  ipcMain.handle("attachment:remove", (_event, attachmentId: string) => {
    options.attachments.delete(attachmentId);
    options.schedulePersistState();
  });
  ipcMain.handle("artifact:list", (_event, input?: ArtifactListInput) => options.listArtifacts(input));
  ipcMain.handle("artifact:open", async (_event, artifactId: string) => {
    const artifact = requireArtifact(options.artifacts, artifactId);
    const errorMessage = await shell.openPath(artifact.path);
    if (errorMessage) throw new Error(errorMessage);
  });
  ipcMain.handle("artifact:reveal", (_event, artifactId: string) => {
    shell.showItemInFolder(requireArtifact(options.artifacts, artifactId).path);
  });
  ipcMain.handle("artifact:preview", (_event, artifactId: string) =>
    buildArtifactPreview(requireArtifact(options.artifacts, artifactId))
  );
  ipcMain.handle("file:read-text", (_event, input: ReadTextFileInput) => options.readTextFile(input));
  ipcMain.handle("file:read-binary", (_event, input: ReadBinaryFileInput) => options.readBinaryFile(input));
  ipcMain.handle("file:write-text", (_event, input: WriteTextFileInput) => options.writeTextFile(input));
  ipcMain.handle("file:create", (_event, input: CreateFileInput) => options.createFile(input));
  ipcMain.handle("file:create-directory", (_event, input: CreateDirectoryInput) => options.createDirectory(input));
  ipcMain.handle("file:delete", (event, input: DeleteFileInput) =>
    options.deleteFile(input, BrowserWindow.fromWebContents(event.sender) ?? undefined)
  );
  ipcMain.handle("file:reveal", (_event, filePath: string) => options.revealFile(filePath));
  ipcMain.handle("file:open", async (_event, filePath: string) => {
    if (!options.isPathWithinAllowed(filePath)) throw new Error("无权打开该文件路径");
    const errorMessage = await shell.openPath(filePath);
    if (errorMessage) throw new Error(errorMessage);
  });
  ipcMain.handle("settings:get", options.loadSettings);
  ipcMain.handle("settings:save", (_event, input: UpdateAppSettingsInput) => options.saveSettings(input));
  ipcMain.handle("workspace:list-files", (_event, input: ListWorkspaceFilesInput) => options.listWorkspaceFiles(input));
  ipcMain.handle("settings:check-runtime", () =>
    checkRuntime({
      projectRootDir: options.projectRootDir,
      resourcesDir: options.resourcesDir,
      cwd: options.rootDir,
      env: process.env,
      now: options.now
    })
  );
  ipcMain.handle("scene:snapshot", options.getSceneSnapshot);
  ipcMain.handle("scene:execute", (_event, command: SceneCommandInput) => options.executeSceneCommand(command));
}

function requireArtifact(artifacts: Map<string, ArtifactSummary>, artifactId: string): ArtifactSummary {
  const artifact = artifacts.get(artifactId);
  if (!artifact) throw new Error("Artifact not found");
  return artifact;
}
