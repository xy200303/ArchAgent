import type { SceneAssetPayload, SceneCommandInput, SceneCommandResult, SceneExportTarget, SceneHistoryResult, SceneHistoryState, SceneImportResult, SceneSnapshot } from "./modeling3d/sceneContracts";

export type MessageRole = "user" | "assistant";

export type SessionStatus = "idle" | "running" | "completed" | "failed";

export type BundledPythonRuntimeSource = "resources" | "project";

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
  resourceLinks?: SessionResourceLink[];
  workflow?: ReconstructionWorkflow;
}

export type ReconstructionWorkflowStatus =
  | "needs_clarification"
  | "ready_for_confirmation"
  | "confirmed"
  | "generating"
  | "completed"
  | "needs_attention"
  | "cancelled";

export interface ReconstructionWorkflowQuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface ReconstructionWorkflowQuestion {
  id: string;
  prompt: string;
  required: boolean;
  options: ReconstructionWorkflowQuestionOption[];
  selectedOptionId?: string;
}

export interface ReconstructionWorkflowPlacement {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  anchor?: { elementId: string; side: "inside" | "outside"; distance: number };
  local?: [number, number, number];
  facing?: "north" | "south" | "east" | "west" | "wall_inward" | "wall_outward";
  lookAt?: [number, number, number];
  rotationDegrees?: [number, number, number];
  footprint?: [number, number];
}

export interface ReconstructionWorkflowAsset {
  id: string;
  name: string;
  quantity: number;
  source: "library" | "image" | "text";
  componentId?: string;
  sourceResourceId?: string;
  imagePath?: string;
  prompt?: string;
  placement?: ReconstructionWorkflowPlacement;
  placements?: ReconstructionWorkflowPlacement[];
  status: "planned" | "queued" | "running" | "placed" | "failed" | "cancelled";
  componentIdResult?: string;
  resourceIdResult?: string;
  sceneAssetIds?: string[];
  dedupeKey?: string;
  providerJob?: {
    taskId: string;
    model: "hy-3d-3.0" | "hy-3d-3.1" | "hy-3d-express";
    generateType: "normal" | "low_poly" | "geometry" | "sketch";
    faceCount?: number;
  };
  error?: string;
}

/** A user-approved, resumable plan for expensive 3D reconstruction work. */
export interface ReconstructionWorkflow {
  id: string;
  revision: number;
  mode: "floorplan" | "photo_simple" | "photo_complex";
  title: string;
  summary: string;
  assumptions: string[];
  sourceResourceIds: string[];
  questions: ReconstructionWorkflowQuestion[];
  assets: ReconstructionWorkflowAsset[];
  status: ReconstructionWorkflowStatus;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnswerWorkflowQuestionInput {
  sessionId: string;
  workflowId: string;
  revision: number;
  questionId: string;
  optionId: string;
}

export interface ConfirmWorkflowInput {
  sessionId: string;
  workflowId: string;
  revision: number;
}

export interface RetryWorkflowAssetInput extends ConfirmWorkflowInput {
  assetId: string;
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
export interface GlobalComponentSummary { id: string; name: string; source: "hunyuan-3d" | "external"; model: string; prompt?: string; description?: string; category?: string; tags: string[]; placementRule?: string; previewAvailable: boolean; createdAt: string; }

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

/** Session-owned file resource. Paths remain main-process only and are never tool arguments. */
export type SessionResourceKind = "image" | "document" | "table" | "database" | "model3d" | "text" | "archive" | "other";
export type SessionResourceSource = "user_upload" | "generated" | "derived";
export type SessionResourceStatus = "ready" | "processing" | "failed";

export interface SessionResourceLink {
  resourceId: string;
  confirmed: boolean;
  pinned: boolean;
  addedAt: string;
}

export interface SessionResource {
  id: string;
  projectPath: string;
  /** Session that created the resource; this is audit metadata, not ownership. */
  sessionId: string;
  name: string;
  kind: SessionResourceKind;
  mimeType: string;
  size: number;
  /** Main-process only; never expose this field in Agent tool schemas. */
  path: string;
  source: SessionResourceSource;
  parentResourceIds: string[];
  metadata: Record<string, unknown>;
  status: SessionResourceStatus;
  confirmed: boolean;
  pinned: boolean;
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
    chatModel: string;
    thinkingEnabled: boolean;
    reasoningEffort: string;
    requestTimeoutSeconds: number;
    contextWindowTokens: number;
    maxOutputTokens: number;
    apiKeyConfigured: boolean;
  };
  tokenHubImage: {
    endpoint: string;
    model: string;
    requestTimeoutSeconds: number;
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
    chatModel: string;
    thinkingEnabled: boolean;
    reasoningEffort: string;
    requestTimeoutSeconds: number;
    contextWindowTokens: number;
    maxOutputTokens: number;
    apiKey?: string;
  };
  tokenHubImage: {
    endpoint: string;
    model: string;
    requestTimeoutSeconds: number;
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
  workflow: {
    answer(input: AnswerWorkflowQuestionInput): Promise<ReconstructionWorkflow>;
    confirm(input: ConfirmWorkflowInput): Promise<ReconstructionWorkflow>;
    cancel(input: Pick<ConfirmWorkflowInput, "sessionId" | "workflowId">): Promise<ReconstructionWorkflow>;
    retry(input: RetryWorkflowAssetInput): Promise<ReconstructionWorkflow>;
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
    import(): Promise<SceneImportResult | undefined>;
    selectExportTarget(): Promise<SceneExportTarget | undefined>;
    saveExport(target: SceneExportTarget, dataBase64?: string): Promise<string>;
    loadAsset(assetId: string): Promise<SceneAssetPayload>;
  };
  componentLibrary: { list(): Promise<GlobalComponentSummary[]>; loadAsset(id: string): Promise<SceneAssetPayload>; loadPreview(id: string): Promise<string | undefined>; savePreview(id: string, dataBase64: string): Promise<void>; update(id: string, input: Pick<GlobalComponentSummary, "name" | "description" | "category" | "tags" | "placementRule">): Promise<GlobalComponentSummary>; delete(id: string): Promise<void>; place(id: string): Promise<SceneSnapshot>; };
  events: {
    subscribe(listener: (event: RendererEvent) => void): () => void;
  };
}
