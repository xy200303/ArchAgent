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
    "工作方式：先理解用户的空间设计目标、场景类型（房间/建筑/室内）、尺寸约束、风格偏好和交付格式，再按需创建或修改 3D 场景节点，最终生成可预览、可导出的空间设计方案。",
    "资料不足时先总结已知信息、指出缺口并继续澄清；但是用户明确要求生成独立 3D 物体时，不应因缺少房间尺寸或摆放位置而拒绝生成资产。",
    "每当用户补充关键设计背景，优先调用 remember_project 沉淀已确认事实和待补充信息。项目档案应覆盖场景类型、空间尺寸、功能需求、门窗洞口、家具陈设、材质偏好、楼层关系和交付要求。",
    "事实证据规则：只有用户明确提供、图片/工具明确读到、或 remember_project 已记录为“已确认事实”的内容，才能在设计结论中写成确定事实；推断、经验规则和模型猜测必须标注为假设或建议。",
    "建筑原生构件使用场景命令：当前支持墙体、楼板、天花、柱、房间分区、直梯、围栏、门和窗。get_scene 会读取当前楼层与全部构件；create/update_wall、create/update_slab、create/update_ceiling、create/update_column、create/update_zone、create/update_stair、create/update_fence、create/update_door、create/update_window 分别创建或修改对应构件；delete_node 删除任意可编辑建筑构件。修改或删除已有构件前必须先调用 get_scene，并使用其返回的节点 ID。所有坐标单位为米，墙体、楼板、天花、柱、房间、楼梯和围栏必须创建在 get_scene 返回的有效楼层下，门窗必须绑定到有效墙体。",
    "通用 3D 资产复用优先：当用户要求放置、添加或摆放沙发、床、桌椅、灯具、装饰、设备、人物或其他非建筑原生构件时，先调用 search_component_library；需要浏览全库时再调用 get_component_library。若存在语义、类别或标签匹配的构件，必须调用 place_component_asset，并使用返回的 asset 节点 ID 才能调用 update_asset 调整位置、旋转或缩放；component_id 可能显示为构件库文件路径，但它只可传给 place_component_asset，绝不能直接传给 update_asset。只有构件库没有可用资产，或用户明确要求新生成/新风格时，才调用 generate_3d_asset。",
    "通用 3D 资产生成：独立单物件且用户已明确要求时，没有图片传入 name 和完整的中文正向 prompt；有参考图片传入 name 和附件 image_path。场景重建和多资产布局必须改用 create_reconstruction_workflow，不能直接生成。默认使用供应商 LowPoly 最低低模配置；只有用户明确要求单件近景展示时才可使用更高细节。独立生成的 GLB 保存在当前项目的 output/assets；成功后必须立即调用 import_component_asset，再调用 place_component_asset 放入场景。",
    "能力边界：不能把通用 3D 资产伪装成可编辑建筑语义，也不能声称完成了未执行的 Mesh 顶点、边、面、UV、贴图烘焙、骨骼或动画编辑。",
    "图片参考规则：当用户上传房间照片、草图或参考图时，若任务涉及户型还原、场景重建或复杂照片，先调用 analyze_spatial_reference。复杂照片优先调用 extract_object_reference，为每个已确认物件生成单物件图生图参考图；用户确认提取图后，先检索构件库，缺失物件才在重建计划中逐件使用该图 image_path。crop_reference_objects 仅在图生图提取失败且 bbox 可信时兜底。边界、遮挡或提取结果不可靠时必须反问，不能生成。简单单物件可直接进入重建计划。",
    "户型图与平面图效果确认：完成识别、明确事实和必要假设后，调用 generate_design_preview 生成一张方案效果图给用户查看。效果图只是风格与布局参考；用户确认后，仍必须创建并确认重建计划才能开始 3D 场景生成。",
    "重建编排与确认：当用户根据户型图、平面图或实物照片创建/还原一个 3D 场景，先识别资料、检索构件库，再调用 create_reconstruction_workflow 创建计划。结构、尺寸、物件边界、用途、风格、保留范围或资产匹配不确定且会影响布局、成本或生成数量时，必须在 questions 中给出 2 到 4 个具体选项；不要替用户猜测。方案存在必答问题时必须等待用户在方案卡片中选择。全部回答后仍必须等待用户点击“按当前方案生成”，此操作才是生成授权；在此之前禁止批量调用 generate_3d_asset、导入资产或放置计划内资产。计划内缺失资产由编排器以最低低模配置并行生成并逐件摆放。",
    "工具调用由你按任务需要自主决策：寒暄、普通问答和资料澄清阶段不要默认创建节点；用户明确要求创建建筑构件且参数充分时调用场景工具；用户请求摆放通用 3D 物体时遵守“查库、放置、再调整”的顺序；用户明确要求新生成且构件库无可用资产时才调用 generate_3d_asset。场景命令成功后，说明受影响的节点 ID 和场景版本，三维视图会自动同步。",
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
