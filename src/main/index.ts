import electron from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { createConversationService } from "./agent/conversationService";
import { createAttachmentService } from "./files/attachmentService";
import { createFileService } from "./files/fileService";
import { resolveAppPaths } from "./app/appPaths";
import { createRendererEventBus } from "./app/rendererEventBus";
import { registerIpcHandlers } from "./app/ipcRegistry";
import { createWindowManager } from "./app/windowManager";
import { getProcessResourcesDir } from "./runtime/bundledRuntime";
import { createSettingsService } from "./config/settingsService";
import { createProjectStateStore } from "./projects/projectStateStore";
import { createProjectService } from "./projects/projectService";
import { createSceneService } from "./modeling3d/sceneService";
import type { SessionMemoryEntry } from "./projects/sessionPersistence";
import { APP_DISPLAY_NAME, createAppMetadata } from "../shared/appMetadata";
import type {
  AppMetadata,
  ArtifactSummary,
  AttachmentRef,
  ChatSession
} from "../shared/types";

const { app, BrowserWindow } = electron;
app.setName(APP_DISPLAY_NAME);

// 启用 WebGPU：Electron 39 的 Chromium 132 已支持 WebGPU，但部分环境仍需要显式打开特性开关。
app.commandLine.appendSwitch("enable-unsafe-webgpu");
app.commandLine.appendSwitch("enable-features", "WebGPU");

// 调试开关：在极少数无 GPU 驱动的 CI/远程环境中可设 ARCH_AGENT_DISABLE_GPU=1 禁用硬件加速。
// 正常 Windows 桌面环境必须启用 GPU，Pascal 3D 编辑器依赖 WebGPU。
if (process.env.ARCH_AGENT_DISABLE_GPU === "1") {
  app.disableHardwareAcceleration();
}
const projectRootDir = process.cwd();
const resourcesDir = getProcessResourcesDir();
const appPaths = resolveAppPaths({
  projectRootDir,
  resourcesDir,
  userDataDir: app.getPath("userData"),
  packaged: app.isPackaged
});
const { rootDir, docsDir, dataDir, inputDir, outputDir, statePath, envLocalPath, envPath } = appPaths;

const sessions = new Map<string, ChatSession>();
const attachments = new Map<string, AttachmentRef>();
const artifacts = new Map<string, ArtifactSummary>();
const sessionMemories = new Map<string, SessionMemoryEntry[]>();
let recentProjectPaths: string[] = [];

function getAppMetadata(): AppMetadata {
  return createAppMetadata(app.getVersion());
}

function ensureDataDirs(): void {
  for (const dir of [dataDir, inputDir, outputDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

const windowManager = createWindowManager({
  projectRootDir,
  resourcesDir,
  getWindowTitle: () => getAppMetadata().title
});
const rendererEvents = createRendererEventBus({
  createId,
  broadcast: (event) => windowManager.sendEvent(event)
});
const sendEvent = rendererEvents.sendEvent;
const sendStreamItemUpdatedEvent = rendererEvents.sendStreamItemUpdated;
const clearPendingStreamItemUpdatesForSession = rendererEvents.clearPendingSessionUpdates;
const sceneService = createSceneService({ createId, broadcast: sendEvent });
const createWindow = windowManager.createWindow;
const settingsService = createSettingsService({ envLocalPath, envPath, projectRootDir, resourcesDir });
const loadEnv = settingsService.load;
const saveEnv = settingsService.save;
const projectStateStore = createProjectStateStore({
  statePath,
  sessions,
  attachments,
  artifacts,
  sessionMemories,
  getRecentProjectPaths: () => recentProjectPaths,
  setRecentProjectPaths: (paths) => {
    recentProjectPaths = paths;
  }
});
const restorePersistedState = projectStateStore.restore;
const schedulePersistState = projectStateStore.schedulePersist;
const flushPersistedState = projectStateStore.flushPersisted;
const projectService = createProjectService({
  sessions,
  getRecentProjectPaths: () => recentProjectPaths,
  setRecentProjectPaths: (paths) => {
    recentProjectPaths = paths;
  },
  schedulePersistState
});
const {
  ensureProjectDirs,
  getSessionInputDir,
  getSessionOutputDir,
  ensureSessionImportDir,
  openProject,
  createProject,
  listWorkspaceFiles,
  listRecentProjects
} = projectService;
const fileService = createFileService({
  rootDir,
  dataDir,
  inputDir,
  outputDir,
  docsDir,
  sessions,
  attachments,
  artifacts,
  schedulePersistState
});
const {
  isPathWithinAllowed,
  readTextFile,
  readBinaryFile,
  writeTextFile,
  createFile,
  createDirectory,
  deleteFile,
  revealFile
} = fileService;
const attachmentService = createAttachmentService({
  sessions,
  attachments,
  ensureDataDirs,
  ensureProjectDirs,
  ensureSessionImportDir,
  createId,
  now,
  schedulePersistState
});
const {
  pickAttachments,
  importClipboardAttachments,
  pasteAttachmentsFromClipboard
} = attachmentService;
const conversationService = createConversationService({
  rootDir,
  docsDir,
  inputDir,
  outputDir,
  projectRootDir,
  resourcesDir,
  sessions,
  attachments,
  artifacts,
  sessionMemories,
  ensureProjectDirs,
  getSessionInputDir,
  getSessionOutputDir,
  schedulePersistState,
  sendEvent,
  sendStreamItemUpdatedEvent,
  clearPendingStreamItemUpdatesForSession,
  createId,
  now,
  loadEnv,
  executeSceneCommand: sceneService.execute
});
const {
  createSession,
  renameSession,
  deleteSession,
  listArtifacts,
  handlePrompt,
  abortPrompt,
  dispose: disposeConversationService
} = conversationService;

function registerIpc(): void {
  registerIpcHandlers({
    getAppMetadata,
    listRecentProjects,
    createWindow,
    openProject,
    createProject,
    sessions,
    createSession,
    renameSession,
    deleteSession,
    handlePrompt,
    abortPrompt,
    pickAttachments,
    importClipboardAttachments,
    pasteAttachmentsFromClipboard,
    attachments,
    artifacts,
    schedulePersistState,
    listArtifacts,
    readTextFile,
    readBinaryFile,
    writeTextFile,
    createFile,
    createDirectory,
    deleteFile,
    revealFile,
    isPathWithinAllowed,
    loadSettings: loadEnv,
    saveSettings: saveEnv,
    listWorkspaceFiles,
    projectRootDir,
    resourcesDir,
    rootDir,
    now,
    getSceneSnapshot: sceneService.getSnapshot,
    executeSceneCommand: sceneService.execute
  });
}

app.whenReady().then(() => {
  ensureDataDirs();
  loadEnv();
  restorePersistedState();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  flushPersistedState();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  disposeConversationService();
  flushPersistedState();
});
