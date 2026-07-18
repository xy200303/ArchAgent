import { contextBridge, ipcRenderer } from "electron";
import type {
  ArtifactListInput,
  ChatPromptInput,
  ClipboardAttachmentInput,
  CreateDirectoryInput,
  CreateFileInput,
  ChatSession,
  CreateSessionInput,
  DeleteFileInput,
  ListWorkspaceFilesInput,
  PasteAttachmentInput,
  PickAttachmentInput,
  ArchAgentApi,
  ProjectInfo,
  ReadBinaryFileInput,
  ReadTextFileInput,
  RenameSessionInput,
  RendererEvent,
  UpdateAppSettingsInput,
  WorkspaceFileItem,
  WriteTextFileInput
} from "../shared/types";
import type { SceneCommandInput, SceneExportTarget } from "../shared/modeling3d/sceneContracts";
import type { GlobalComponentSummary } from "../shared/types";

const api: ArchAgentApi = {
  app: {
    getMetadata: () => ipcRenderer.invoke("app:metadata"),
    recentProjects: () => ipcRenderer.invoke("app:recent-projects") as Promise<ProjectInfo[]>,
    newWindow: (projectPath?: string) => ipcRenderer.invoke("app:new-window", projectPath)
  },
  project: {
    open: () => ipcRenderer.invoke("project:open") as Promise<ProjectInfo | undefined>,
    create: () => ipcRenderer.invoke("project:create") as Promise<ProjectInfo | undefined>
  },
  session: {
    list: (projectPath: string) => ipcRenderer.invoke("session:list", projectPath) as Promise<ChatSession[]>,
    create: (input: CreateSessionInput) => ipcRenderer.invoke("session:create", input) as Promise<ChatSession>,
    rename: (input: RenameSessionInput) => ipcRenderer.invoke("session:rename", input),
    delete: (sessionId: string) => ipcRenderer.invoke("session:delete", sessionId)
  },
  workspace: {
    listFiles: (input: ListWorkspaceFilesInput) =>
      ipcRenderer.invoke("workspace:list-files", input) as Promise<WorkspaceFileItem[]>
  },
  chat: {
    prompt: (input: ChatPromptInput) => ipcRenderer.invoke("chat:prompt", input),
    abort: (sessionId: string) => ipcRenderer.invoke("chat:abort", sessionId)
  },
  workflow: {
    answer: (input) => ipcRenderer.invoke("workflow:answer", input),
    confirm: (input) => ipcRenderer.invoke("workflow:confirm", input),
    cancel: (input) => ipcRenderer.invoke("workflow:cancel", input)
  },
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke("clipboard:write-text", text)
  },
  attachment: {
    pick: (input: PickAttachmentInput) => ipcRenderer.invoke("attachment:pick", input),
    importClipboard: (input: ClipboardAttachmentInput) => ipcRenderer.invoke("attachment:import-clipboard", input),
    pasteFromClipboard: (input: PasteAttachmentInput) => ipcRenderer.invoke("attachment:paste-from-clipboard", input),
    remove: (attachmentId: string) => ipcRenderer.invoke("attachment:remove", attachmentId)
  },
  artifact: {
    list: (input?: ArtifactListInput) => ipcRenderer.invoke("artifact:list", input),
    open: (artifactId: string) => ipcRenderer.invoke("artifact:open", artifactId),
    reveal: (artifactId: string) => ipcRenderer.invoke("artifact:reveal", artifactId),
    preview: (artifactId: string) => ipcRenderer.invoke("artifact:preview", artifactId)
  },
  file: {
    readText: (input: ReadTextFileInput) => ipcRenderer.invoke("file:read-text", input),
    readBinary: (input: ReadBinaryFileInput) => ipcRenderer.invoke("file:read-binary", input),
    writeText: (input: WriteTextFileInput) => ipcRenderer.invoke("file:write-text", input),
    create: (input: CreateFileInput) => ipcRenderer.invoke("file:create", input),
    createDirectory: (input: CreateDirectoryInput) => ipcRenderer.invoke("file:create-directory", input),
    delete: (input: DeleteFileInput) => ipcRenderer.invoke("file:delete", input),
    reveal: (path: string) => ipcRenderer.invoke("file:reveal", path),
    open: (path: string) => ipcRenderer.invoke("file:open", path)
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (input: UpdateAppSettingsInput) => ipcRenderer.invoke("settings:save", input),
    checkRuntime: () => ipcRenderer.invoke("settings:check-runtime")
  },
  scene: {
    activateProject: (projectPath: string) => ipcRenderer.invoke("scene:activate-project", projectPath),
    getSnapshot: () => ipcRenderer.invoke("scene:snapshot"),
    execute: (command: SceneCommandInput) => ipcRenderer.invoke("scene:execute", command),
    getHistoryState: () => ipcRenderer.invoke("scene:history-state"),
    undo: () => ipcRenderer.invoke("scene:undo"),
    redo: () => ipcRenderer.invoke("scene:redo")
    ,import: () => ipcRenderer.invoke("scene:import")
    ,selectExportTarget: () => ipcRenderer.invoke("scene:select-export-target")
    ,saveExport: (target: SceneExportTarget, dataBase64?: string) => ipcRenderer.invoke("scene:save-export", target, dataBase64)
    ,loadAsset: (assetId: string) => ipcRenderer.invoke("scene:load-asset", assetId)
  },
  componentLibrary: {
    list: () => ipcRenderer.invoke("component-library:list"),
    loadAsset: (id: string) => ipcRenderer.invoke("component-library:load-asset", id),
    loadPreview: (id: string) => ipcRenderer.invoke("component-library:load-preview", id),
    savePreview: (id: string, dataBase64: string) => ipcRenderer.invoke("component-library:save-preview", id, dataBase64),
    update: (id: string, input: Pick<GlobalComponentSummary, "name" | "description" | "category" | "tags" | "placementRule">) => ipcRenderer.invoke("component-library:update", id, input),
    delete: (id: string) => ipcRenderer.invoke("component-library:delete", id),
    place: (id: string) => ipcRenderer.invoke("component-library:place", id)
  },
  events: {
    subscribe: (listener: (event: RendererEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: RendererEvent) => listener(payload);
      ipcRenderer.on("app:event", handler);
      return () => ipcRenderer.off("app:event", handler);
    }
  }
};

contextBridge.exposeInMainWorld("archAgent", api);
