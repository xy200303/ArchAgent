import type { SceneCommandInput, SceneCommandResult, SceneHistoryResult, SceneHistoryState, SceneSnapshot } from "./modeling3d/sceneContracts";

export type MessageRole = "user" | "assistant";

export type SessionStatus = "idle" | "running" | "completed" | "failed";

export type BundledPythonRuntimeSource = "resources" | "project";

export const IMAGE_GENERATION_REQUEST_TIMEOUT_DEFAULT_MS = 300000;
export const CONTEXT_WINDOW_TOKENS_MIN = 8192;
export const CONTEXT_WINDOW_TOKENS_MAX = 2_000_000;
export const CONTEXT_WINDOW_TOKENS_DEFAULT = 256_000;

export function clampContextWindowTokens(value: unknown): number {
  const numericValue =
    typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(numericValue)) return CONTEXT_WINDOW_TOKENS_DEFAULT;
  return Math.min(Math.max(Math.trunc(numericValue), CONTEXT_WINDOW_TOKENS_MIN), CONTEXT_WINDOW_TOKENS_MAX);
}

export interface BundledPythonRuntimeStatus {
  available: boolean;
  source?: BundledPythonRuntimeSource;
  homeDir?: string;
  pythonExePath?: string;
  scriptsDir?: string;
}

export interface RuntimeCommandCheck {
  ok: boolean;
  command: string;
  source: "bundled" | "system";
  output?: string;
  error?: string;
  durationMs: number;
}

export interface RuntimeCheckResult {
  checkedAt: string;
  bundledPython: BundledPythonRuntimeStatus;
  python: RuntimeCommandCheck;
  pip: RuntimeCommandCheck;
}

export interface AppMetadata {
  displayName: string;
  version: string;
  title: string;
}

export type StreamItem =
  | {
      id: string;
      kind: "message";
      role: MessageRole;
      content: string;
      isFinished: boolean;
      createdAt: string;
      attachmentIds?: string[];
    }
  | {
      id: string;
      kind: "tool";
      toolCallId: string;
      toolName: string;
      status: "running" | "success" | "failed";
      summary?: string;
      inputPreview?: string;
      outputPreview?: string;
      errorPreview?: string;
      createdAt: string;
    }
  | {
      id: string;
      kind: "file";
      artifactId: string;
      name: string;
      fileKind: ArtifactKind;
      createdAt: string;
    }
  | {
      id: string;
      kind: "stage";
      title: string;
      detail?: string;
      createdAt: string;
    };

export interface ProjectInfo {
  path: string;
  name: string;
}

export interface ChatSession {
  id: string;
  title: string;
  status: SessionStatus;
  projectPath: string;
  createdAt: string;
  updatedAt: string;
  items: StreamItem[];
}

export type ArtifactKind = "docx" | "pdf" | "png" | "jpg" | "jpeg" | "webp" | "svg" | "json" | "md" | "txt" | "log" | "stl" | "obj" | "glb" | "gltf" | "3mf" | "step" | "iges" | "dxf" | "other";

export interface ArtifactSummary {
  id: string;
  sessionId?: string;
  name: string;
  kind: ArtifactKind;
  path: string;
  size: number;
  createdAt: string;
}

export interface ArtifactListInput {
  sessionId?: string;
}

export interface ArtifactPreview {
  artifactId: string;
  name: string;
  kind: ArtifactKind;
  mode: "text" | "image" | "pdf" | "docx" | "3d" | "unsupported";
  size?: number;
  text?: string;
  dataUrl?: string;
  mimeType?: string;
  summary?: string;
  path?: string;
}

export interface ReadTextFileInput {
  path: string;
}

export interface ReadTextFileResult {
  content: string;
  size: number;
}

export interface ReadBinaryFileInput {
  path: string;
}

export interface ReadBinaryFileResult {
  dataBase64: string;
  mimeType?: string;
  size: number;
}

export interface WriteTextFileInput {
  path: string;
  content: string;
}

export interface CreateFileInput {
  path: string;
}

export interface CreateDirectoryInput {
  path: string;
}

export interface DeleteFileInput {
  path: string;
}

export interface AttachmentRef {
  id: string;
  sessionId?: string;
  name: string;
  mimeType: string;
  size: number;
  path: string;
  source: "picker" | "clipboard" | "drop";
  createdAt: string;
}

export interface ClipboardAttachmentInput {
  sessionId?: string;
  source?: "clipboard" | "drop";
  files: Array<{
    name: string;
    mimeType: string;
    dataBase64: string;
  }>;
}

export interface PasteAttachmentInput {
  sessionId: string;
}

export interface CreateSessionInput {
  projectPath: string;
}

export interface OpenProjectInput {
  projectPath: string;
}

export interface WorkspaceFileItem {
  name: string;
  path: string;
  kind: "file" | "directory";
  size?: number;
  children?: WorkspaceFileItem[];
}

export interface ListWorkspaceFilesInput {
  projectPath: string;
}

export interface PickAttachmentInput {
  sessionId?: string;
  multiple?: boolean;
}

export interface RenameSessionInput {
  sessionId: string;
  title: string;
}

export interface ChatPromptInput {
  sessionId: string;
  message: string;
  attachments?: AttachmentRef[];
}

export interface AppSettings {
  theme: "light" | "dark";
  runtime: {
    envFilePath: string;
    configSource: ".env" | ".env.local" | "process";
    bundledPython: BundledPythonRuntimeStatus;
  };
  openai: {
    baseUrl: string;
    imageBaseUrl: string;
    visionBaseUrl: string;
    chatModel: string;
    chatImageInputEnabled: boolean;
    imageModel: string;
    visionModel: string;
    imageSize: string;
    imageQuality: string;
    autoImageGeneration: boolean;
    thinkingEnabled: boolean;
    reasoningEffort: string;
    requestTimeoutMs: number;
    imageRequestTimeoutMs: number;
    contextWindowTokens: number;
    maxOutputTokens: number;
    apiKeyConfigured: boolean;
    imageApiKeyConfigured: boolean;
    visionApiKeyConfigured: boolean;
  };
  output: {
    autoPdfExport: boolean;
    libreOfficePath: string;
  };
  agent: {
    execBashEnabled: boolean;
  };
}

export interface UpdateAppSettingsInput {
  theme: "light" | "dark";
  openai: {
    baseUrl: string;
    imageBaseUrl: string;
    visionBaseUrl: string;
    chatModel: string;
    chatImageInputEnabled: boolean;
    imageModel: string;
    visionModel: string;
    imageSize: string;
    imageQuality: string;
    autoImageGeneration: boolean;
    thinkingEnabled: boolean;
    reasoningEffort: string;
    requestTimeoutMs: number;
    imageRequestTimeoutMs: number;
    contextWindowTokens: number;
    maxOutputTokens: number;
    apiKey?: string;
    imageApiKey?: string;
    visionApiKey?: string;
  };
  output: {
    autoPdfExport: boolean;
    libreOfficePath: string;
  };
  agent: {
    execBashEnabled: boolean;
  };
}

export type RendererEvent =
  | {
      id: string;
      type: "session.created";
      payload: ChatSession;
    }
  | {
      id: string;
      type: "session.updated";
      payload: ChatSession;
    }
  | {
      id: string;
      type: "session.deleted";
      sessionId: string;
    }
  | {
      id: string;
      type: "stream.item.added";
      sessionId: string;
      payload: StreamItem;
    }
  | {
      id: string;
      type: "stream.item.updated";
      sessionId: string;
      payload: StreamItem;
    }
  | {
      id: string;
      type: "artifact.created";
      sessionId: string;
      payload: ArtifactSummary;
    }
  | {
      id: string;
      type: "scene.command.applied";
      payload: Extract<SceneCommandResult, { accepted: true }>;
    }
  | {
      id: string;
      type: "scene.snapshot.restored";
      payload: SceneSnapshot;
    };

export interface ArchAgentApi {
  app: {
    getMetadata(): Promise<AppMetadata>;
    recentProjects(): Promise<ProjectInfo[]>;
    newWindow(projectPath?: string): Promise<void>;
  };
  project: {
    open(): Promise<ProjectInfo | undefined>;
    create(): Promise<ProjectInfo | undefined>;
  };
  session: {
    list(projectPath: string): Promise<ChatSession[]>;
    create(input: CreateSessionInput): Promise<ChatSession>;
    rename(input: RenameSessionInput): Promise<ChatSession>;
    delete(sessionId: string): Promise<ChatSession[]>;
  };
  workspace: {
    listFiles(input: ListWorkspaceFilesInput): Promise<WorkspaceFileItem[]>;
  };
  chat: {
    prompt(input: ChatPromptInput): Promise<{ accepted: true }>;
    abort(sessionId: string): Promise<void>;
  };
  clipboard: {
    writeText(text: string): Promise<void>;
  };
  attachment: {
    pick(input: PickAttachmentInput): Promise<AttachmentRef[]>;
    importClipboard(input: ClipboardAttachmentInput): Promise<AttachmentRef[]>;
    pasteFromClipboard(input: PasteAttachmentInput): Promise<AttachmentRef[]>;
    remove(attachmentId: string): Promise<void>;
  };
  artifact: {
    list(input?: ArtifactListInput): Promise<ArtifactSummary[]>;
    open(artifactId: string): Promise<void>;
    reveal(artifactId: string): Promise<void>;
    preview(artifactId: string): Promise<ArtifactPreview>;
  };
  file: {
    readText(input: ReadTextFileInput): Promise<ReadTextFileResult>;
    readBinary(input: ReadBinaryFileInput): Promise<ReadBinaryFileResult>;
    writeText(input: WriteTextFileInput): Promise<void>;
    create(input: CreateFileInput): Promise<void>;
    createDirectory(input: CreateDirectoryInput): Promise<void>;
    delete(input: DeleteFileInput): Promise<void>;
    reveal(path: string): Promise<void>;
    open(path: string): Promise<void>;
  };
  settings: {
    get(): Promise<AppSettings>;
    save(input: UpdateAppSettingsInput): Promise<AppSettings>;
    checkRuntime(): Promise<RuntimeCheckResult>;
  };
  scene: {
    activateProject(projectPath: string): Promise<SceneSnapshot>;
    getSnapshot(): Promise<SceneSnapshot>;
    execute(command: SceneCommandInput): Promise<SceneCommandResult>;
    getHistoryState(): Promise<SceneHistoryState>;
    undo(): Promise<SceneHistoryResult>;
    redo(): Promise<SceneHistoryResult>;
  };
  events: {
    subscribe(listener: (event: RendererEvent) => void): () => void;
  };
}
