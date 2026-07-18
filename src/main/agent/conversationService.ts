/** Owns chat sessions, Agent turns, stream events, memory, and generated artifact registration. */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { ImageContent } from "@mariozechner/pi-ai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type {
  AppSettings,
  ArtifactKind,
  ArtifactListInput,
  ArtifactSummary,
  AttachmentRef,
  ChatPromptInput,
  ChatSession,
  RendererEvent,
  StreamItem,
  RenameSessionInput
} from "../../shared/types";
import {
  MAX_VISION_IMAGE_BYTES,
  compactText,
  getCurrentTimeText,
  isSupportedImageFile,
  readImageDataUrl
} from "./agentTools";
import {
  createAgentRuntime,
  type AgentRuntime,
  type AgentRuntimeHost,
  type MessageStreamItem
} from "./agentRuntime";
import { findBundledPythonRuntime } from "../runtime/bundledRuntime";
import type { SessionMemoryEntry } from "../projects/sessionPersistence";
import type { SceneCommandInput, SceneCommandResult, SceneSnapshot } from "../../shared/modeling3d/sceneContracts";

const MAX_DOCUMENT_CONTEXT_CHARS = 24000;
const MAX_SESSION_MEMORY_CHARS = 90000;

/** Defines the modeling decision boundary shared by both OpenAI and Pi Agent runtimes. */
export function buildAgentModelingSystemPrompt(): string {
  return [
    "你是 ArchAgent，一个基于腾讯混元 Hy3 模型的桌面空间设计智能体。",
    "只可调用以下工具：analyze_reference、isolate_reference_object、search_assets、preview_design、propose_reconstruction、get_scene、apply_scene_plan、update_scene、place_asset、deliver_file，以及按权限开放的 exec_external_script。不得提及或调用旧工具名。",
    "工作方式：先理解用户的空间设计目标、场景类型（房间/建筑/室内）、尺寸约束、风格偏好和交付格式，再按需创建或修改 3D 场景节点，最终生成可预览、可导出的空间设计方案。",
    "资料不足时先总结已知信息、指出缺口并继续澄清；但是用户明确要求生成独立 3D 物体时，不应因缺少房间尺寸或摆放位置而拒绝生成资产。",
    "每当用户补充关键设计背景，优先调用 remember_project 沉淀已确认事实和待补充信息。项目档案应覆盖场景类型、空间尺寸、功能需求、门窗洞口、家具陈设、材质偏好、楼层关系和交付要求。",
    "事实证据规则：只有用户明确提供、图片/工具明确读到、或 remember_project 已记录为“已确认事实”的内容，才能在设计结论中写成确定事实；推断、经验规则和模型猜测必须标注为假设或建议。",
    "场景编辑：先用 get_scene 获取版本与节点 ID；用 apply_scene_plan 批量创建或修改建筑构件，用 update_scene 做单项更新或删除。所有坐标单位为米，提交时必须携带读取时的 expected_revision。",
    "资产：先用 search_assets 检索可复用构件，再用 place_asset 放入场景。重建计划中的缺失资产由确认后的编排器自动生成、入库和摆放，模型不得直接生成。",
    "重建：用 propose_reconstruction 记录假设、选项和资产计划；关键不确定项必须给出 2 到 4 个选项。用户完成必答选项并确认后，编排器以低模配置执行。",
    "能力边界：不能把通用 3D 资产伪装成可编辑建筑语义，也不能声称完成了未执行的 Mesh 顶点、边、面、UV、贴图烘焙、骨骼或动画编辑。",
    "资料：用 analyze_reference 分析文档、图片或空间；复杂照片用 isolate_reference_object 生成单物件提取图，并把“正确/重新提取/跳过”作为重建计划的必答选项。",
    "户型图与平面图：使用 preview_design 交付效果图；效果图只是布局与风格参考，仍须走重建计划确认。",
    "确认与交付：方案存在必答问题时等待用户在方案卡片选择；全部回答后仍须点击“按当前方案生成”。效果图、提取图和完成模型均用 deliver_file 发送给用户。",
    "工具调用：普通问答和澄清阶段不修改场景；建筑设计使用 get_scene 后的 apply_scene_plan；用户微调用 update_scene；场景命令成功后报告受影响节点和场景版本。",
    "回复使用中文 Markdown，结论要区分事实、设计结果、假设和建议；必要时给出缺失资料清单。",
    `当前时间：${getCurrentTimeText()}`
  ].join("\n");
}

export function createConversationService(options: {
  rootDir: string;
  docsDir: string;
  inputDir: string;
  outputDir: string;
  projectRootDir: string;
  resourcesDir?: string;
  sessions: Map<string, ChatSession>;
  attachments: Map<string, AttachmentRef>;
  artifacts: Map<string, ArtifactSummary>;
  sessionMemories: Map<string, SessionMemoryEntry[]>;
  ensureProjectDirs: (projectPath: string) => void;
  getSessionInputDir: (sessionId: string) => string;
  getSessionOutputDir: (sessionId: string) => string;
  schedulePersistState: () => void;
  sendEvent: (event: RendererEvent) => void;
  sendStreamItemUpdatedEvent: (sessionId: string, item: StreamItem) => void;
  clearPendingStreamItemUpdatesForSession: (sessionId: string) => void;
  createId: (prefix: string) => string;
  now: () => string;
  loadEnv: () => AppSettings;
  getSceneSnapshot: () => SceneSnapshot;
  executeSceneCommand: (command: SceneCommandInput) => SceneCommandResult;
  placeComponentLibraryItem: AgentRuntimeHost["placeComponentLibraryItem"];
  createReconstructionWorkflow: AgentRuntimeHost["createReconstructionWorkflow"];
}) {
  const abortControllers = new Map<string, AbortController>();
  let agentRuntime: AgentRuntime | undefined;

  function createSession(projectPath: string): ChatSession {
    const sessionId = options.createId("session");
    options.ensureProjectDirs(projectPath);
    const session: ChatSession = {
      id: sessionId,
      title: "新的空间设计对话",
      status: "idle",
      projectPath: resolve(projectPath),
      createdAt: options.now(),
      updatedAt: options.now(),
      items: []
    };
    options.sessions.set(session.id, session);
    options.schedulePersistState();
    options.sendEvent({ id: options.createId("event"), type: "session.created", payload: session });
    return session;
  }

  function renameSession(input: RenameSessionInput): ChatSession {
    const session = options.sessions.get(input.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }

    const title = input.title.replace(/[\r\n\t]+/g, " ").trim();
    if (!title) {
      throw new Error("Session title cannot be empty");
    }

    session.title = title.slice(0, 80);
    session.updatedAt = options.now();
    options.sessions.set(session.id, session);
    options.schedulePersistState();
    options.sendEvent({ id: options.createId("event"), type: "session.updated", payload: session });
    return session;
  }

  function deleteSession(sessionId: string): ChatSession[] {
    const session = options.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    abortControllers.get(sessionId)?.abort();
    abortControllers.delete(sessionId);
    agentRuntime?.disposeSession(sessionId);
    options.clearPendingStreamItemUpdatesForSession(sessionId);
    options.sessions.delete(sessionId);
    options.sessionMemories.delete(sessionId);

    for (const [attachmentId, attachment] of options.attachments) {
      if (attachment.sessionId === sessionId) {
        options.attachments.delete(attachmentId);
      }
    }

    for (const item of session.items) {
      if (item.kind === "file") {
        options.artifacts.delete(item.artifactId);
      }
    }

    options.schedulePersistState();
    options.sendEvent({ id: options.createId("event"), type: "session.deleted", sessionId });

    return Array.from(options.sessions.values());
  }

  function addItem(sessionId: string, item: StreamItem): StreamItem {
    const session = options.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.items.push(item);
    session.updatedAt = options.now();
    options.sessions.set(sessionId, session);
    options.schedulePersistState();
    options.sendEvent({ id: options.createId("event"), type: "stream.item.added", sessionId, payload: item });
    return item;
  }

  function updateItem(sessionId: string, item: StreamItem): void {
    const session = options.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const index = session.items.findIndex((existing) => existing.id === item.id);
    if (index >= 0) {
      session.items[index] = item;
    }
    session.updatedAt = options.now();
    options.sessions.set(sessionId, session);
    options.schedulePersistState();
    options.sendStreamItemUpdatedEvent(sessionId, item);
  }

  function setSessionStatus(sessionId: string, status: ChatSession["status"]): void {
    const session = options.sessions.get(sessionId);
    if (!session) return;
    session.status = status;
    session.updatedAt = options.now();
    options.sessions.set(sessionId, session);
    options.schedulePersistState();
    options.sendEvent({ id: options.createId("event"), type: "session.updated", payload: session });
  }

  function startToolCall(sessionId: string, toolName: string, summary: string): StreamItem {
    return addItem(sessionId, {
      id: options.createId("tool"),
      kind: "tool",
      toolCallId: options.createId("toolcall"),
      toolName,
      status: "running",
      summary,
      createdAt: options.now()
    });
  }

  function finishToolCall(sessionId: string, item: StreamItem, status: "success" | "failed", summary: string): void {
    if (item.kind !== "tool") return;
    item.status = status;
    item.summary = summary;
    updateItem(sessionId, item);
  }

  function addStage(sessionId: string, title: string, detail?: string): void {
    addItem(sessionId, {
      id: options.createId("stage"),
      kind: "stage",
      title,
      detail,
      createdAt: options.now()
    });
  }

  function appendSessionMemory(sessionId: string, source: string, content: string): void {
    const memory = options.sessionMemories.get(sessionId) ?? [];
    memory.push({ source, content: compactText(content, MAX_DOCUMENT_CONTEXT_CHARS) });

    let total = memory.reduce((sum, item) => sum + item.content.length, 0);
    while (total > MAX_SESSION_MEMORY_CHARS && memory.length > 1) {
      const removed = memory.shift();
      total -= removed?.content.length ?? 0;
    }
    options.sessionMemories.set(sessionId, memory);
    options.schedulePersistState();
  }

  function formatSessionMemory(sessionId: string): string {
    const memory = options.sessionMemories.get(sessionId) ?? [];
    if (!memory.length) return "";
    return memory.map((item) => `## ${item.source}\n${item.content}`).join("\n\n");
  }

  function getArtifactKind(filePath: string): ArtifactKind {
    const ext = extname(filePath).toLowerCase();
    if (ext === ".docx") return "docx";
    if (ext === ".pdf") return "pdf";
    if (ext === ".png") return "png";
    if (ext === ".jpg") return "jpg";
    if (ext === ".jpeg") return "jpeg";
    if (ext === ".webp") return "webp";
    if (ext === ".svg") return "svg";
    if (ext === ".json") return "json";
    if (ext === ".md") return "md";
    if (ext === ".txt") return "txt";
    if (ext === ".log") return "log";
    return "other";
  }

  function createArtifact(sessionId: string, filePath: string, name = basename(filePath)): ArtifactSummary {
    const existing = findSessionArtifactByPath(sessionId, filePath);
    if (existing) {
      const refreshed: ArtifactSummary = {
        ...existing,
        sessionId,
        name,
        size: existsSync(filePath) ? statSync(filePath).size : existing.size,
        createdAt: options.now()
      };
      options.artifacts.set(refreshed.id, refreshed);
      ensureArtifactStreamItem(sessionId, refreshed, { refreshExisting: true });
      options.sendEvent({ id: options.createId("event"), type: "artifact.created", sessionId, payload: refreshed });
      options.schedulePersistState();
      return refreshed;
    }

    const artifact: ArtifactSummary = {
      id: options.createId("artifact"),
      sessionId,
      name,
      kind: getArtifactKind(filePath),
      path: filePath,
      size: existsSync(filePath) ? statSync(filePath).size : 0,
      createdAt: options.now()
    };
    options.artifacts.set(artifact.id, artifact);
    ensureArtifactStreamItem(sessionId, artifact);
    options.sendEvent({ id: options.createId("event"), type: "artifact.created", sessionId, payload: artifact });
    options.schedulePersistState();
    return artifact;
  }

  function ensureArtifactStreamItem(
    sessionId: string,
    artifact: ArtifactSummary,
    behavior: { refreshExisting?: boolean } = {}
  ): void {
    const session = options.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const existingIndex = session.items.findIndex((item) => item.kind === "file" && item.artifactId === artifact.id);
    if (existingIndex >= 0 && !behavior.refreshExisting) {
      return;
    }
    if (existingIndex >= 0) {
      const existingItem = session.items[existingIndex];
      if (existingItem.kind !== "file") return;
      const fileItem: StreamItem = {
        ...existingItem,
        name: artifact.name,
        fileKind: artifact.kind,
        createdAt: artifact.createdAt
      };
      session.items.splice(existingIndex, 1);
      session.items.push(fileItem);
      session.updatedAt = options.now();
      options.sessions.set(sessionId, session);
      options.schedulePersistState();
      options.sendStreamItemUpdatedEvent(sessionId, fileItem);
      return;
    }
    addItem(sessionId, {
      id: options.createId("file"),
      kind: "file",
      artifactId: artifact.id,
      name: artifact.name,
      fileKind: artifact.kind,
      createdAt: options.now()
    });
  }

  function findSessionArtifactByPath(sessionId: string, filePath: string): ArtifactSummary | undefined {
    const normalizedPath = resolve(filePath).toLowerCase();
    return Array.from(options.artifacts.values()).find(
      (artifact) => resolve(artifact.path).toLowerCase() === normalizedPath && artifactBelongsToSession(artifact, sessionId)
    );
  }

  function listArtifacts(input?: ArtifactListInput): ArtifactSummary[] {
    const allArtifacts = Array.from(options.artifacts.values());
    const filtered = input?.sessionId
      ? allArtifacts.filter((artifact) => artifactBelongsToSession(artifact, input.sessionId!))
      : allArtifacts;

    return filtered.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  function artifactBelongsToSession(artifact: ArtifactSummary, sessionId: string): boolean {
    if (artifact.sessionId === sessionId) return true;
    const session = options.sessions.get(sessionId);
    return Boolean(session?.items.some((item) => item.kind === "file" && item.artifactId === artifact.id));
  }

  function buildMessages(session: ChatSession): ChatCompletionMessageParam[] {
    const systemPrompt = buildAgentModelingSystemPrompt();

    const messages: ChatCompletionMessageParam[] = [{ role: "system", content: systemPrompt }];
    const resources = buildAvailableResourceContext(session);
    if (resources) {
      messages.push({
        role: "system",
        content: resources
      });
    }

    const memory = formatSessionMemory(session.id);
    if (memory) {
      messages.push({
        role: "system",
        content: `以下是本会话已沉淀的项目档案、附件上下文和工具结果。继续对话时优先基于这些信息更新项目档案；最终分析和交付时必须优先参考。注意：只有“已确认事实”可以写成确定事实；“待补充信息”、工具规划任务和模型推断都不能写成项目已经具备的现状。\n\n${memory}`
      });
    }

    if (session.workflow) {
      messages.push({
        role: "system",
        content: formatWorkflowContext(session.workflow)
      });
    }

    for (const item of session.items) {
      if (item.kind !== "message") continue;
      const content = item.content.trim();
      if (!content) continue;
      messages.push({
        role: item.role === "user" ? "user" : "assistant",
        content
      });
    }
    return messages;
  }

  function buildAvailableResourceContext(session: ChatSession): string {
    const lines = [
      "以下是本会话可按需读取的文件资源。这些资源尚未读取，只有在用户任务需要时才调用读取工具。",
      "图片或截图附件：如果 Chat 模型已配置图像输入能力，可直接依据本轮图片分析；否则使用 read_image 识别。文本、表格和文档附件按对应读取工具处理。"
    ];
    const sessionAttachments = getSessionAttachments(session.id);
    if (sessionAttachments.length) {
      lines.push(
        "用户附件：",
        ...sessionAttachments.map((attachment, index) => `${index + 1}. ${attachment.name} (${attachment.path})`)
      );
    }

    return lines.join("\n");
  }

  function getSessionAttachments(sessionId: string): AttachmentRef[] {
    const session = options.sessions.get(sessionId);
    const ids = new Set<string>();
    for (const item of session?.items ?? []) {
      if (item.kind === "message") {
        for (const attachmentId of item.attachmentIds ?? []) {
          ids.add(attachmentId);
        }
      }
    }

    return Array.from(options.attachments.values()).filter(
      (attachment) => attachment.sessionId === sessionId || ids.has(attachment.id)
    );
  }

  function getSessionReadableFiles(sessionId: string): string[] {
    return getSessionAttachments(sessionId).map((attachment) => attachment.path);
  }

  function buildUserMessageContent(input: ChatPromptInput): string {
    const message = input.message.trim();
    const attachmentNames = input.attachments?.map((attachment) => attachment.name).filter(Boolean) ?? [];

    if (!attachmentNames.length) return message;

    const attachmentText = `附件：${attachmentNames.join("、")}`;
    if (!message) return `已上传 ${attachmentNames.length} 个附件。\n${attachmentText}`;
    return `${message}\n\n${attachmentText}`;
  }

  async function buildPromptImages(
    attachments: AttachmentRef[] | undefined,
    settings: AppSettings
  ): Promise<ImageContent[] | undefined> {
    if (!settings.openai.chatImageInputEnabled || !attachments?.length) return undefined;

    const images: ImageContent[] = [];
    for (const attachment of attachments) {
      if (!isSupportedImageFile(attachment.path)) continue;
      const image = await readImageDataUrl(attachment.path, MAX_VISION_IMAGE_BYTES);
      images.push({
        type: "image",
        data: image.dataBase64,
        mimeType: image.mimeType
      });
    }

    return images.length ? images : undefined;
  }

  function createAssistantMessage(sessionId: string): MessageStreamItem {
    return addItem(sessionId, {
      id: options.createId("msg"),
      kind: "message",
      role: "assistant",
      content: "",
      isFinished: false,
      createdAt: options.now()
    }) as MessageStreamItem;
  }

  function getSessionWorkingInputDir(sessionId: string): string {
    return options.getSessionInputDir(sessionId);
  }

  function getSessionWorkingOutputDir(sessionId: string): string {
    return options.getSessionOutputDir(sessionId);
  }

  function getSessionImportDir(sessionId: string): string {
    return getSessionWorkingInputDir(sessionId);
  }

  function ensureSessionImportDir(sessionId: string): string {
    const dir = getSessionImportDir(sessionId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  function createAgentRuntimeHost(): AgentRuntimeHost {
    return {
      rootDir: options.rootDir,
      getSessionRootDir: (sessionId) => options.sessions.get(sessionId)?.projectPath || options.rootDir,
      docsDir: options.docsDir,
      inputDir: options.inputDir,
      outputDir: options.outputDir,
      getSessionInputDir: getSessionWorkingInputDir,
      getSessionOutputDir: getSessionWorkingOutputDir,
      loadSettings: options.loadEnv,
      getSession: (sessionId) => options.sessions.get(sessionId),
      buildMessages,
      createAssistantMessage,
      updateItem,
      startToolCall,
      finishToolCall,
      addStage,
      appendSessionMemory,
      formatSessionMemory,
      getSessionReadableFiles,
      getBundledPythonRuntime: () => findBundledPythonRuntime({ rootDir: options.projectRootDir, resourcesDir: options.resourcesDir }),
      getSceneSnapshot: options.getSceneSnapshot,
      executeSceneCommand: options.executeSceneCommand,
      placeComponentLibraryItem: options.placeComponentLibraryItem,
      createReconstructionWorkflow: options.createReconstructionWorkflow,
      createArtifact: (sessionId, filePath) => {
        createArtifact(sessionId, filePath);
      }
    };
  }

  async function runAgentResponse(
    sessionId: string,
    controller: AbortController,
    userPrompt: string,
    onAssistantCreated: (assistantItem: MessageStreamItem) => void,
    images?: ImageContent[]
  ): Promise<MessageStreamItem> {
    agentRuntime ??= createAgentRuntime(createAgentRuntimeHost());
    return agentRuntime.runTurn({
      sessionId,
      userPrompt,
      images,
      controller,
      onAssistantCreated
    });
  }

  async function handlePrompt(input: ChatPromptInput): Promise<{ accepted: true }> {
    const session = options.sessions.get(input.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }
    options.ensureProjectDirs(session.projectPath);
    const userContent = buildUserMessageContent(input);

    if (session.title === "新的空间设计对话" && userContent) {
      session.title = userContent.replace(/\s+/g, " ").slice(0, 24);
    }

    addItem(input.sessionId, {
      id: options.createId("msg"),
      kind: "message",
      role: "user",
      content: userContent,
      isFinished: true,
      createdAt: options.now(),
      attachmentIds: input.attachments?.map((attachment) => attachment.id)
    });

    setSessionStatus(input.sessionId, "running");
    const controller = new AbortController();
    abortControllers.set(input.sessionId, controller);
    let assistantItem: MessageStreamItem | undefined;

    void Promise.resolve()
      .then(async () => {
        const promptImages = await buildPromptImages(input.attachments, options.loadEnv());
        assistantItem = await runAgentResponse(
          input.sessionId,
          controller,
          input.message,
          (createdItem) => {
            assistantItem = createdItem;
          },
          promptImages
        );
        assistantItem.isFinished = true;
        updateItem(input.sessionId, assistantItem);
      })
      .then(() => {
        setSessionStatus(input.sessionId, "completed");
      })
      .catch((error: unknown) => {
        if (!options.sessions.has(input.sessionId)) {
          return;
        }
        if (assistantItem?.kind === "message") {
          assistantItem.isFinished = true;
          assistantItem.content += `\n\n> 生成中断：${error instanceof Error ? error.message : String(error)}`;
          updateItem(input.sessionId, assistantItem);
        } else {
          addItem(input.sessionId, {
            id: options.createId("msg"),
            kind: "message",
            role: "assistant",
            content: `> 生成中断：${error instanceof Error ? error.message : String(error)}`,
            isFinished: true,
            createdAt: options.now()
          });
        }
        setSessionStatus(input.sessionId, "failed");
      })
      .finally(() => {
        abortControllers.delete(input.sessionId);
      });

    return { accepted: true };
  }


  function abortPrompt(sessionId: string): void {
    abortControllers.get(sessionId)?.abort();
    abortControllers.delete(sessionId);
    setSessionStatus(sessionId, "idle");
  }

  function dispose(): void {
    agentRuntime?.dispose();
    agentRuntime = undefined;
  }

  return {
    createSession,
    renameSession,
    deleteSession,
    listArtifacts,
    handlePrompt,
    abortPrompt,
    dispose
  };
}

function formatWorkflowContext(workflow: NonNullable<ChatSession["workflow"]>): string {
  const unanswered = workflow.questions
    .filter((question) => question.required && !question.selectedOptionId)
    .map((question) => question.id);
  return [
    "当前 3D 重建编排状态（这是权威状态，不要绕过）：",
    `方案：${workflow.title}；版本 ${workflow.revision}；状态 ${workflow.status}。`,
    `必答问题：${unanswered.length ? unanswered.join("、") : "已全部回答"}。`,
    `资产：${workflow.assets.map((asset) => `${asset.name}:${asset.status}`).join("；")}。`,
    workflow.status === "ready_for_confirmation"
      ? "必须等待用户点击方案卡片中的“按当前方案生成”，不得直接开始资产生成或摆放。"
      : workflow.status === "needs_clarification"
        ? "等待用户选择方案卡片中的必答选项；可解释选项影响或根据用户新文字创建新版本。"
        : "仅报告当前任务状态；如用户要求修改，创建新版本并重新确认。"
  ].join("\n");
}
