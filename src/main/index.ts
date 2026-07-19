import electron from "electron";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { createConversationService } from "./agent/conversationService";
import { createReconstructionWorkflowService } from "./agent/reconstructionWorkflowService";
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
import { linkSessionResource, resourceFromArtifact } from "./resources/sessionResources";
import { createSceneService } from "./modeling3d/sceneService";
import { loadProjectScene, saveProjectScene } from "./modeling3d/sceneProjectPersistence";
import { createSceneExchangeService } from "./modeling3d/sceneExchangeService";
import { deleteGlobalComponent, findGlobalComponent, listGlobalComponents, loadGlobalComponentAsset, loadGlobalComponentPreview, saveGlobalComponentPreview, updateGlobalComponent } from "./modeling3d/componentLibraryService";
import type { SessionMemoryEntry } from "./projects/sessionPersistence";
import { APP_DISPLAY_NAME, createAppMetadata } from "../shared/appMetadata";
import type {
  AppMetadata,
  ArtifactSummary,
  AttachmentRef,
  ChatSession,
  SessionResource
} from "../shared/types";

const { app, BrowserWindow } = electron;
app.setName(APP_DISPLAY_NAME);

// 调试开关：在极少数无 GPU 驱动的 CI/远程环境中可设 ARCH_AGENT_DISABLE_GPU=1 禁用硬件加速。
// 正常 Windows 桌面环境启用 GPU，以获得 Three.js WebGL 的最佳交互性能。
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
const resources = new Map<string, SessionResource>();
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
const sendResponseItemCreatedEvent = rendererEvents.sendResponseItemCreated;
const sendResponseItemUpdatedEvent = rendererEvents.sendResponseItemUpdated;
const sendTurnStatusEvent = rendererEvents.sendTurnStatus;
const clearPendingStreamItemUpdatesForSession = rendererEvents.clearPendingSessionUpdates;
const sceneService = createSceneService({
  createId,
  broadcast: sendEvent,
  loadProjectSnapshot: loadProjectScene,
  saveProjectSnapshot: saveProjectScene
});
const sceneExchangeService = createSceneExchangeService({
  createId,
  getActiveProjectPath: sceneService.getActiveProjectPath,
  getSnapshot: sceneService.getSnapshot,
  replaceSnapshot: sceneService.replaceSnapshot,
  executeSceneCommand: sceneService.execute,
  executeSceneBatch: sceneService.executeBatch
});
const createWindow = windowManager.createWindow;
const settingsService = createSettingsService({
  envLocalPath,
  envPath,
  projectRootDir,
  resourcesDir,
  initializeDefaultEnv: app.isPackaged
});
const loadEnv = settingsService.load;
const saveEnv = settingsService.save;
const resetEnv = settingsService.reset;
const projectStateStore = createProjectStateStore({
  statePath,
  sessions,
  attachments,
  resources,
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
  resources,
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
  renameFile,
  deleteFile,
  revealFile
} = fileService;
const attachmentService = createAttachmentService({
  sessions,
  attachments,
  resources,
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
const reconstructionWorkflowService = createReconstructionWorkflowService({
  rootDir,
  sessions,
  createId,
  now,
  schedulePersistState,
  sendEvent,
  confirmResourceLinks: ({ sessionId, resourceIds }) => {
    const session = sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    for (const resourceId of resourceIds) {
      if (!resources.has(resourceId)) continue;
      linkSessionResource(session, resourceId, now());
      const link = session.resourceLinks?.find((item) => item.resourceId === resourceId);
      if (link) link.confirmed = true;
    }
    schedulePersistState();
  }
});
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
  resources,
  sessionMemories,
  ensureProjectDirs,
  getSessionInputDir,
  getSessionOutputDir,
  schedulePersistState,
  sendEvent,
  sendResponseItemCreatedEvent,
  sendResponseItemUpdatedEvent,
  sendTurnStatusEvent,
  clearPendingStreamItemUpdatesForSession,
  createId,
  now,
  loadEnv,
  getSceneSnapshot: sceneService.getSnapshot,
  replaceSceneSnapshot: sceneService.replaceSnapshot,
  captureScenePreview: async (view = "current") => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error("当前没有可捕获的应用窗口。");
    if (view !== "current") {
      const preset = view === "perspective" ? "free" : view;
      await window.webContents.executeJavaScript(`new Promise((resolve) => {
        const timeout = setTimeout(resolve, 600);
        window.dispatchEvent(new CustomEvent("arch-agent:scene-preview-camera", {
          detail: { preset: ${JSON.stringify(preset)}, done: () => { clearTimeout(timeout); requestAnimationFrame(() => requestAnimationFrame(resolve)); } }
        }));
      })`);
    }
    const rect = await window.webContents.executeJavaScript(`(() => {
      const canvas = document.querySelector(".r3f-viewer-host canvas");
      if (!canvas) return undefined;
      const bounds = canvas.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0
        ? { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) }
        : undefined;
    })()`);
    return (await window.webContents.capturePage(rect)).toPNG().toString("base64");
  },
  executeSceneCommand: sceneService.execute,
  executeSceneBatch: sceneService.executeBatch,
  placeComponentLibraryItem: (input) => {
    const component = findGlobalComponent(rootDir, input.componentId);
    if (!component) throw new Error("未找到全局构件。");
    return sceneExchangeService.placeGlobalComponent(component, {
      ...(input.name ? { name: input.name } : {}),
      ...(input.parentId ? { parentId: input.parentId } : {}),
      ...(input.position ? { position: input.position } : {}),
      ...(input.rotation ? { rotation: input.rotation } : {}),
      ...(input.scale ? { scale: input.scale } : {}),
      ...(input.targetDimensions ? { targetDimensions: input.targetDimensions } : {}),
      ...(input.footprint ? { footprint: input.footprint } : {})
    });
  },
  placeComponentLibraryItems: (inputs) => {
    const components = inputs.map((input) => {
      const component = findGlobalComponent(rootDir, input.componentId);
      if (!component) throw new Error("未找到全局构件。");
      return {
        component,
        placement: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.parentId ? { parentId: input.parentId } : {}),
          ...(input.position ? { position: input.position } : {}),
          ...(input.rotation ? { rotation: input.rotation } : {}),
          ...(input.scale ? { scale: input.scale } : {}),
          ...(input.targetDimensions ? { targetDimensions: input.targetDimensions } : {}),
          ...(input.footprint ? { footprint: input.footprint } : {})
        }
      };
    });
    return sceneExchangeService.placeGlobalComponents(components);
  },
  createReconstructionWorkflow: reconstructionWorkflowService.createPlan
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
    answerReconstructionWorkflow: reconstructionWorkflowService.answer,
    confirmReconstructionWorkflow: reconstructionWorkflowService.confirm,
    cancelReconstructionWorkflow: reconstructionWorkflowService.cancel,
    retryReconstructionWorkflowAsset: reconstructionWorkflowService.retry,
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
    renameFile,
    deleteFile,
    revealFile,
    isPathWithinAllowed,
    loadSettings: loadEnv,
    saveSettings: saveEnv,
    resetSettings: resetEnv,
    listWorkspaceFiles,
    projectRootDir,
    resourcesDir,
    rootDir,
    now,
    getSceneSnapshot: sceneService.getSnapshot,
    executeSceneCommand: sceneService.execute,
    getSceneHistoryState: sceneService.getHistoryState,
    undoScene: sceneService.undo,
    redoScene: sceneService.redo,
    activateSceneProject: sceneService.activateProject,
    importScene: sceneExchangeService.importFromDialog,
    selectSceneExportTarget: sceneExchangeService.selectExportTarget,
    saveSceneExport: sceneExchangeService.saveExport,
    loadSceneAsset: sceneExchangeService.loadAsset,
    listComponentLibrary: () => listGlobalComponents(rootDir, sceneService.getActiveProjectPath()),
    loadComponentLibraryAsset: (id) => loadGlobalComponentAsset(rootDir, id),
    loadComponentLibraryPreview: (id) => loadGlobalComponentPreview(rootDir, id),
    saveComponentLibraryPreview: (id, dataBase64) => saveGlobalComponentPreview(rootDir, id, dataBase64),
    updateComponentLibraryItem: (id, input) => updateGlobalComponent(rootDir, id, input),
    deleteComponentLibraryItem: (id) => deleteGlobalComponent(rootDir, id),
    placeComponentLibraryItem: (id) => {
      const component = findGlobalComponent(rootDir, id);
      if (!component) throw new Error("未找到全局构件。");
      const result = sceneExchangeService.placeGlobalComponent(component);
      if (!result.accepted) throw new Error(result.message);
      return result.snapshot;
    }
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
