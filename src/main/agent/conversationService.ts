/** Owns chat sessions, Agent turns, stream events, memory, and generated artifact registration. */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { ImageContent } from "@earendil-works/pi-ai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type {
  AppSettings,
  ArtifactKind,
  ArtifactListInput,
  ArtifactSummary,
  AttachmentRef,
  SessionResource,
  ChatPromptInput,
  ChatSession,
  RendererEvent,
  StreamItem,
  RenameSessionInput
} from "../../shared/types";
import { linkSessionResource, resourceFromArtifact } from "../resources/sessionResources";
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
import { toAgentFailure } from "./agentFailure";
import { findBundledPythonRuntime } from "../runtime/bundledRuntime";
import type { SessionMemoryEntry } from "../projects/sessionPersistence";
import type { SceneCommandInput, SceneCommandResult, SceneSnapshot } from "../../shared/modeling3d/sceneContracts";

const MAX_DOCUMENT_CONTEXT_CHARS = 24000;
const MAX_SESSION_MEMORY_CHARS = 90000;

/** Defines the modeling decision boundary shared by both OpenAI and Pi Agent runtimes. */
export function buildAgentModelingSystemPrompt(): string {
  return [
    "你是 ArchAgent，一个基于腾讯混元 Hy3 模型的桌面空间设计智能体。",
    "只可调用以下工具：search_resources、view_resources、extract_reference_object、generate_3d_asset、edit_library_asset、search_library_assets、preview_library_asset_placement、place_library_assets、inspect_scene、view_scene_preview、update_scene_object、create_architecture_elements、update_architecture_elements、create_reconstruction_plan、generate_design_preview、send_file，以及按权限开放的 exec_bash。不得提及或调用旧工具名。",
    "工作方式：先理解用户的空间设计目标、场景类型（房间/建筑/室内）、尺寸约束、风格偏好和交付格式，再按需创建或修改 3D 场景节点，最终生成可预览、可导出的空间设计方案。",
    "资料不足时先总结已知信息、指出缺口并继续澄清；但是用户明确要求生成独立 3D 物体时，不应因缺少房间尺寸或摆放位置而拒绝生成资产。",
    "每当用户补充关键设计背景，都应在后续回复和重建计划中保留已确认事实、待补充信息与设计进度。项目档案应覆盖场景类型、空间尺寸、功能需求、门窗洞口、家具陈设、材质偏好、楼层关系和交付要求。",
    "事实证据规则：只有用户明确提供、图片/工具明确读到、或 remember_project 已记录为“已确认事实”的内容，才能在设计结论中写成确定事实；推断、经验规则和模型猜测必须标注为假设或建议。",
    "场景编辑：首次操作、缺少目标 ID 或状态不清晰时调用 inspect_scene 获取场景状态和公开 ID；每个成功的场景写入工具都会回传更新后的等价场景摘要和公开 ID，不得在其后机械重复 inspect_scene。建筑构件是空间基准，使用世界米制坐标：平面点为 [x,z]，三维点为 [x,y,z]，X 向东/右、Y 向上、Z 向南/前；贴墙家具优先用 anchor.side=room_interior（inside 为兼容别名），工具会按房间/楼板边界自动判定室内侧，不依赖墙体 start→end 方向。需要确认时先调用 preview_library_asset_placement。",
    "资产：先用 search_library_assets 搜索可复用资产，结果中的 library_asset_id 是唯一允许传给 place_library_assets 的资产标识。找不到资产时，必须先取得用户对该资产的明确确认，再调用 generate_3d_asset；它会生成 GLB、自动入库并返回 library_asset_id，随后可查看预览或调用 place_library_assets。已生成资产需要改名、分类、标签或目标尺寸时调用 edit_library_asset(mode=metadata)；需要改变模型外观时调用 edit_library_asset(mode=regenerate)，它会生成新的派生资产，绝不悄悄修改原资产或已放置实例。生成调用的 name 指定目标资产，prompt 可自然包含外观、用途、环境或摆放语境；生成服务会聚焦目标资产本体，不做关键词拦截。人物、动物和多个物件之间的完整互动可以生成，但所有组成部分必须完整包含在资产内，不能截断或悬挂。用户给出精确长宽高时，必须传 target_dimensions_meters=[宽,高,深]（米），由应用按模型包围盒自动校准；绝不把尺寸要求只写在 prompt 中。无法唯一确定目标资产时先询问用户。家具优先用 anchor={element_id,side,distance}+local=[沿墙,高度,额外离墙] 锚定墙体；只有精确布局时才使用世界 position=[x,y,z]。朝向优先 facing（north/south/east/west/wall_inward/wall_outward）或 look_at，rotation_degrees=[pitch,yaw,roll]（度）仅作兜底。已知物件实际宽深时传 footprint_meters=[宽,深]，工具会阻止与已有已知占地模型重叠；没有可靠尺寸时不得假装已完成碰撞校验。实例化后得到 scene_object_id 和显示名，后续只用 update_scene_object 修改。绝不传递文件路径、GLB 路径或内部实现 ID。",
    "工具纪律：没有成功的工具结果，不得声称“已放置”“正在放置”或“马上放置”。场景或资产工具失败后，下一步必须调用 inspect_scene；严禁复用失败参数。连续两次无法恢复时，停止调用并向用户说明已执行的工具、返回错误和需要的输入，不得用文字承诺代替工具调用。",
    "重建：用 create_reconstruction_plan 把需求拆成原子资产清单：一项只对应一种独立实体，可用 quantity 表示重复数量，绝不能把房间、隔墙、墙体、建筑、布局或多物件场景写入资产项。每个需要落地的资产都使用与 place_library_assets 相同的 position 或 anchor+local、facing/look_at、footprint_meters 语义。生3D严格只生成一个可独立放置的实体（例如一张沙发、一个花瓶）；建筑构件统一用 create_architecture_elements（即使只有一个元素也传单项数组），每项 kind 决定 properties 参数：wall/fence 需要 start/end，slab/ceiling/zone 需要 polygon，column/stair 需要 position，door/window 需要 wall_reference 和 offset；修改或删除统一用 update_architecture_elements。复杂实拍图必须先 extract_reference_object 得到并确认单物件图，再图生3D。关键不确定项必须给出 2 到 4 个选项；用户明确确认单件资产后，Agent 调用 generate_3d_asset 逐项生成。",
    "能力边界：不能把通用 3D 资产伪装成可编辑建筑语义，也不能声称完成了未执行的 Mesh 顶点、边、面、UV、贴图烘焙、骨骼或动画编辑。",
    "资料：用户上传的图片会直接附带给 Hy3 主模型；必须基于原图、用户描述与已确认事实推理，不得调用独立视觉识别工具。需要查看历史图片、文档、数据或 3D 预览时调用 view_resources(resource_ids,purpose)。复杂照片可用 extract_reference_object 生成单物件提取图，并把“正确/重新提取/跳过”作为重建计划的必答选项。",
    "户型图与平面图：使用 generate_design_preview 交付效果图；效果图只是布局与风格参考，仍须走重建计划确认。",
    "确认与交付：方案存在必答问题时等待用户在方案卡片选择；全部回答后仍须点击“按当前方案生成”。效果图、提取图和完成模型均用 send_file 发送给用户。只有 send_file 的成功结果出现 `send_file delivered: artifact_id:` 时，才能对用户声称文件已发送。",
    "工具调用：普通问答和澄清阶段不修改场景；所有资产摆放统一调用 place_library_assets，所有建筑创建统一调用 create_architecture_elements，所有建筑更新或删除统一调用 update_architecture_elements；单项操作也必须传只含一项的数组，从而获得一致的事务与错误语义。成功写入返回的当前场景状态可直接作为下一次操作输入；仅当文字状态不足以判断实际布局、相对位置或明显穿模时调用 view_scene_preview，不能仅凭文字猜测；用户要求查看或接收场景截图时，必须先调用 view_scene_preview，再用返回的 resource_id 调用 send_file；场景命令成功后报告受影响节点。",
    "回复使用中文 Markdown，结论要区分事实、设计结果、假设和建议；必要时给出缺失资料清单。所有工具执行结束后必须给用户一条最终回复，概括已完成事项、可见结果和下一步；过程说明不能替代最终回复。",
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
  resources: Map<string, SessionResource>;
  sessionMemories: Map<string, SessionMemoryEntry[]>;
  ensureProjectDirs: (projectPath: string) => void;
  getSessionInputDir: (sessionId: string) => string;
  getSessionOutputDir: (sessionId: string) => string;
  schedulePersistState: () => void;
  sendEvent: (event: RendererEvent) => void;
  sendResponseItemCreatedEvent: (sessionId: string, item: StreamItem) => void;
  sendResponseItemUpdatedEvent: (sessionId: string, item: StreamItem) => void;
  sendTurnStatusEvent: (sessionId: string, status: "running" | "completed" | "failed") => void;
  clearPendingStreamItemUpdatesForSession: (sessionId: string) => void;
  createId: (prefix: string) => string;
  now: () => string;
  loadEnv: () => AppSettings;
  getSceneSnapshot: () => SceneSnapshot;
  replaceSceneSnapshot?: AgentRuntimeHost["replaceSceneSnapshot"];
  captureScenePreview?: AgentRuntimeHost["captureScenePreview"];
  executeSceneCommand: (command: SceneCommandInput) => SceneCommandResult;
  executeSceneBatch?: AgentRuntimeHost["executeSceneBatch"];
  placeComponentLibraryItem: AgentRuntimeHost["placeComponentLibraryItem"];
  placeComponentLibraryItems?: AgentRuntimeHost["placeComponentLibraryItems"];
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
    options.sendResponseItemCreatedEvent(sessionId, item);
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
    options.sendResponseItemUpdatedEvent(sessionId, item);
  }

  function setSessionStatus(sessionId: string, status: ChatSession["status"]): void {
    const session = options.sessions.get(sessionId);
    if (!session) return;
    session.status = status;
    session.updatedAt = options.now();
    options.sessions.set(sessionId, session);
    options.schedulePersistState();
    if (status === "running" || status === "completed" || status === "failed") {
      options.sendTurnStatusEvent(sessionId, status);
    }
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

  function createArtifact(sessionId: string, filePath: string, parentResourceIds: string[] = [], name = basename(filePath)): ArtifactSummary {
    const projectPath = options.sessions.get(sessionId)?.projectPath;
    if (!projectPath) throw new Error(`Session not found: ${sessionId}`);
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
      const resource = resourceFromArtifact(refreshed, projectPath)!;
      resource.parentResourceIds = parentResourceIds;
      options.resources.set(refreshed.id, resource);
      linkSessionResource(options.sessions.get(sessionId)!, refreshed.id, options.now());
      ensureArtifactStreamItem(sessionId, refreshed, { refreshExisting: true });
      options.sendEvent({ id: options.createId("event"), type: "artifact.created", sessionId, payload: refreshed });
      options.schedulePersistState();
      return refreshed;
    }

    const artifact: ArtifactSummary = {
      id: options.createId("resource"),
      sessionId,
      name,
      kind: getArtifactKind(filePath),
      path: filePath,
      size: existsSync(filePath) ? statSync(filePath).size : 0,
      createdAt: options.now()
    };
    options.artifacts.set(artifact.id, artifact);
    const resource = resourceFromArtifact(artifact, projectPath)!;
    resource.parentResourceIds = parentResourceIds;
    options.resources.set(artifact.id, resource);
    linkSessionResource(options.sessions.get(sessionId)!, artifact.id, options.now());
    ensureArtifactStreamItem(sessionId, artifact);
    options.sendEvent({ id: options.createId("event"), type: "artifact.created", sessionId, payload: artifact });
    options.schedulePersistState();
    return artifact;
  }

  function sendArtifact(sessionId: string, resourceId: string): ArtifactSummary {
    const session = options.sessions.get(sessionId);
    const resource = options.resources.get(resourceId);
    if (!session || !resource || resource.sessionId !== sessionId || !session.resourceLinks?.some((link) => link.resourceId === resourceId)) {
      throw new Error("待发送资源不属于当前会话。");
    }
    if (!existsSync(resource.path)) {
      throw new Error(`待发送文件不存在：${resource.name}`);
    }

    const artifact = options.artifacts.get(resourceId) ?? createArtifact(sessionId, resource.path, resource.parentResourceIds, resource.name);
    addItem(sessionId, {
      id: options.createId("file"),
      kind: "file",
      artifactId: artifact.id,
      name: artifact.name,
      fileKind: artifact.kind,
      createdAt: options.now()
    });
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
      options.sendResponseItemUpdatedEvent(sessionId, fileItem);
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
      "图片或截图会作为多模态内容直接提供给 Hy3；历史图片、文档、表格和模型预览均通过 search_resources 与 view_resources 按需查看。"
    ];
    const sessionResources = getSessionResources(session.id);
    if (sessionResources.length) {
      const visibleResources = sessionResources.slice(0, 20);
      lines.push(
        "会话资源：",
        ...visibleResources.map((resource, index) => `${index + 1}. ${resource.name}（resource_id: ${resource.id}；${resource.kind}；${resource.source}；${resource.confirmed ? "已确认" : "未确认"}）`),
        ...(sessionResources.length > visibleResources.length ? [`其余 ${sessionResources.length - visibleResources.length} 项资源请调用 search_resources 检索。`] : [])
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

  function getSessionResources(sessionId: string): SessionResource[] {
    const session = options.sessions.get(sessionId);
    if (!session) return [];
    const projectPath = session.projectPath;
    const links = new Map((session.resourceLinks ?? []).map((link) => [link.resourceId, link]));
    return Array.from(options.resources.values())
      .flatMap((resource) => {
        if (resolve(resource.projectPath) !== resolve(projectPath)) return [];
        const link = links.get(resource.id);
        return [{ ...resource, confirmed: link?.confirmed ?? false, pinned: link?.pinned ?? false }];
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
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
    resources: SessionResource[],
    userMessage: string
  ): Promise<ImageContent[] | undefined> {
    const selectedPaths = new Set<string>();
    for (const attachment of attachments ?? []) {
      if (isSupportedImageFile(attachment.path)) selectedPaths.add(attachment.path);
    }

    const normalizedMessage = userMessage.toLowerCase();
    const requestsLatestPreview = ["刚才", "上一张", "效果图", "预览", "这张图"].some((term) => normalizedMessage.includes(term));
    const candidates = resources
      .filter((resource) => resource.kind === "image")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    for (const resource of candidates) {
      const explicitlyNamed = normalizedMessage.includes(resource.id.toLowerCase()) || normalizedMessage.includes(resource.name.toLowerCase());
      const shouldAttach = explicitlyNamed || resource.pinned || resource.confirmed || (requestsLatestPreview && resource.source === "generated");
      if (shouldAttach && selectedPaths.size < 4) selectedPaths.add(resource.path);
    }
    if (!selectedPaths.size) return undefined;

    const images = await Promise.all(Array.from(selectedPaths).slice(0, 4).map(async (path) => {
      const image = await readImageDataUrl(path, MAX_VISION_IMAGE_BYTES);
      return {
        type: "image" as const,
        data: image.dataBase64,
        mimeType: image.mimeType
      };
    }));

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
      getSessionAttachments,
      getSessionArtifacts: (sessionId) => Array.from(options.artifacts.values()).filter((artifact) => artifact.sessionId === sessionId),
      getSessionResources,
      getBundledPythonRuntime: () => findBundledPythonRuntime({ rootDir: options.projectRootDir, resourcesDir: options.resourcesDir }),
      getSceneSnapshot: options.getSceneSnapshot,
      replaceSceneSnapshot: options.replaceSceneSnapshot,
      captureScenePreview: options.captureScenePreview ?? (() => Promise.reject(new Error("当前应用未连接 WebGL 预览服务。"))),
      executeSceneCommand: options.executeSceneCommand,
      executeSceneBatch: options.executeSceneBatch,
      placeComponentLibraryItem: options.placeComponentLibraryItem,
      placeComponentLibraryItems: options.placeComponentLibraryItems,
      createReconstructionWorkflow: options.createReconstructionWorkflow,
      createArtifact: (sessionId, filePath, parentResourceIds) => {
        return createArtifact(sessionId, filePath, parentResourceIds);
      },
      sendArtifact: (sessionId, resourceId) => {
        return sendArtifact(sessionId, resourceId);
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
        const promptImages = await buildPromptImages(input.attachments, getSessionResources(input.sessionId), input.message);
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
        if (controller.signal.aborted) {
          setSessionStatus(input.sessionId, "idle");
          return;
        }
        const failure = toAgentFailure(error);
        if (assistantItem?.kind === "message") {
          assistantItem.isFinished = true;
          assistantItem.failure = failure;
          updateItem(input.sessionId, assistantItem);
        } else {
          addItem(input.sessionId, {
            id: options.createId("msg"),
            kind: "message",
            role: "assistant",
            content: "",
            failure,
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
    .flatMap((question) => question.required && !question.selectedOptionId ? [question.id] : []);
  return [
    "当前 3D 重建编排状态（这是权威状态，不要绕过）：",
    `方案：${workflow.title}；版本 ${workflow.revision}；状态 ${workflow.status}。`,
    `必答问题：${unanswered.length ? unanswered.join("、") : "已全部回答"}。已选项：${workflow.questions.flatMap((question) => question.selectedOptionId ? [`${question.id}=${question.options.find((option) => option.id === question.selectedOptionId)?.label ?? question.selectedOptionId}`] : []).join("；") || "无"}。`,
    `资产：${workflow.assets.map((asset) => `${asset.name}:${asset.status}${asset.componentId ? `（library_asset_id=${asset.componentId}）` : ""}${asset.sourceResourceId ? `（resource_id=${asset.sourceResourceId}）` : ""}${asset.prompt ? `（prompt=${asset.prompt}）` : ""}`).join("；")}。`,
    workflow.status === "ready_for_confirmation"
      ? "必须等待用户在逐步确认弹窗中点击“确认并继续”；该操作会把确认写入会话，收到确认消息后再开始资产生成或摆放。"
      : workflow.status === "needs_clarification"
        ? "等待用户选择方案卡片中的必答选项；可解释选项影响或根据用户新文字创建新版本。"
        : workflow.status === "confirmed"
          ? "用户已确认该原子清单。现在由你逐项调用公开工具：库资产可直接 place_library_assets；缺失文本资产调用 generate_3d_asset；缺失图片资产传对应 resource_id 调用 generate_3d_asset。生成后再按计划摆放。不得调用任何后台编排器。"
        : "仅报告当前任务状态；如用户要求修改，创建新版本并重新确认。"
  ].join("\n");
}
