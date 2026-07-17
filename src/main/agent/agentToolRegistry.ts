/** Registers Agent-callable tools and routes validated calls to focused executors. */
import { exec, type ExecOptions } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { TextDecoder, promisify } from "node:util";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall, ChatCompletionTool } from "openai/resources/chat/completions";
import type { AppSettings } from "../../shared/types";
import type { SceneCommandInput, SceneCommandResult, ScenePoint, SceneSnapshot, WallMaterialPreset } from "../../shared/modeling3d/sceneContracts";
import { summarizeSceneForAgent } from "../modeling3d/sceneSummary";
import {
  MAX_VISION_IMAGE_BYTES,
  compactText,
  formatBytes,
  getCurrentTimeText,
  getImageMimeType,
  isSupportedImageFile,
  readDocumentText,
  readImageDataUrl,
  sanitizeFileName,
  writeUtf8File,
  type BuiltinToolName,
  type ImageDataUrlResult
} from "./agentTools";
import { createBundledPythonEnv, type BundledPythonRuntime } from "../runtime/bundledRuntime";
import { formatWebSearchResults, searchWeb } from "./webSearch";

export { parseDuckDuckGoHtml, searchWeb } from "./webSearch";
export type { WebSearchResult } from "./webSearch";


const execAsync = promisify(exec) as (
  command: string,
  options: ExecOptions & { encoding: "buffer" }
) => Promise<{ stdout: Buffer; stderr: Buffer }>;

export interface AgentToolExecutionContext {
  rootDir: string;
  docsDir: string;
  outputDir: string;
  globalOutputDir?: string;
  sessionTitle: string;
  memory: string;
  settings: AppSettings;
  userPrompt?: string;
  signal?: AbortSignal;
  allowedReadDirs: string[];
  allowedReadFiles?: string[];
  execBashEnabled: boolean;
  bundledPythonRuntime?: BundledPythonRuntime;
  getSceneSnapshot?: () => SceneSnapshot;
  executeSceneCommand?: (command: SceneCommandInput) => SceneCommandResult;
}

export interface AgentToolExecutionResult {
  toolName: BuiltinToolName;
  summary: string;
  content: string;
  artifactPath?: string;
}

export function buildAgentChatTools(options: { includeExecBash: boolean; includeArtifactTools?: boolean }): ChatCompletionTool[] {
  const tools: ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "get_scene",
        description: "读取当前建筑场景的版本、楼层和墙体参数。修改或删除已有墙体前必须先调用。",
        parameters: emptyObjectSchema
      }
    },
    {
      type: "function",
      function: {
        name: "remember_project",
        description: "沉淀项目事实、待补充信息和设计进度，供后续设计和交付持续使用。",
        parameters: rememberProjectSchema
      }
    },
    {
      type: "function",
      function: {
        name: "time",
        description: "获取当前北京时间。",
        parameters: emptyObjectSchema
      }
    },

    {
      type: "function",
      function: {
        name: "web_search",
        description: "检索公开网页信息。",
        parameters: webSearchSchema
      }
    },
    {
      type: "function",
      function: {
        name: "read_file",
        description: "读取本地文本或常见文档文件内容。",
        parameters: readFileSchema
      }
    },
    {
      type: "function",
      function: {
        name: "read_pdf",
        description: "读取本地 PDF 文件内容。",
        parameters: readFileSchema
      }
    },
    {
      type: "function",
      function: {
        name: "read_image",
        description: "识别本地图片或截图内容。",
        parameters: readImageSchema
      }
    },
    {
      type: "function",
      function: {
        name: "create_wall",
        description: "在指定楼层创建一段直墙。坐标单位为米，必须提供不同的起点和终点。",
        parameters: createWallSchema
      }
    },
    {
      type: "function",
      function: {
        name: "update_wall",
        description: "修改现有墙体的名称、端点、尺寸或材质。只传需要修改的字段。",
        parameters: updateWallSchema
      }
    },
    {
      type: "function",
      function: {
        name: "create_slab",
        description: "在指定楼层创建一个多边形楼板。坐标单位为米，轮廓至少包含三个点。",
        parameters: createSlabSchema
      }
    },
    {
      type: "function",
      function: {
        name: "update_slab",
        description: "修改现有楼板的名称、轮廓、标高或材质。只传需要修改的字段。",
        parameters: updateSlabSchema
      }
    },
    {
      type: "function",
      function: {
        name: "delete_node",
        description: "删除指定的墙体节点。",
        parameters: deleteNodeSchema
      }
    }
  ];

  if (options.includeArtifactTools !== false) {
    tools.push(
      {
        type: "function",
        function: {
          name: "write_file",
          description: "把中间分析结果或交付文件写入 data/output。",
          parameters: writeFileSchema
        }
      },
      {
        type: "function",
        function: {
          name: "send_file",
          description: "把 data/output 中的文件发送给前端。",
          parameters: filePathSchema
        }
      }
    );
  }

  if (options.includeExecBash) {
    tools.push({
      type: "function",
      function: {
        name: "exec_bash",
        description: "执行非破坏性本地诊断命令。",
        parameters: execBashSchema
      }
    });
  }

  return tools.map((tool) =>
    tool.type === "function"
      ? {
          ...tool,
          function: {
            ...tool.function,
            strict: true
          }
        }
      : tool
  );
}

export async function executeAgentToolCall(
  toolCall: ChatCompletionMessageToolCall,
  context: AgentToolExecutionContext
): Promise<AgentToolExecutionResult> {
  if (toolCall.type !== "function") {
    return {
      toolName: "read_file",
      summary: `暂不支持 custom tool：${toolCall.type}`,
      content: `Unsupported tool call type: ${toolCall.type}`
    };
  }

  const toolName = toolCall.function.name as BuiltinToolName;
  const args = parseToolArguments(toolCall.function.arguments);

  switch (toolName) {
    case "time":
      return executeTime();
    case "remember_project":
      return executeRememberProject(args);
    case "web_search":
      return executeWebSearch(args);
    case "read_file":
      return executeReadFile(args, context, "read_file");
    case "read_pdf":
      return executeReadFile(args, context, "read_pdf");
    case "read_image":
      return executeReadImage(args, context);
    case "write_file":
      return executeWriteFile(args, context);
    case "send_file":
      return executeSendFile(args, context);
    case "exec_bash":
      return executeBash(args, context);
    case "get_scene":
      return executeGetScene(context);
    case "create_wall":
      return executeCreateWall(args, context);
    case "update_wall":
      return executeUpdateWall(args, context);
    case "create_slab":
      return executeCreateSlab(args, context);
    case "update_slab":
      return executeUpdateSlab(args, context);
    case "delete_node":
      return executeDeleteNode(args, context);
    default:
      return {
        toolName: "read_file",
        summary: `未知工具：${String(toolName)}`,
        content: `Unknown tool: ${String(toolName)}`
      };
  }
}

function executeGetScene(context: AgentToolExecutionContext): AgentToolExecutionResult {
  if (!context.getSceneSnapshot) {
    return { toolName: "get_scene", summary: "当前应用未连接场景服务。", content: "get_scene failed: scene service unavailable" };
  }
  const summary = summarizeSceneForAgent(context.getSceneSnapshot());
  return { toolName: "get_scene", summary: "已读取当前建筑场景", content: summary };
}

function executeCreateWall(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const start = readPointArg(args, "start");
  const end = readPointArg(args, "end");
  if (!start || !end) return sceneToolFailure("create_wall", "墙体起点和终点必须是两个数字组成的数组。");
  return executeSceneTool(
    "create_wall",
    {
      type: "wall.create",
      parentId: readStringArg(args, "parent_id") || "level_default",
      name: readStringArg(args, "name") || undefined,
      start,
      end,
      height: readOptionalNumberArg(args, "height"),
      thickness: readOptionalNumberArg(args, "thickness"),
      materialPreset: readOptionalMaterialPreset(args, "material_preset")
    },
    context
  );
}

function executeUpdateWall(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const id = readStringArg(args, "id");
  if (!id) return sceneToolFailure("update_wall", "缺少墙体 ID。");
  const start = readOptionalPointArg(args, "start");
  const end = readOptionalPointArg(args, "end");
  if (start === null || end === null) return sceneToolFailure("update_wall", "墙体端点必须是两个数字组成的数组。");
  return executeSceneTool(
    "update_wall",
    {
      type: "wall.update",
      id,
      ...(readStringArg(args, "name") ? { name: readStringArg(args, "name") } : {}),
      ...(start ? { start } : {}),
      ...(end ? { end } : {}),
      ...(readOptionalNumberArg(args, "height") !== undefined ? { height: readOptionalNumberArg(args, "height") } : {}),
      ...(readOptionalNumberArg(args, "thickness") !== undefined ? { thickness: readOptionalNumberArg(args, "thickness") } : {}),
      ...(readOptionalMaterialPreset(args, "material_preset") ? { materialPreset: readOptionalMaterialPreset(args, "material_preset") } : {})
    },
    context
  );
}

function executeCreateSlab(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const polygon = readPolygonArg(args, "polygon");
  if (!polygon) return sceneToolFailure("create_slab", "楼板轮廓至少需要三个由两个数字组成的坐标点。");
  return executeSceneTool(
    "create_slab",
    {
      type: "slab.create",
      parentId: readStringArg(args, "parent_id") || "level_default",
      name: readStringArg(args, "name") || undefined,
      polygon,
      elevation: readOptionalNumberArg(args, "elevation"),
      materialPreset: readOptionalMaterialPreset(args, "material_preset")
    },
    context
  );
}

function executeUpdateSlab(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const id = readStringArg(args, "id");
  if (!id) return sceneToolFailure("update_slab", "缺少楼板 ID。");
  const polygon = "polygon" in args ? readPolygonArg(args, "polygon") : undefined;
  if ("polygon" in args && !polygon) return sceneToolFailure("update_slab", "楼板轮廓至少需要三个由两个数字组成的坐标点。");
  return executeSceneTool(
    "update_slab",
    {
      type: "slab.update",
      id,
      ...(readStringArg(args, "name") ? { name: readStringArg(args, "name") } : {}),
      ...(polygon ? { polygon } : {}),
      ...(readOptionalNumberArg(args, "elevation") !== undefined ? { elevation: readOptionalNumberArg(args, "elevation") } : {}),
      ...(readOptionalMaterialPreset(args, "material_preset") ? { materialPreset: readOptionalMaterialPreset(args, "material_preset") } : {})
    },
    context
  );
}

function executeDeleteNode(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const id = readStringArg(args, "id");
  if (!id) return sceneToolFailure("delete_node", "缺少节点 ID。");
  return executeSceneTool("delete_node", { type: "node.delete", id }, context);
}

function executeSceneTool(
  toolName: Extract<BuiltinToolName, "create_wall" | "update_wall" | "create_slab" | "update_slab" | "delete_node">,
  command: SceneCommandInput,
  context: AgentToolExecutionContext
): AgentToolExecutionResult {
  if (!context.executeSceneCommand) return sceneToolFailure(toolName, "当前应用未连接场景服务。");
  const result = context.executeSceneCommand(command);
  if (!result.accepted) return sceneToolFailure(toolName, result.message);

  const nodeId = result.command.type === "node.delete" ? result.command.id : result.command.id;
  const action = result.command.type === "wall.create" ? "已创建墙体"
    : result.command.type === "wall.update" ? "已更新墙体"
    : result.command.type === "slab.create" ? "已创建楼板"
    : result.command.type === "slab.update" ? "已更新楼板"
    : "已删除构件";
  return {
    toolName,
    summary: `${action}：${nodeId}`,
    content: `${action}\n节点 ID：${nodeId}\n场景版本：${result.snapshot.revision}`
  };
}

function sceneToolFailure(toolName: Extract<BuiltinToolName, "create_wall" | "update_wall" | "create_slab" | "update_slab" | "delete_node">, message: string): AgentToolExecutionResult {
  return { toolName, summary: message, content: `${toolName} failed: ${message}` };
}

function executeTime(): AgentToolExecutionResult {
  const time = getCurrentTimeText();
  return { toolName: "time", summary: time, content: time };
}

function executeWebSearch(args: Record<string, unknown>): Promise<AgentToolExecutionResult> {
  const query = readStringArg(args, "query");
  const maxResults = readNumberArg(args, "max_results", 5);
  if (!query) {
    return Promise.resolve({
      toolName: "web_search",
      summary: "缺少搜索关键词",
      content: "web_search failed: missing query"
    });
  }
  return searchWeb(query, { maxResults }).then((results) => ({
    toolName: "web_search",
    summary: results.length ? `已检索“${query}”，返回 ${results.length} 条结果` : `未检索到“${query}”的公开结果`,
    content: formatWebSearchResults(query, results)
  }));
}

function executeRememberProject(args: Record<string, unknown>): AgentToolExecutionResult {
  const summary = readStringArg(args, "summary") || "已更新项目档案";
  const facts = readKeyValueListArg(args, "facts");
  const gaps = readStringListArg(args, "gaps");
  const readyForGeneration = readBooleanArg(args, "ready_for_generation", false);
  return {
    toolName: "remember_project",
    summary: readyForGeneration ? "项目档案已更新，信息已基本就绪" : "项目档案已更新，继续收集信息",
    content: [
      "项目档案更新",
      `摘要：${summary}`,
      "已确认事实：",
      facts.length ? facts.map((fact) => `- ${fact.key}：${fact.value}${fact.source ? `（来源：${fact.source}）` : ""}`).join("\n") : "- 暂无新增事实",
      "待补充信息：",
      gaps.length ? gaps.map((gap) => `- ${gap}`).join("\n") : "- 暂无",
      `生成就绪：${readyForGeneration ? "是" : "否"}`
    ].join("\n")
  };
}

async function executeReadFile(
  args: Record<string, unknown>,
  context: AgentToolExecutionContext,
  requestedToolName: "read_file" | "read_pdf"
): Promise<AgentToolExecutionResult> {
  const inputPath = readStringArg(args, "path");
  if (!inputPath) {
    return { toolName: requestedToolName, summary: "缺少文件路径", content: `${requestedToolName} failed: missing path` };
  }

  const filePath = resolveReadablePath(inputPath, context);
  assertPathAllowed(filePath, context.allowedReadDirs, context.allowedReadFiles ?? [], requestedToolName);
  if (requestedToolName === "read_pdf" && extname(filePath).toLowerCase() !== ".pdf") {
    return { toolName: "read_pdf", summary: "read_pdf 只能读取 .pdf 文件", content: `read_pdf failed: unsupported extension ${extname(filePath) || "(none)"}` };
  }

  const result = await readDocumentText(filePath, 18000);
  return {
    toolName: result.toolName,
    summary: result.summary,
    content: result.content || result.summary
  };
}

async function executeReadImage(
  args: Record<string, unknown>,
  context: AgentToolExecutionContext
): Promise<AgentToolExecutionResult> {
  const inputPath = readStringArg(args, "path");
  if (!inputPath) {
    return { toolName: "read_image", summary: "缺少图片路径", content: "read_image failed: missing path" };
  }

  const filePath = resolveReadablePath(inputPath, context);
  assertPathAllowed(filePath, context.allowedReadDirs, context.allowedReadFiles ?? [], "read_image");
  if (!existsSync(filePath)) {
    throw new Error(`read_image 图片不存在：${basename(filePath)}`);
  }
  if (!isSupportedImageFile(filePath)) {
    return {
      toolName: "read_image",
      summary: "read_image 仅支持 png/jpg/jpeg/webp/gif 图片",
      content: `read_image failed: unsupported extension ${extname(filePath).toLowerCase() || "(none)"}`
    };
  }

  const apiKey = resolveVisionApiKey(context.settings);
  if (!apiKey) {
    return {
      toolName: "read_image",
      summary: "识图需要配置 OPENAI_VISION_API_KEY 或 OPENAI_API_KEY",
      content: [
        "read_image failed: OPENAI_VISION_API_KEY / OPENAI_API_KEY 未配置",
        `图片：${basename(filePath)}`,
        `格式：${getImageMimeType(filePath) || "unknown"}`,
        `大小：${formatBytes(statSync(filePath).size)}`
      ].join("\n")
    };
  }

  const image = await readImageDataUrl(filePath, MAX_VISION_IMAGE_BYTES);
  const question = readStringArg(args, "question") || readStringArg(args, "prompt") || buildDefaultImageQuestion(context.userPrompt);
  const detail = normalizeImageDetailArg(readStringArg(args, "detail"));
  const client = new OpenAI({
    apiKey,
    baseURL: resolveVisionBaseUrl(context.settings),
    timeout: context.settings.openai.requestTimeoutMs
  });
  const response = await client.chat.completions.create(
    {
      model: resolveVisionModel(context.settings),
      messages: buildImageUnderstandingMessages({ image, question, detail }, context),
      max_tokens: Math.min(Math.max(Math.floor(context.settings.openai.maxOutputTokens / 4), 900), 3500)
    },
    { signal: context.signal }
  );
  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("模型未返回图片识别结果");
  return {
    toolName: "read_image",
    summary: `已识别 ${image.sourceName}`,
    content: [`read_image completed: ${filePath}`, `问题：${question}`, "", content].join("\n")
  };
}

function buildImageUnderstandingMessages(
  input: { image: ImageDataUrlResult; question: string; detail: "auto" | "low" | "high" },
  context: AgentToolExecutionContext
): ChatCompletionMessageParam[] {
  const text = [
    `图片文件：${input.image.sourceName}`,
    context.userPrompt?.trim() ? `相关上下文：\n${compactText([context.userPrompt, context.memory].filter(Boolean).join("\n\n"), 8000)}` : "",
    `用户希望你解决的问题：${input.question}`,
    "请用中文输出图片概述、关键文字/元素、与问题相关的异常点和可执行建议。",
    "如果看不清或没有足够证据，请明确说明不确定之处。"
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    {
      role: "system",
      content: "你是截图和图片识别工具，只根据图片可见内容和给定上下文分析问题。"
    },
    {
      role: "user",
      content: [
        { type: "text", text },
        {
          type: "image_url",
          image_url: {
            url: input.image.dataUrl,
            detail: input.detail
          }
        }
      ]
    }
  ];
}

async function executeWriteFile(
  args: Record<string, unknown>,
  context: AgentToolExecutionContext
): Promise<AgentToolExecutionResult> {
  const name = sanitizeFileName(readStringArg(args, "name") || "agent-output.md");
  const content = readStringArg(args, "content");
  if (!content) {
    return { toolName: "write_file", summary: "缺少写入内容", content: "write_file failed: missing content" };
  }
  const outputPath = createOutputPath(context, name);
  await writeUtf8File(outputPath, content);
  return {
    toolName: "write_file",
    summary: `已写入 ${basename(outputPath)}`,
    content: `write_file completed: ${outputPath}`,
    artifactPath: outputPath
  };
}

async function executeSendFile(
  args: Record<string, unknown>,
  context: AgentToolExecutionContext
): Promise<AgentToolExecutionResult> {
  const inputPath = readStringArg(args, "path");
  if (!inputPath) {
    return { toolName: "send_file", summary: "缺少文件路径", content: "send_file failed: missing path" };
  }
  const filePath = resolveExistingOutputToolPath(inputPath, context);
  if (!existsSync(filePath)) {
    throw new Error(`send_file 文件不存在：${basename(filePath)}`);
  }
  return {
    toolName: "send_file",
    summary: `已发送 ${basename(filePath)}`,
    content: `send_file completed: ${filePath}`,
    artifactPath: filePath
  };
}

async function executeBash(
  args: Record<string, unknown>,
  context: AgentToolExecutionContext
): Promise<AgentToolExecutionResult> {
  const command = readStringArg(args, "command");
  if (!context.execBashEnabled) {
    return {
      toolName: "exec_bash",
      summary: "exec_bash 未启用",
      content: "exec_bash is disabled. Set AGENT_EXEC_BASH_ENABLED=true only in trusted local development."
    };
  }
  if (!command) {
    return { toolName: "exec_bash", summary: "缺少命令", content: "exec_bash failed: missing command" };
  }
  if (looksDestructiveCommand(command)) {
    return {
      toolName: "exec_bash",
      summary: "拒绝执行高风险命令",
      content: `Rejected destructive command: ${command}`
    };
  }

  const env = context.bundledPythonRuntime ? createBundledPythonEnv(context.bundledPythonRuntime, process.env) : process.env;
  const execOptions: ExecOptions & { encoding: "buffer" } = {
    cwd: context.rootDir,
    env,
    timeout: 15000,
    maxBuffer: 1024 * 256,
    windowsHide: true,
    signal: context.signal,
    encoding: "buffer"
  };

  try {
    const { stdout, stderr } = await execAsync(command, execOptions);
    const output = compactText(formatCommandOutput(stdout, stderr), 12000);
    return {
      toolName: "exec_bash",
      summary: output ? "命令执行完成" : "命令执行完成，无输出",
      content: output || "(empty output)"
    };
  } catch (error) {
    return formatExecBashError(command, error);
  }
}

function formatExecBashError(command: string, error: unknown): AgentToolExecutionResult {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const stdout = decodeCommandOutput(record.stdout);
  const stderr = decodeCommandOutput(record.stderr);
  const output = compactText(formatCommandOutput(stdout, stderr) || decodeCommandErrorMessage(error), 12000);
  const detailLines = [
    `exec_bash failed: ${command}`,
    typeof record.code === "number" || typeof record.code === "string" ? `exit code: ${record.code}` : "",
    typeof record.signal === "string" ? `signal: ${record.signal}` : "",
    "",
    output || "(empty output)"
  ].filter((line, index) => line || index === 3);
  return {
    toolName: "exec_bash",
    summary: output ? `命令执行失败：${firstLine(output)}` : "命令执行失败",
    content: detailLines.join("\n")
  };
}

function formatCommandOutput(stdout: unknown, stderr: unknown): string {
  return [decodeCommandOutput(stdout), decodeCommandOutput(stderr)].filter(Boolean).join("\n").trim();
}

function decodeCommandOutput(value: unknown): string {
  if (Buffer.isBuffer(value)) return decodeCommandBuffer(value);
  if (typeof value === "string") return value;
  return "";
}

function decodeCommandBuffer(buffer: Buffer): string {
  if (!buffer.length) return "";
  const utf8 = tryDecodeBuffer(buffer, "utf-8", true);
  if (utf8 !== undefined) return utf8;
  if (process.platform === "win32") {
    const gb18030 = tryDecodeBuffer(buffer, "gb18030", false);
    if (gb18030 !== undefined) return gb18030;
  }
  return buffer.toString("utf8");
}

function tryDecodeBuffer(buffer: Buffer, encoding: string, fatal: boolean): string | undefined {
  try {
    return new TextDecoder(encoding, { fatal }).decode(buffer);
  } catch {
    return undefined;
  }
}

function decodeCommandErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstLine(value: string): string {
  return compactText(value.split(/\r?\n/).find((line) => line.trim()) ?? value, 180);
}

function resolveReadablePath(inputPath: string, context: AgentToolExecutionContext): string {
  if (isAbsolute(inputPath)) return resolve(inputPath);
  const normalized = inputPath.replace(/\\/g, "/");
  if (normalized.startsWith("docs/")) return resolve(context.docsDir, normalized.slice(5));
  if (normalized.startsWith("data/output/")) return resolve(context.outputDir, normalized.slice("data/output/".length));
  if (normalized.startsWith("output/")) return resolve(context.outputDir, normalized.slice("output/".length));
  return resolve(context.rootDir, inputPath);
}

function resolveOutputPath(context: AgentToolExecutionContext, name: string): string {
  return join(context.outputDir, name);
}

function createOutputPath(context: AgentToolExecutionContext, name: string): string {
  return resolveOutputPath(context, createOutputFileName(name));
}

function createOutputFileName(name: string, stamp = createToolArtifactStamp()): string {
  const safeName = sanitizeFileName(name) || "agent-output";
  const extension = extname(safeName);
  const stem = extension ? basename(safeName, extension) : safeName;
  return `${stem || "agent-output"}-${stamp}${extension}`;
}

function createToolArtifactStamp(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveExistingOutputToolPath(inputPath: string, context: AgentToolExecutionContext): string {
  const exactPath = resolveOutputToolPath(inputPath, context);
  if (existsSync(exactPath)) return exactPath;
  const requestedName = sanitizeFileName(basename(inputPath.replace(/\\/g, "/")));
  const matches = readdirSync(context.outputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isGeneratedOutputFileNameMatch(entry.name, requestedName))
    .map((entry) => {
      const filePath = join(context.outputDir, entry.name);
      return { filePath, mtimeMs: statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return matches[0]?.filePath ?? exactPath;
}

function resolveOutputToolPath(inputPath: string, context: AgentToolExecutionContext): string {
  if (isAbsolute(inputPath)) return resolve(inputPath);
  const normalized = inputPath.replace(/\\/g, "/");
  if (normalized.startsWith("data/output/")) return resolve(context.outputDir, normalized.slice("data/output/".length));
  if (normalized.startsWith("output/")) return resolve(context.outputDir, normalized.slice("output/".length));
  return resolve(context.outputDir, inputPath);
}

function isGeneratedOutputFileNameMatch(fileName: string, requestedName: string): boolean {
  if (fileName === requestedName) return true;
  if (fileName.endsWith(`-${requestedName}`)) return true;
  return stripGeneratedOutputSuffix(fileName) === requestedName;
}

function stripGeneratedOutputSuffix(fileName: string): string {
  const extension = extname(fileName);
  const stem = extension ? basename(fileName, extension) : fileName;
  return `${stem.replace(/-[a-z0-9]+-[a-z0-9]{6}$/i, "")}${extension}`;
}

function assertPathAllowed(filePath: string, allowedDirs: string[], allowedFiles: string[], toolName: string): void {
  const normalizedPath = resolve(filePath).toLowerCase();
  const normalizedFiles = allowedFiles.map((file) => resolve(file).toLowerCase());
  if (normalizedFiles.includes(normalizedPath)) return;
  const normalizedDirs = allowedDirs.map((dir) => resolve(dir).toLowerCase());
  if (normalizedDirs.some((dir) => normalizedPath === dir || normalizedPath.startsWith(`${dir}\\`) || normalizedPath.startsWith(`${dir}/`))) return;
  throw new Error(`${toolName} 只能访问允许目录内的文件`);
}

function readStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function readStringListArg(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function readKeyValueListArg(args: Record<string, unknown>, key: string): Array<{ key: string; value: string; source?: string }> {
  const value = args[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
      const record = item as Record<string, unknown>;
      const itemKey = typeof record.key === "string" ? record.key.trim() : "";
      const itemValue = typeof record.value === "string" ? record.value.trim() : "";
      const source = typeof record.source === "string" ? record.source.trim() : "";
      return itemKey && itemValue ? { key: itemKey, value: itemValue, ...(source ? { source } : {}) } : undefined;
    })
    .filter((item): item is { key: string; value: string; source?: string } => Boolean(item));
}

function readBooleanArg(args: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "1", "yes", "on"].includes(value.trim().toLowerCase())) return true;
    if (["false", "0", "no", "off"].includes(value.trim().toLowerCase())) return false;
  }
  return fallback;
}

function readNumberArg(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function readOptionalNumberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function readPointArg(args: Record<string, unknown>, key: string): ScenePoint | undefined {
  const value = args[key];
  if (!Array.isArray(value) || value.length !== 2) {
    return undefined;
  }
  const [x, y] = value;
  if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) return undefined;
  return [x, y];
}

function readPolygonArg(args: Record<string, unknown>, key: string): ScenePoint[] | undefined {
  const value = args[key];
  if (!Array.isArray(value) || value.length < 3) return undefined;
  const points = value.map((item) => readPointArg({ point: item }, "point"));
  return points.every((point): point is ScenePoint => Boolean(point)) ? points : undefined;
}

function readOptionalPointArg(args: Record<string, unknown>, key: string): ScenePoint | null | undefined {
  if (!(key in args)) return undefined;
  return readPointArg(args, key) ?? null;
}

function readOptionalMaterialPreset(args: Record<string, unknown>, key: string): WallMaterialPreset | undefined {
  const value = readStringArg(args, key);
  return ["brick", "concrete", "glass", "marble", "metal", "plaster", "tile", "white", "wood"].includes(value)
    ? (value as WallMaterialPreset)
    : undefined;
}

function parseToolArguments(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return readRecord(parsed) ?? {};
  } catch {
    return {};
  }
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function normalizeImageDetailArg(value: string): "auto" | "low" | "high" {
  if (value === "low" || value === "high" || value === "auto") return value;
  return "auto";
}

function buildDefaultImageQuestion(userPrompt: string | undefined): string {
  const prompt = userPrompt?.trim();
  if (prompt) return `根据用户当前需求识别图片内容并定位需要修改的问题：${prompt}`;
  return "识别这张图片的主要内容、可见文字、异常点和可执行修改建议。";
}

function resolveVisionApiKey(settings: AppSettings): string | undefined {
  if (settings.openai.visionApiKeyConfigured && process.env.OPENAI_VISION_API_KEY) return process.env.OPENAI_VISION_API_KEY;
  return settings.openai.apiKeyConfigured ? process.env.OPENAI_API_KEY : undefined;
}

function resolveVisionBaseUrl(settings: AppSettings): string {
  return settings.openai.visionBaseUrl.trim() || settings.openai.baseUrl;
}

function resolveVisionModel(settings: AppSettings): string {
  return settings.openai.visionModel.trim() || settings.openai.chatModel;
}

function looksDestructiveCommand(command: string): boolean {
  return /\b(rm\s+-rf|del\s+\/|rmdir\s+\/s|remove-item\b|format\b|shutdown\b|restart-computer\b|git\s+reset\s+--hard)\b/i.test(command);
}

const emptyObjectSchema = { type: "object", properties: {}, additionalProperties: false } as const;
const readFileSchema = {
  type: "object",
  properties: { path: { type: "string" } },
  required: ["path"],
  additionalProperties: false
} as const;
const filePathSchema = {
  type: "object",
  properties: { path: { type: "string" } },
  required: ["path"],
  additionalProperties: false
} as const;
const writeFileSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    content: { type: "string" }
  },
  required: ["name", "content"],
  additionalProperties: false
} as const;
const webSearchSchema = {
  type: "object",
  properties: {
    query: { type: "string" },
    max_results: { type: "integer" }
  },
  required: ["query"],
  additionalProperties: false
} as const;
const readImageSchema = {
  type: "object",
  properties: {
    path: { type: "string" },
    question: { type: "string" },
    prompt: { type: "string" },
    detail: { type: "string", enum: ["auto", "low", "high"] }
  },
  required: ["path"],
  additionalProperties: false
} as const;
const execBashSchema = {
  type: "object",
  properties: {
    command: { type: "string" }
  },
  required: ["command"],
  additionalProperties: false
} as const;
const pointSchema = {
  type: "array",
  items: { type: "number" },
  minItems: 2,
  maxItems: 2
} as const;
const polygonSchema = {
  type: "array",
  items: pointSchema,
  minItems: 3
} as const;
const materialPresetSchema = {
  type: "string",
  enum: ["brick", "concrete", "glass", "marble", "metal", "plaster", "tile", "white", "wood"]
} as const;
const createWallSchema = {
  type: "object",
  properties: {
    parent_id: { type: "string" },
    name: { type: "string" },
    start: pointSchema,
    end: pointSchema,
    height: { type: "number" },
    thickness: { type: "number" },
    material_preset: materialPresetSchema
  },
  required: ["start", "end"],
  additionalProperties: false
} as const;
const updateWallSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    start: pointSchema,
    end: pointSchema,
    height: { type: "number" },
    thickness: { type: "number" },
    material_preset: materialPresetSchema
  },
  required: ["id"],
  additionalProperties: false
} as const;
const createSlabSchema = {
  type: "object",
  properties: {
    parent_id: { type: "string" },
    name: { type: "string" },
    polygon: polygonSchema,
    elevation: { type: "number" },
    material_preset: materialPresetSchema
  },
  required: ["polygon"],
  additionalProperties: false
} as const;
const updateSlabSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    polygon: polygonSchema,
    elevation: { type: "number" },
    material_preset: materialPresetSchema
  },
  required: ["id"],
  additionalProperties: false
} as const;
const deleteNodeSchema = {
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
  additionalProperties: false
} as const;
const rememberProjectSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { type: "string" },
          source: { type: "string" }
        },
        required: ["key", "value"],
        additionalProperties: false
      }
    },
    gaps: { type: "array", items: { type: "string" } },
    ready_for_generation: { type: "boolean" }
  },
  required: ["summary", "facts", "gaps", "ready_for_generation"],
  additionalProperties: false
} as const;
