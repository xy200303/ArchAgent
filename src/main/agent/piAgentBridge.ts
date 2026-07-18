/** Adapts the Pi Agent session lifecycle to ArchAgent's host and stream contracts. */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import {
  AuthStorage,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
  defineTool,
  type AgentSession,
  type AgentSessionEvent,
  type ToolDefinition
} from "@mariozechner/pi-coding-agent";
import type { Api, AssistantMessage, Model, TextContent } from "@mariozechner/pi-ai";
import { compactText } from "./agentTools";
import { buildAgentChatTools, executeAgentToolCall, type AgentToolExecutionResult, type AgentToolLayer } from "./agentToolRegistry";
import {
  compactAgentMessagesLocally,
  estimateContextUsage,
  estimateTextTokens,
  resolveContextCompressionSettings,
  type ContextCompressionSettings
} from "./contextCompression";
import { resolveAssistantDisplayTextOrThrow } from "./piAgentResult";
import { convertJsonSchemaToTypeBoxSchema } from "./piToolSchema";
import type { AgentRuntime, AgentRuntimeHost, AgentRuntimeTurnInput, MessageStreamItem } from "./agentRuntime";
import type { AppSettings, StreamItem } from "../../shared/types";

export { convertJsonSchemaToTypeBoxSchema } from "./piToolSchema";

const ARCH_AGENT_PROVIDER = "archagent-hy3";
const PI_TOOL_SCHEMA_VERSION = 8;
const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0
  }
};

interface PiSessionState {
  session: AgentSession;
  loader: DefaultResourceLoader;
  configSignature: string;
  toolNames: string[];
  systemPrompt: string;
  activeUserPrompt: string;
  activeSignal?: AbortSignal;
  model: Model<Api>;
  compression: ContextCompressionSettings;
  toolDefinitionTokens: number;
  unsubscribe?: () => void;
}

export function createPiAgentBridge(host: AgentRuntimeHost): AgentRuntime {
  const sessionStates = new Map<string, PiSessionState>();

  return {
    async runTurn(input) {
      const appSession = host.getSession(input.sessionId);
      if (!appSession) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }

      const currentUserPrompt = getLatestUserPrompt(host, input.sessionId) || input.userPrompt;
      const state = await ensurePiSessionState(host, input, sessionStates, currentUserPrompt);
      const assistantItem = await runPiPrompt(host, state, input, currentUserPrompt);
      return assistantItem;
    },
    disposeSession(sessionId) {
      disposePiSessionState(sessionStates.get(sessionId));
      sessionStates.delete(sessionId);
    },
    dispose() {
      for (const state of sessionStates.values()) {
        disposePiSessionState(state);
      }
      sessionStates.clear();
    }
  };
}

function disposePiSessionState(state: PiSessionState | undefined): void {
  if (!state) return;
  state.unsubscribe?.();
  state.session.abortCompaction();
  void state.session.abort();
  state.session.dispose();
}

async function ensurePiSessionState(
  host: AgentRuntimeHost,
  input: AgentRuntimeTurnInput,
  sessionStates: Map<string, PiSessionState>,
  currentUserPrompt: string
): Promise<PiSessionState> {
  const settings = host.loadSettings();
  const signature = buildConfigSignature(settings, host.getSession(input.sessionId)?.workflow?.status);
  const existing = sessionStates.get(input.sessionId);
  if (existing?.configSignature === signature) {
    existing.systemPrompt = buildPiSystemPrompt(host, input.sessionId);
    existing.activeUserPrompt = currentUserPrompt;
    existing.activeSignal = input.controller.signal;
    await refreshPiSession(existing);
    return existing;
  }

  disposePiSessionState(existing);

  const state = await createPiSessionState(host, input, settings, signature, currentUserPrompt);
  sessionStates.set(input.sessionId, state);
  return state;
}

async function createPiSessionState(
  host: AgentRuntimeHost,
  input: AgentRuntimeTurnInput,
  settings: AppSettings,
  configSignature: string,
  currentUserPrompt: string
): Promise<PiSessionState> {
  const sessionOutputDir = host.getSessionOutputDir(input.sessionId);
  const agentDir = resolve(sessionOutputDir, "..", "pi-agent");
  mkdirSync(agentDir, { recursive: true });
  const sessionRootDir = host.getSessionRootDir(input.sessionId);

  const authStorage = AuthStorage.inMemory();
  const modelRegistry = ModelRegistry.inMemory(authStorage);
  const model = registerArchAgentOpenAiModel(modelRegistry, settings);
  const toolDefinitions = createArchAgentPiTools(host, input.sessionId, settings);
  const toolNames = toolDefinitions.map((tool) => tool.name);
  const systemPrompt = buildPiSystemPrompt(host, input.sessionId);
  const compression = resolveContextCompressionSettings(settings);
  const settingsManager = SettingsManager.inMemory({
    compaction: {
      enabled: true,
      reserveTokens: compression.reserveTokens,
      keepRecentTokens: compression.keepRecentTokens
    }
  });
  const sessionManager = SessionManager.inMemory(sessionRootDir);
  for (const message of buildInitialPiHistory(host, input.sessionId, model)) {
    sessionManager.appendMessage(message);
  }
  const stateRef: Pick<PiSessionState, "systemPrompt" | "activeUserPrompt" | "activeSignal"> = {
    systemPrompt,
    activeUserPrompt: currentUserPrompt,
    activeSignal: input.controller.signal
  };
  const loader = new DefaultResourceLoader({
    cwd: sessionRootDir,
    agentDir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => stateRef.systemPrompt,
    appendSystemPromptOverride: () => []
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd: sessionRootDir,
    agentDir,
    authStorage,
    modelRegistry,
    model,
    thinkingLevel: resolveThinkingLevel(settings),
    customTools: toolDefinitions,
    tools: toolNames,
    noTools: "builtin",
    resourceLoader: loader,
    sessionManager,
    settingsManager
  });
  session.agent.state.messages = sessionManager.buildSessionContext().messages;

  const state: PiSessionState = {
    session,
    loader,
    configSignature,
    toolNames,
    systemPrompt,
    activeUserPrompt: currentUserPrompt,
    activeSignal: input.controller.signal,
    model,
    compression,
    toolDefinitionTokens: estimateTextTokens(JSON.stringify(toolDefinitions))
  };

  Object.defineProperty(stateRef, "systemPrompt", {
    get: () => state.systemPrompt
  });
  Object.defineProperty(stateRef, "activeUserPrompt", {
    get: () => state.activeUserPrompt
  });
  Object.defineProperty(stateRef, "activeSignal", {
    get: () => state.activeSignal
  });

  await refreshPiSession(state);
  return state;
}

async function refreshPiSession(state: PiSessionState): Promise<void> {
  await state.loader.reload();
  await state.session.reload();
  state.session.setActiveToolsByName(state.toolNames);
}

async function runPiPrompt(
  host: AgentRuntimeHost,
  state: PiSessionState,
  input: AgentRuntimeTurnInput,
  prompt: string
): Promise<MessageStreamItem> {
  let assistantItem: MessageStreamItem | undefined;
  const toolItems = new Map<string, StreamItem>();
  const toolArgs = new Map<string, unknown>();
  const sealedAssistantTexts: string[] = [];
  const assistantCompletion: {
    finalText?: string;
    stopReason?: AssistantMessage["stopReason"];
    errorMessage?: string;
  } = {};
  const abort = () => {
    state.session.abortCompaction();
    void state.session.abort();
  };

  input.controller.signal.addEventListener("abort", abort, { once: true });
  state.unsubscribe = state.session.subscribe((event) => {
    handlePiSessionEvent(event, {
      host,
      input,
      state,
      toolItems,
      toolArgs,
      sealedAssistantTexts,
      assistantCompletion,
      getAssistantItem: () => assistantItem,
      setAssistantItem: (item) => {
        assistantItem = item;
      }
    });
  });

  try {
    await compactPiContextIfNeeded(host, state, input, prompt);
    await state.session.prompt(prompt, {
      expandPromptTemplates: false,
      images: input.images?.length ? input.images : undefined,
      source: "interactive"
    });

    const finalText = resolveAssistantDisplayTextOrThrow({
      finalText:
        assistantCompletion.finalText ??
        stripSealedAssistantText(state.session.getLastAssistantText(), sealedAssistantTexts),
      assistantContent: assistantItem?.content,
      toolItems,
      stopReason: assistantCompletion.stopReason,
      errorMessage: assistantCompletion.errorMessage
    });
    if (!assistantItem) {
      assistantItem = host.createAssistantMessage(input.sessionId);
      input.onAssistantCreated(assistantItem);
    }
    if (assistantItem.content !== finalText) {
      assistantItem.content = finalText;
      host.updateItem(input.sessionId, assistantItem);
    }
    return assistantItem;
  } finally {
    input.controller.signal.removeEventListener("abort", abort);
    state.unsubscribe?.();
    state.unsubscribe = undefined;
    state.activeSignal = undefined;
  }
}

function handlePiSessionEvent(
  event: AgentSessionEvent,
  context: {
    host: AgentRuntimeHost;
    input: AgentRuntimeTurnInput;
    state: PiSessionState;
    toolItems: Map<string, StreamItem>;
    toolArgs: Map<string, unknown>;
    sealedAssistantTexts: string[];
    assistantCompletion: {
      finalText?: string;
      stopReason?: AssistantMessage["stopReason"];
      errorMessage?: string;
    };
    getAssistantItem: () => MessageStreamItem | undefined;
    setAssistantItem: (item: MessageStreamItem | undefined) => void;
  }
): void {
  switch (event.type) {
    case "message_update": {
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta") {
        const assistantItem = ensureAssistantItem(context);
        assistantItem.content += update.delta;
        context.host.updateItem(context.input.sessionId, assistantItem);
        return;
      }
      if (update.type === "done") {
        captureAssistantCompletion(update.message, context);
        return;
      }
      if (update.type === "error") {
        captureAssistantCompletion(update.error, context);
        return;
      }
      return;
    }
    case "message_end": {
      if (event.message.role !== "assistant") return;
      captureAssistantCompletion(event.message, context);
      return;
    }
    case "tool_execution_start": {
      sealCurrentAssistantAsProcessNote(context);
      const item = context.host.startToolCall(
        context.input.sessionId,
        event.toolName,
        `Pi Agent 调用工具 ${event.toolName}`
      );
      if (item.kind === "tool") {
        item.toolCallId = event.toolCallId;
        item.inputPreview = compactText(JSON.stringify(event.args ?? {}, null, 2), 2000);
        context.host.updateItem(context.input.sessionId, item);
      }
      context.toolItems.set(event.toolCallId, item);
      context.toolArgs.set(event.toolCallId, event.args);
      return;
    }
    case "tool_execution_update": {
      const item = context.toolItems.get(event.toolCallId);
      if (item?.kind !== "tool") return;
      item.outputPreview = compactText(formatToolResultContent(event.partialResult), 4000);
      context.host.updateItem(context.input.sessionId, item);
      return;
    }
    case "tool_execution_end": {
      const item = context.toolItems.get(event.toolCallId);
      if (item?.kind !== "tool") return;
      const details = readToolExecutionDetails(event.result);
      const summary = details?.summary || formatToolResultContent(event.result) || `工具 ${event.toolName} 执行完成`;
      const output = details?.content || formatToolResultContent(event.result);
      if (event.isError) {
        item.errorPreview = compactText(output, 6000);
      } else {
        item.outputPreview = compactText(output, 6000);
      }
      context.host.finishToolCall(context.input.sessionId, item, event.isError ? "failed" : "success", summary);
      context.toolArgs.delete(event.toolCallId);
      return;
    }
    default:
      return;
  }
}

async function compactPiContextIfNeeded(
  host: AgentRuntimeHost,
  state: PiSessionState,
  input: AgentRuntimeTurnInput,
  prompt: string
): Promise<void> {
  const before = estimateContextUsage({
    messages: state.session.agent.state.messages,
    systemPrompt: state.systemPrompt,
    pendingPrompt: prompt,
    imageCount: input.images?.length,
    additionalTokens: state.toolDefinitionTokens,
    settings: state.compression
  });
  if (!before.shouldCompact) return;

  let mode = "模型摘要";
  try {
    await state.session.compact(
      "请用中文压缩较早会话。必须保留用户已确认事实、待确认事项、当前模板、文件路径、工具执行结论、未完成任务和下一步；不得补充摘要中不存在的事实。"
    );
  } catch {
    const fixedUsage = estimateContextUsage({
      messages: [],
      systemPrompt: state.systemPrompt,
      pendingPrompt: prompt,
      imageCount: input.images?.length,
      additionalTokens: state.toolDefinitionTokens,
      settings: state.compression
    });
    const historyBudget = Math.max(2048, state.compression.triggerTokens - fixedUsage.estimatedTokens);
    const compacted = compactAgentMessagesLocally(state.session.agent.state.messages, {
      keepRecentTokens: Math.min(state.compression.keepRecentTokens, Math.max(1024, Math.trunc(historyBudget * 0.65))),
      reserveTokens: Math.max(600, Math.trunc(historyBudget * 0.2))
    });
    if (compacted.length >= state.session.agent.state.messages.length) return;
    state.session.agent.state.messages = compacted;
    mode = "本地提取摘要";
  }

  const after = estimateContextUsage({
    messages: state.session.agent.state.messages,
    systemPrompt: state.systemPrompt,
    pendingPrompt: prompt,
    imageCount: input.images?.length,
    additionalTokens: state.toolDefinitionTokens,
    settings: state.compression
  });
  host.addStage(
    input.sessionId,
    "已自动压缩上下文",
    `${mode}：约 ${before.estimatedTokens} tokens -> ${after.estimatedTokens} tokens，窗口 ${state.compression.contextWindowTokens} tokens`
  );
}

function ensureAssistantItem(context: {
  host: AgentRuntimeHost;
  input: AgentRuntimeTurnInput;
  getAssistantItem: () => MessageStreamItem | undefined;
  setAssistantItem: (item: MessageStreamItem | undefined) => void;
}): MessageStreamItem {
  const existing = context.getAssistantItem();
  if (existing) return existing;

  const item = context.host.createAssistantMessage(context.input.sessionId);
  context.input.onAssistantCreated(item);
  context.setAssistantItem(item);
  return item;
}

function sealCurrentAssistantAsProcessNote(context: {
  host: AgentRuntimeHost;
  input: AgentRuntimeTurnInput;
  sealedAssistantTexts: string[];
  getAssistantItem: () => MessageStreamItem | undefined;
  setAssistantItem: (item: MessageStreamItem | undefined) => void;
}): void {
  const assistantItem = context.getAssistantItem();
  if (!assistantItem?.content.trim()) return;
  assistantItem.isFinished = true;
  context.host.updateItem(context.input.sessionId, assistantItem);
  context.sealedAssistantTexts.push(assistantItem.content);
  context.setAssistantItem(undefined);
}

function stripSealedAssistantText(text: string | undefined, sealedTexts: string[]): string {
  let nextText = (text || "").trim();
  for (const sealedText of sealedTexts) {
    const prefix = sealedText.trim();
    if (prefix && nextText.startsWith(prefix)) {
      nextText = nextText.slice(prefix.length).trimStart();
    }
  }
  return nextText.trim();
}

function captureAssistantCompletion(
  message: AssistantMessage,
  context: {
    host: AgentRuntimeHost;
    input: AgentRuntimeTurnInput;
    sealedAssistantTexts: string[];
    assistantCompletion: {
      finalText?: string;
      stopReason?: AssistantMessage["stopReason"];
      errorMessage?: string;
    };
    getAssistantItem: () => MessageStreamItem | undefined;
    setAssistantItem: (item: MessageStreamItem | undefined) => void;
  }
): void {
  context.assistantCompletion.stopReason = message.stopReason;
  context.assistantCompletion.errorMessage = message.errorMessage;
  const text = stripSealedAssistantText(extractAssistantText(message), context.sealedAssistantTexts);
  context.assistantCompletion.finalText = text || context.assistantCompletion.finalText;
  if (!text) return;
  const assistantItem = ensureAssistantItem(context);
  assistantItem.content = text;
  context.host.updateItem(context.input.sessionId, assistantItem);
}

function createArchAgentPiTools(
  host: AgentRuntimeHost,
  sessionId: string,
  settings: AppSettings
): ToolDefinition[] {
  return buildAgentChatTools({
    includeExecBash: settings.agent.execBashEnabled,
    includeArtifactTools: true,
    layers: resolveAgentToolLayers(host.getSession(sessionId)?.workflow?.status, settings.agent.execBashEnabled)
  })
    .filter((tool) => tool.type === "function")
    .map((tool) => {
      const definition = tool.function;
      return defineTool({
        name: definition.name,
        label: definition.name,
        description: definition.description || definition.name,
        promptSnippet: `${definition.name}: ${firstLine(definition.description || definition.name)}`,
        parameters: convertJsonSchemaToTypeBoxSchema(definition.parameters),
        executionMode: resolveArchAgentToolExecutionMode(definition.name),
        execute: async (toolCallId, params, signal) => {
          const activeSettings = host.loadSettings();
          const sessionInputDir = host.getSessionInputDir(sessionId);
          const sessionOutputDir = host.getSessionOutputDir(sessionId);
          const toolCall: ChatCompletionMessageToolCall = {
            id: toolCallId,
            type: "function",
            function: {
              name: definition.name,
              arguments: JSON.stringify(params ?? {})
            }
          };
          const result = await executeAgentToolCall(toolCall, {
            rootDir: host.getSessionRootDir(sessionId),
            componentLibraryRootDir: host.rootDir,
            docsDir: host.docsDir,
            outputDir: sessionOutputDir,
            globalOutputDir: host.outputDir,
            sessionTitle: host.getSession(sessionId)?.title || "空间设计任务",
            memory: host.formatSessionMemory(sessionId),
            settings: activeSettings,
            userPrompt: getLatestUserPrompt(host, sessionId),
            signal: signal ?? undefined,
            allowedReadDirs: [
              host.docsDir,
              sessionInputDir,
              sessionOutputDir,
              host.getSession(sessionId)?.projectPath
            ].filter(Boolean) as string[],
            allowedReadFiles: host.getSessionReadableFiles(sessionId),
            execBashEnabled: activeSettings.agent.execBashEnabled,
            bundledPythonRuntime: host.getBundledPythonRuntime(),
            getSceneSnapshot: host.getSceneSnapshot,
            executeSceneCommand: host.executeSceneCommand,
            placeComponentLibraryItem: host.placeComponentLibraryItem,
            createReconstructionWorkflow: (input) => host.createReconstructionWorkflow(sessionId, input)
          });

          host.appendSessionMemory(sessionId, `工具 ${result.toolName}`, result.content);
          if (result.artifactPath) {
            host.createArtifact(sessionId, result.artifactPath);
          }

          return {
            content: [{ type: "text", text: result.content } satisfies TextContent],
            details: result
          };
        }
      });
    });
}

function resolveArchAgentToolExecutionMode(toolName: string): "parallel" | "sequential" {
  if (
    toolName === "time" ||
    toolName === "web_search" ||
    toolName === "read_file" ||
    toolName === "read_pdf" ||
    toolName === "read_image"
  ) {
    return "parallel";
  }
  return "sequential";
}

function registerArchAgentOpenAiModel(modelRegistry: ModelRegistry, settings: AppSettings): Model<Api> {
  const modelId = settings.openai.chatModel.trim() || "gpt-5.5";
  const baseUrl = settings.openai.baseUrl.trim() || "https://api.openai.com/v1";
  const maxTokens = Number.isFinite(settings.openai.maxOutputTokens) ? settings.openai.maxOutputTokens : 16000;
  const qwenCompatible = isQwenCompatibleModel(modelId, baseUrl);
  const compression = resolveContextCompressionSettings(settings);

  modelRegistry.registerProvider(ARCH_AGENT_PROVIDER, {
    name: "ArchAgent Hy3 Chat",
    baseUrl,
    apiKey: "OPENAI_API_KEY",
    api: "openai-completions",
    authHeader: false,
    models: [
      {
        id: modelId,
        name: modelId,
        api: "openai-completions",
        reasoning: settings.openai.thinkingEnabled,
        input: settings.openai.chatImageInputEnabled ? ["text", "image"] : ["text"],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0
        },
        contextWindow: compression.contextWindowTokens,
        maxTokens,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: settings.openai.thinkingEnabled && !qwenCompatible,
          supportsStrictMode: false,
          maxTokensField: "max_tokens",
          thinkingFormat: qwenCompatible ? "qwen" : "openai"
        }
      }
    ]
  });

  const model = modelRegistry.find(ARCH_AGENT_PROVIDER, modelId);
  if (!model) {
    throw new Error(`Pi Agent 模型注册失败：${ARCH_AGENT_PROVIDER}/${modelId}`);
  }
  return model;
}

function isQwenCompatibleModel(modelId: string, baseUrl: string): boolean {
  return /qwen|dashscope|aliyuncs/i.test(`${modelId} ${baseUrl}`);
}

export function buildArchAgentPiToolSchemaSignature(settings: AppSettings): string {
  return JSON.stringify({
    version: PI_TOOL_SCHEMA_VERSION,
    tools: buildAgentChatTools({
      includeExecBash: settings.agent.execBashEnabled,
      includeArtifactTools: true
    })
      .filter((tool) => tool.type === "function")
      .map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        strict: tool.function.strict,
        executionMode: resolveArchAgentToolExecutionMode(tool.function.name)
      }))
  });
}

function resolveAgentToolLayers(workflowStatus: string | undefined, execBashEnabled: boolean): AgentToolLayer[] {
  const layers: AgentToolLayer[] = ["foundation", "reference", "workflow", "scene", "delivery"];
  if (!workflowStatus || workflowStatus === "completed" || workflowStatus === "cancelled" || workflowStatus === "needs_attention") {
    layers.push("asset");
  }
  if (execBashEnabled) layers.push("extension");
  return layers;
}

function buildConfigSignature(settings: AppSettings, workflowStatus?: string): string {
  return JSON.stringify({
    baseUrl: settings.openai.baseUrl,
    chatModel: settings.openai.chatModel,
    chatImageInputEnabled: settings.openai.chatImageInputEnabled,
    thinkingEnabled: settings.openai.thinkingEnabled,
    reasoningEffort: settings.openai.reasoningEffort,
    contextWindowTokens: settings.openai.contextWindowTokens,
    maxOutputTokens: settings.openai.maxOutputTokens,
    execBashEnabled: settings.agent.execBashEnabled,
    workflowStatus,
    toolSchemaSignature: buildArchAgentPiToolSchemaSignature(settings)
  });
}

function resolveThinkingLevel(settings: AppSettings): "off" | "minimal" | "low" | "medium" | "high" | "xhigh" {
  if (!settings.openai.thinkingEnabled) return "off";
  const effort = settings.openai.reasoningEffort.trim();
  if (effort === "minimal" || effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh") {
    return effort;
  }
  return "medium";
}

function buildPiSystemPrompt(host: AgentRuntimeHost, sessionId: string): string {
  const session = host.getSession(sessionId);
  if (!session) return "";
  const messages = host.buildMessages(session);
  const systemParts = messages
    .filter((message) => message.role === "system" || message.role === "developer")
    .map((message) => chatContentToText(message.content))
    .filter(Boolean);
  return systemParts.join("\n\n");
}

function buildInitialPiHistory(host: AgentRuntimeHost, sessionId: string, model: Model<Api>) {
  const session = host.getSession(sessionId);
  if (!session) return [];

  const messages = session.items.filter((item): item is MessageStreamItem => item.kind === "message");
  const lastUserIndex = findLastIndex(messages, (item) => item.role === "user");
  const history = lastUserIndex >= 0 ? messages.slice(0, lastUserIndex) : messages;

  return history
    .filter((item) => item.content.trim())
    .map((item) => {
      const timestamp = Date.parse(item.createdAt) || Date.now();
      if (item.role === "user") {
        return {
          role: "user" as const,
          content: item.content,
          timestamp
        };
      }
      return {
        role: "assistant" as const,
        content: [{ type: "text" as const, text: item.content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: ZERO_USAGE,
        stopReason: "stop" as const,
        timestamp
      };
    });
}

function getLatestUserPrompt(host: AgentRuntimeHost, sessionId: string): string {
  const session = host.getSession(sessionId);
  const items = session?.items ?? [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "message" && item.role === "user") {
      return item.content;
    }
  }
  return "";
}

function extractAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((content): content is TextContent => content.type === "text")
    .map((content) => content.text)
    .join("");
}

function formatToolResultContent(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as { content?: Array<{ type: string; text?: string; mimeType?: string }> };
  if (!Array.isArray(record.content)) return "";
  return record.content
    .map((item) => {
      if (item.type === "text") return item.text || "";
      if (item.type === "image") return `[image:${item.mimeType || "unknown"}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function readToolExecutionDetails(result: unknown): AgentToolExecutionResult | undefined {
  if (!result || typeof result !== "object") return undefined;
  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object") return undefined;
  const record = details as Partial<AgentToolExecutionResult>;
  return typeof record.toolName === "string" && typeof record.summary === "string" && typeof record.content === "string"
    ? (record as AgentToolExecutionResult)
    : undefined;
}

function chatContentToText(content: ChatCompletionMessageParam["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0]?.trim() || value;
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}
