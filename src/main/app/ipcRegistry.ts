/** Registers the stable preload IPC contract against explicit domain-service dependencies. */
import electron from "electron";
import { resolve } from "node:path";
import type {
  AppMetadata,
  AnswerWorkflowQuestionInput,
  AppSettings,
  ArtifactListInput,
  ArtifactSummary,
  AttachmentRef,
  ChatPromptInput,
  ChatSession,
  ConfirmWorkflowInput,
  RetryWorkflowAssetInput,
  ReconstructionWorkflow,
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
  RenameFileInput,
  RenameSessionInput,
  UpdateAppSettingsInput,
  WorkspaceFileItem,
  WriteTextFileInput
} from "../../shared/types";
import type { SceneAssetPayload, SceneCommandInput, SceneCommandResult, SceneExchangeFormat, SceneExportTarget, SceneHistoryResult, SceneHistoryState, SceneImportResult, SceneSnapshot } from "../../shared/modeling3d/sceneContracts";
import { buildArtifactPreview } from "../files/artifactPreview";
import { checkRuntime } from "../runtime/runtimeDiagnostics";
import type { GlobalComponentRecord } from "../modeling3d/componentLibraryService";
import type { GlobalComponentSummary } from "../../shared/types";

const { clipboard, ipcMain, shell } = electron;
const ARCH_AGENT_GITHUB_URL = "https://github.com/xy200303/ArchAgent";

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
  answerReconstructionWorkflow: (input: AnswerWorkflowQuestionInput) => ReconstructionWorkflow;
  confirmReconstructionWorkflow: (input: ConfirmWorkflowInput) => ReconstructionWorkflow;
  cancelReconstructionWorkflow: (input: Pick<ConfirmWorkflowInput, "sessionId" | "workflowId">) => ReconstructionWorkflow;
  retryReconstructionWorkflowAsset: (input: RetryWorkflowAssetInput) => ReconstructionWorkflow;
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
  renameFile: (input: RenameFileInput) => Promise<void>;
  deleteFile: (input: DeleteFileInput) => Promise<void>;
  revealFile: (filePath: string) => Promise<void>;
  isPathWithinAllowed: (filePath: string) => boolean;
  loadSettings: () => AppSettings;
  saveSettings: (input: UpdateAppSettingsInput) => AppSettings;
  resetSettings: () => AppSettings;
  listWorkspaceFiles: (input: ListWorkspaceFilesInput) => WorkspaceFileItem[];
  projectRootDir: string;
  resourcesDir?: string;
  rootDir: string;
  now: () => string;
  getSceneSnapshot: () => SceneSnapshot;
  executeSceneCommand: (command: SceneCommandInput) => SceneCommandResult;
  getSceneHistoryState: () => SceneHistoryState;
  undoScene: () => SceneHistoryResult;
  redoScene: () => SceneHistoryResult;
  activateSceneProject: (projectPath: string) => SceneSnapshot;
  importScene: () => Promise<SceneImportResult | undefined>;
  selectSceneExportTarget: () => Promise<SceneExportTarget | undefined>;
  saveSceneExport: (target: SceneExportTarget, dataBase64?: string) => string;
  loadSceneAsset: (assetId: string) => SceneAssetPayload;
  listComponentLibrary: () => GlobalComponentRecord[];
  loadComponentLibraryAsset: (id: string) => SceneAssetPayload;
  loadComponentLibraryPreview: (id: string) => string | undefined;
  saveComponentLibraryPreview: (id: string, dataBase64: string) => void;
  placeComponentLibraryItem: (id: string) => SceneSnapshot;
  updateComponentLibraryItem: (id: string, input: Pick<GlobalComponentSummary, "name" | "description" | "category" | "tags" | "placementRule">) => GlobalComponentRecord;
  deleteComponentLibraryItem: (id: string) => void;
}): void {
  ipcMain.handle("app:metadata", options.getAppMetadata);
  ipcMain.handle("app:recent-projects", options.listRecentProjects);
  ipcMain.handle("app:new-window", (_event, projectPath?: string) => options.createWindow(projectPath));
  ipcMain.handle("app:open-archagent-github", () => shell.openExternal(ARCH_AGENT_GITHUB_URL));
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
  ipcMain.handle("workflow:answer", (_event, input: AnswerWorkflowQuestionInput) => options.answerReconstructionWorkflow(input));
  ipcMain.handle("workflow:confirm", (_event, input: ConfirmWorkflowInput) => options.confirmReconstructionWorkflow(input));
  ipcMain.handle("workflow:cancel", (_event, input: Pick<ConfirmWorkflowInput, "sessionId" | "workflowId">) => options.cancelReconstructionWorkflow(input));
  ipcMain.handle("workflow:retry", (_event, input: RetryWorkflowAssetInput) => options.retryReconstructionWorkflowAsset(input));
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
  ipcMain.handle("file:rename", (_event, input: RenameFileInput) => options.renameFile(input));
  ipcMain.handle("file:delete", (_event, input: DeleteFileInput) => options.deleteFile(input));
  ipcMain.handle("file:reveal", (_event, filePath: string) => options.revealFile(filePath));
  ipcMain.handle("file:open", async (_event, filePath: string) => {
    if (!options.isPathWithinAllowed(filePath)) throw new Error("无权打开该文件路径");
    const errorMessage = await shell.openPath(filePath);
    if (errorMessage) throw new Error(errorMessage);
  });
  ipcMain.handle("settings:get", options.loadSettings);
  ipcMain.handle("settings:save", (_event, input: UpdateAppSettingsInput) => options.saveSettings(input));
  ipcMain.handle("settings:reset", options.resetSettings);
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
  ipcMain.handle("scene:activate-project", (_event, projectPath: string) => options.activateSceneProject(projectPath));
  ipcMain.handle("scene:execute", (_event, command: SceneCommandInput) => options.executeSceneCommand(command));
  ipcMain.handle("scene:history-state", options.getSceneHistoryState);
  ipcMain.handle("scene:undo", options.undoScene);
  ipcMain.handle("scene:redo", options.redoScene);
  ipcMain.handle("scene:import", options.importScene);
  ipcMain.handle("scene:select-export-target", options.selectSceneExportTarget);
  ipcMain.handle("scene:save-export", (_event, target: SceneExportTarget, dataBase64?: string) => options.saveSceneExport(target, dataBase64));
  ipcMain.handle("scene:load-asset", (_event, assetId: string) => options.loadSceneAsset(assetId));
  ipcMain.handle("component-library:list", options.listComponentLibrary);
  ipcMain.handle("component-library:load-asset", (_event, id: string) => options.loadComponentLibraryAsset(id));
  ipcMain.handle("component-library:load-preview", (_event, id: string) => options.loadComponentLibraryPreview(id));
  ipcMain.handle("component-library:save-preview", (_event, id: string, dataBase64: string) => options.saveComponentLibraryPreview(id, dataBase64));
  ipcMain.handle("component-library:update", (_event, id, input) => options.updateComponentLibraryItem(id, input));
  ipcMain.handle("component-library:delete", (_event, id: string) => options.deleteComponentLibraryItem(id));
  ipcMain.handle("component-library:place", (_event, id: string) => options.placeComponentLibraryItem(id));
}

function requireArtifact(artifacts: Map<string, ArtifactSummary>, artifactId: string): ArtifactSummary {
  const artifact = artifacts.get(artifactId);
  if (!artifact) throw new Error("Artifact not found");
  return artifact;
}
