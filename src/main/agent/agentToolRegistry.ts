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
import { generateHunyuanGlb, type Hunyuan3dDetailLevel } from "../modeling3d/hunyuan3dService";
import { importGlobalComponent, listGlobalComponents } from "../modeling3d/componentLibraryService";

export { parseDuckDuckGoHtml, searchWeb } from "./webSearch";
export type { WebSearchResult } from "./webSearch";


const execAsync = promisify(exec) as (
  command: string,
  options: ExecOptions & { encoding: "buffer" }
) => Promise<{ stdout: Buffer; stderr: Buffer }>;

export interface AgentToolExecutionContext {
  rootDir: string;
  /** Application-owned root for assets shared by every project and conversation. */
  componentLibraryRootDir?: string;
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
        description: "读取当前建筑场景的版本、楼层及全部建筑构件参数。修改或删除已有构件前必须先调用。",
        parameters: emptyObjectSchema
      }
    },
    { type: "function", function: { name: "create_ceiling", description: "在指定楼层创建一个多边形天花。高度单位为米。", parameters: createCeilingSchema } },
    { type: "function", function: { name: "update_ceiling", description: "修改已有天花的名称、轮廓、高度或材质。", parameters: updateCeilingSchema } },
    { type: "function", function: { name: "create_column", description: "在指定楼层创建结构柱。位置与尺寸单位为米。", parameters: createColumnSchema } },
    { type: "function", function: { name: "update_column", description: "修改已有柱的位置、截面或尺寸。", parameters: updateColumnSchema } },
    { type: "function", function: { name: "create_zone", description: "在指定楼层创建功能房间分区。轮廓坐标单位为米。", parameters: createZoneSchema } },
    { type: "function", function: { name: "update_zone", description: "修改已有房间的名称、轮廓或颜色。", parameters: updateZoneSchema } },
    { type: "function", function: { name: "create_stair", description: "在指定楼层创建直梯。位置、尺寸单位为米。", parameters: createStairSchema } },
    { type: "function", function: { name: "update_stair", description: "修改已有直梯的位置、尺寸、踏步或扶手。", parameters: updateStairSchema } },
    { type: "function", function: { name: "create_fence", description: "在指定楼层创建直线围栏。坐标、尺寸单位为米。", parameters: createFenceSchema } },
    { type: "function", function: { name: "update_fence", description: "修改已有围栏的端点、尺寸、样式或材质。", parameters: updateFenceSchema } },
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
    { type: "function", function: { name: "create_door", description: "在指定墙体上创建门洞和门。偏移从墙体起点开始计算，单位为米。", parameters: createDoorSchema } },
    { type: "function", function: { name: "update_door", description: "修改已有门的尺寸、沿墙偏移或材质。", parameters: updateDoorSchema } },
    { type: "function", function: { name: "create_window", description: "在指定墙体上创建窗洞和窗。偏移从墙体起点开始计算，单位为米。", parameters: createWindowSchema } },
    { type: "function", function: { name: "update_window", description: "修改已有窗的尺寸、沿墙偏移或材质。", parameters: updateWindowSchema } },
    { type: "function", function: { name: "update_asset", description: "移动、旋转或缩放已导入的参考模型。旋转单位为弧度，缩放必须为正数。", parameters: updateAssetSchema } },
    { type: "function", function: { name: "generate_3d_asset", description: "必须用于创建家具、陈设、设备、人物和其他非建筑原生构件。调用混元生3D生成带面数预算的 GLB 并保存到当前项目的 output/assets；默认使用标准细节，只有用户明确要求近景展示时才使用 high。文生3D必须传入完整的中文正向 prompt，或传入已上传附件的 image_path 走图生3D，二者只能选一个。生成成功后应调用 import_component_asset 导入全局构件库。", parameters: generate3dAssetSchema } },
    { type: "function", function: { name: "import_component_asset", description: "将当前项目内已生成或已下载的 GLB、GLTF、OBJ、STL 模型复制并登记到全局构件库。生成通用 3D 资产后必须立即调用；网络下载的模型完成后也应调用。", parameters: importComponentAssetSchema } },
    { type: "function", function: { name: "get_component_library", description: "检索全局构件库的语义信息；放置或修改构件前必须先调用。", parameters: emptyObjectSchema } },
    {
      type: "function",
      function: {
        name: "delete_node",
        description: "删除指定的墙体、楼板、门或窗节点。",
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
    case "create_ceiling":
      return executeCreateCeiling(args, context);
    case "update_ceiling":
      return executeUpdateCeiling(args, context);
    case "create_column": return executeCreateColumn(args, context);
    case "update_column": return executeUpdateColumn(args, context);
    case "create_zone": return executeCreateZone(args, context);
    case "update_zone": return executeUpdateZone(args, context);
    case "create_stair": return executeCreateStair(args, context);
    case "update_stair": return executeUpdateStair(args, context);
    case "create_fence": return executeCreateFence(args, context);
    case "update_fence": return executeUpdateFence(args, context);
    case "create_door":
      return executeCreateDoor(args, context);
    case "update_door":
      return executeUpdateDoor(args, context);
    case "create_window":
      return executeCreateWindow(args, context);
    case "update_window":
      return executeUpdateWindow(args, context);
    case "update_asset":
      return executeUpdateAsset(args, context);
    case "generate_3d_asset":
      return executeGenerate3dAsset(args, context);
    case "import_component_asset":
      return executeImportComponentAsset(args, context);
    case "get_component_library":
      return executeGetComponentLibrary(context);
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

function executeCreateCeiling(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const polygon = readPolygonArg(args, "polygon");
  if (!polygon) return sceneToolFailure("create_ceiling", "天花轮廓至少需要三个由两个数字组成的坐标点。 ");
  return executeSceneTool("create_ceiling", { type: "ceiling.create", parentId: readStringArg(args, "parent_id") || "level_default", name: readStringArg(args, "name") || undefined, polygon, height: readOptionalNumberArg(args, "height"), materialPreset: readOptionalMaterialPreset(args, "material_preset") }, context);
}

function executeUpdateCeiling(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const id = readStringArg(args, "id");
  if (!id) return sceneToolFailure("update_ceiling", "缺少天花 ID。 ");
  const polygon = "polygon" in args ? readPolygonArg(args, "polygon") : undefined;
  if ("polygon" in args && !polygon) return sceneToolFailure("update_ceiling", "天花轮廓至少需要三个由两个数字组成的坐标点。 ");
  return executeSceneTool("update_ceiling", { type: "ceiling.update", id, ...(readStringArg(args, "name") ? { name: readStringArg(args, "name") } : {}), ...(polygon ? { polygon } : {}), ...(readOptionalNumberArg(args, "height") !== undefined ? { height: readOptionalNumberArg(args, "height") } : {}), ...(readOptionalMaterialPreset(args, "material_preset") ? { materialPreset: readOptionalMaterialPreset(args, "material_preset") } : {}) }, context);
}

function executeCreateColumn(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const position = readPoint3Arg(args, "position");
  if (!position) return sceneToolFailure("create_column", "柱位置必须是三个数字组成的数组。 ");
  return executeSceneTool("create_column", { type: "column.create", parentId: readStringArg(args, "parent_id") || "level_default", name: readStringArg(args, "name") || undefined, position, crossSection: readColumnCrossSection(args), height: readOptionalNumberArg(args, "height"), width: readOptionalNumberArg(args, "width"), depth: readOptionalNumberArg(args, "depth"), materialPreset: readOptionalMaterialPreset(args, "material_preset") }, context);
}
function executeUpdateColumn(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const id = readStringArg(args, "id"); if (!id) return sceneToolFailure("update_column", "缺少柱 ID。 ");
  const position = "position" in args ? readPoint3Arg(args, "position") : undefined; if ("position" in args && !position) return sceneToolFailure("update_column", "柱位置必须是三个数字组成的数组。 ");
  return executeSceneTool("update_column", { type: "column.update", id, ...(position ? { position } : {}), ...(readColumnCrossSection(args) ? { crossSection: readColumnCrossSection(args) } : {}), ...(readOptionalNumberArg(args, "height") !== undefined ? { height: readOptionalNumberArg(args, "height") } : {}), ...(readOptionalNumberArg(args, "width") !== undefined ? { width: readOptionalNumberArg(args, "width") } : {}), ...(readOptionalNumberArg(args, "depth") !== undefined ? { depth: readOptionalNumberArg(args, "depth") } : {}), ...(readOptionalMaterialPreset(args, "material_preset") ? { materialPreset: readOptionalMaterialPreset(args, "material_preset") } : {}) }, context);
}
function executeCreateZone(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const polygon = readPolygonArg(args, "polygon");
  if (!polygon) return sceneToolFailure("create_zone", "房间轮廓至少需要三个由两个数字组成的坐标点。 ");
  return executeSceneTool("create_zone", {
    type: "zone.create",
    parentId: readStringArg(args, "parent_id") || "level_default",
    name: readStringArg(args, "name") || undefined,
    polygon,
    color: readColorArg(args, "color")
  }, context);
}

function executeUpdateZone(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const id = readStringArg(args, "id");
  if (!id) return sceneToolFailure("update_zone", "缺少房间 ID。 ");
  const polygon = "polygon" in args ? readPolygonArg(args, "polygon") : undefined;
  if ("polygon" in args && !polygon) return sceneToolFailure("update_zone", "房间轮廓至少需要三个由两个数字组成的坐标点。 ");
  return executeSceneTool("update_zone", {
    type: "zone.update",
    id,
    ...(readStringArg(args, "name") ? { name: readStringArg(args, "name") } : {}),
    ...(polygon ? { polygon } : {}),
    ...(readColorArg(args, "color") ? { color: readColorArg(args, "color") } : {})
  }, context);
}

function executeCreateStair(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const position = readPoint3Arg(args, "position");
  if (!position) return sceneToolFailure("create_stair", "楼梯位置必须是三个数字组成的数组。 ");
  return executeSceneTool("create_stair", {
    type: "stair.create",
    parentId: readStringArg(args, "parent_id") || "level_default",
    name: readStringArg(args, "name") || undefined,
    position,
    rotation: readOptionalNumberArg(args, "rotation"),
    width: readOptionalNumberArg(args, "width"),
    totalRise: readOptionalNumberArg(args, "total_rise"),
    stepCount: readOptionalNumberArg(args, "step_count"),
    thickness: readOptionalNumberArg(args, "thickness"),
    railingMode: readRailingMode(args),
    materialPreset: readOptionalMaterialPreset(args, "material_preset")
  }, context);
}

function executeUpdateStair(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const id = readStringArg(args, "id");
  if (!id) return sceneToolFailure("update_stair", "缺少楼梯 ID。 ");
  const position = "position" in args ? readPoint3Arg(args, "position") : undefined;
  if ("position" in args && !position) return sceneToolFailure("update_stair", "楼梯位置必须是三个数字组成的数组。 ");
  return executeSceneTool("update_stair", {
    type: "stair.update",
    id,
    ...(readStringArg(args, "name") ? { name: readStringArg(args, "name") } : {}),
    ...(position ? { position } : {}),
    ...(readOptionalNumberArg(args, "rotation") !== undefined ? { rotation: readOptionalNumberArg(args, "rotation") } : {}),
    ...(readOptionalNumberArg(args, "width") !== undefined ? { width: readOptionalNumberArg(args, "width") } : {}),
    ...(readOptionalNumberArg(args, "total_rise") !== undefined ? { totalRise: readOptionalNumberArg(args, "total_rise") } : {}),
    ...(readOptionalNumberArg(args, "step_count") !== undefined ? { stepCount: readOptionalNumberArg(args, "step_count") } : {}),
    ...(readOptionalNumberArg(args, "thickness") !== undefined ? { thickness: readOptionalNumberArg(args, "thickness") } : {}),
    ...(readRailingMode(args) ? { railingMode: readRailingMode(args) } : {}),
    ...(readOptionalMaterialPreset(args, "material_preset") ? { materialPreset: readOptionalMaterialPreset(args, "material_preset") } : {})
  }, context);
}

function executeCreateFence(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const start = readPointArg(args, "start");
  const end = readPointArg(args, "end");
  if (!start || !end) return sceneToolFailure("create_fence", "围栏起点和终点必须是两个数字组成的数组。 ");
  return executeSceneTool("create_fence", {
    type: "fence.create",
    parentId: readStringArg(args, "parent_id") || "level_default",
    name: readStringArg(args, "name") || undefined,
    start,
    end,
    height: readOptionalNumberArg(args, "height"),
    thickness: readOptionalNumberArg(args, "thickness"),
    style: readFenceStyle(args),
    materialPreset: readOptionalMaterialPreset(args, "material_preset")
  }, context);
}

function executeUpdateFence(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const id = readStringArg(args, "id");
  if (!id) return sceneToolFailure("update_fence", "缺少围栏 ID。 ");
  const start = "start" in args ? readPointArg(args, "start") : undefined;
  const end = "end" in args ? readPointArg(args, "end") : undefined;
  if (("start" in args && !start) || ("end" in args && !end)) return sceneToolFailure("update_fence", "围栏端点必须是两个数字组成的数组。 ");
  return executeSceneTool("update_fence", {
    type: "fence.update",
    id,
    ...(readStringArg(args, "name") ? { name: readStringArg(args, "name") } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(readOptionalNumberArg(args, "height") !== undefined ? { height: readOptionalNumberArg(args, "height") } : {}),
    ...(readOptionalNumberArg(args, "thickness") !== undefined ? { thickness: readOptionalNumberArg(args, "thickness") } : {}),
    ...(readFenceStyle(args) ? { style: readFenceStyle(args) } : {}),
    ...(readOptionalMaterialPreset(args, "material_preset") ? { materialPreset: readOptionalMaterialPreset(args, "material_preset") } : {})
  }, context);
}

function executeCreateDoor(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const wallId = readStringArg(args, "wall_id");
  const offset = readOptionalNumberArg(args, "offset");
  if (!wallId || offset === undefined) return sceneToolFailure("create_door", "门需要有效的 wall_id 和 offset。 ");
  return executeSceneTool("create_door", { type: "door.create", wallId, offset, name: readStringArg(args, "name") || undefined, width: readOptionalNumberArg(args, "width"), height: readOptionalNumberArg(args, "height"), sillHeight: readOptionalNumberArg(args, "sill_height"), materialPreset: readOptionalMaterialPreset(args, "material_preset") }, context);
}

function executeUpdateDoor(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const id = readStringArg(args, "id");
  if (!id) return sceneToolFailure("update_door", "缺少门 ID。 ");
  return executeSceneTool("update_door", { type: "door.update", id, ...(readStringArg(args, "name") ? { name: readStringArg(args, "name") } : {}), ...(readOptionalNumberArg(args, "offset") !== undefined ? { offset: readOptionalNumberArg(args, "offset") } : {}), ...(readOptionalNumberArg(args, "width") !== undefined ? { width: readOptionalNumberArg(args, "width") } : {}), ...(readOptionalNumberArg(args, "height") !== undefined ? { height: readOptionalNumberArg(args, "height") } : {}), ...(readOptionalNumberArg(args, "sill_height") !== undefined ? { sillHeight: readOptionalNumberArg(args, "sill_height") } : {}), ...(readOptionalMaterialPreset(args, "material_preset") ? { materialPreset: readOptionalMaterialPreset(args, "material_preset") } : {}) }, context);
}

function executeCreateWindow(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const wallId = readStringArg(args, "wall_id");
  const offset = readOptionalNumberArg(args, "offset");
  if (!wallId || offset === undefined) return sceneToolFailure("create_window", "窗需要有效的 wall_id 和 offset。 ");
  return executeSceneTool("create_window", { type: "window.create", wallId, offset, name: readStringArg(args, "name") || undefined, width: readOptionalNumberArg(args, "width"), height: readOptionalNumberArg(args, "height"), sillHeight: readOptionalNumberArg(args, "sill_height"), materialPreset: readOptionalMaterialPreset(args, "material_preset") }, context);
}

function executeUpdateWindow(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const id = readStringArg(args, "id");
  if (!id) return sceneToolFailure("update_window", "缺少窗 ID。 ");
  return executeSceneTool("update_window", { type: "window.update", id, ...(readStringArg(args, "name") ? { name: readStringArg(args, "name") } : {}), ...(readOptionalNumberArg(args, "offset") !== undefined ? { offset: readOptionalNumberArg(args, "offset") } : {}), ...(readOptionalNumberArg(args, "width") !== undefined ? { width: readOptionalNumberArg(args, "width") } : {}), ...(readOptionalNumberArg(args, "height") !== undefined ? { height: readOptionalNumberArg(args, "height") } : {}), ...(readOptionalNumberArg(args, "sill_height") !== undefined ? { sillHeight: readOptionalNumberArg(args, "sill_height") } : {}), ...(readOptionalMaterialPreset(args, "material_preset") ? { materialPreset: readOptionalMaterialPreset(args, "material_preset") } : {}) }, context);
}

function executeUpdateAsset(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const id = readStringArg(args, "id");
  if (!id) return sceneToolFailure("update_asset", "缺少参考模型 ID。");
  const position = "position" in args ? readPoint3Arg(args, "position") : undefined;
  const rotation = "rotation" in args ? readPoint3Arg(args, "rotation") : undefined;
  const scale = "scale" in args ? readPoint3Arg(args, "scale") : undefined;
  if (("position" in args && !position) || ("rotation" in args && !rotation) || ("scale" in args && (!scale || scale.some((value) => value <= 0)))) {
    return sceneToolFailure("update_asset", "参考模型的位置、旋转和缩放必须是三个有效数字；缩放必须大于 0。");
  }
  return executeSceneTool("update_asset", { type: "asset.update", id, ...(readStringArg(args, "name") ? { name: readStringArg(args, "name") } : {}), ...(position ? { position } : {}), ...(rotation ? { rotation } : {}), ...(scale ? { scale } : {}) }, context);
}

async function executeGenerate3dAsset(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const name = readStringArg(args, "name") || "混元生成构件";
  const prompt = readStringArg(args, "prompt");
  const imagePath = readStringArg(args, "image_path");
  const detailLevel = readDetailLevel(args);
  if (Boolean(prompt) === Boolean(imagePath)) return { toolName: "generate_3d_asset", summary: "请提供文本描述或图片路径其中之一。", content: "generate_3d_asset failed: provide exactly one input" };
  if ("detail_level" in args && !detailLevel) return { toolName: "generate_3d_asset", summary: "细节等级必须是 draft、standard 或 high。", content: "generate_3d_asset failed: invalid detail_level" };
  let imageBase64: string | undefined;
  if (imagePath) {
    const resolvedPath = resolveReadablePath(imagePath, context);
    assertPathAllowed(resolvedPath, context.allowedReadDirs, context.allowedReadFiles ?? [], "generate_3d_asset");
    if (!isSupportedImageFile(resolvedPath)) return { toolName: "generate_3d_asset", summary: "仅支持 JPG、PNG、WEBP 图片。", content: "generate_3d_asset failed: unsupported image" };
    imageBase64 = readFileSync(resolvedPath).toString("base64");
  }
  const outputDir = join(context.outputDir, "assets");
  const generated = await generateHunyuanGlb({ name, prompt: prompt || undefined, imageBase64, detailLevel }, outputDir);
  const faceBudget = generated.faceCount ? `，目标 ${generated.faceCount.toLocaleString("en-US")} 面` : "";
  return { toolName: "generate_3d_asset", summary: `已在当前项目生成资产：${name}${faceBudget}`, content: `已生成 GLB：${generated.path}${faceBudget}\n请立即调用 import_component_asset，并将 path 设为上述 GLB 路径以导入全局构件库。`, artifactPath: generated.path };
}

function readDetailLevel(args: Record<string, unknown>): Hunyuan3dDetailLevel | undefined {
  const value = readStringArg(args, "detail_level");
  return value === "draft" || value === "standard" || value === "high" ? value : undefined;
}

function executeImportComponentAsset(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const inputPath = readStringArg(args, "path");
  if (!inputPath) return { toolName: "import_component_asset", summary: "缺少待导入模型路径。", content: "import_component_asset failed: missing path" };
  const sourcePath = resolveReadablePath(inputPath, context);
  assertPathAllowed(sourcePath, context.allowedReadDirs, context.allowedReadFiles ?? [], "import_component_asset");
  const component = importGlobalComponent(context.componentLibraryRootDir ?? context.rootDir, sourcePath, {
    name: readStringArg(args, "name") || undefined,
    description: readStringArg(args, "description") || undefined,
    category: readStringArg(args, "category") || undefined,
    tags: readStringListArg(args, "tags"),
    placementRule: readStringArg(args, "placement_rule") || undefined
  });
  return {
    toolName: "import_component_asset",
    summary: `已导入全局构件库：${component.name}`,
    content: `已导入构件：${component.name}\n构件 ID：${component.id}\n全局文件：${component.file}`
  };
}

function executeGetComponentLibrary(context: AgentToolExecutionContext): AgentToolExecutionResult {
  const components = listGlobalComponents(context.componentLibraryRootDir ?? context.rootDir);
  const content = components.length ? components.map((item) => `- ${item.name}（${item.id}）：${item.category ?? "未分类"}；标签 ${item.tags.join("、") || "无"}；${item.description ?? item.prompt ?? "无描述"}；放置规则 ${item.placementRule ?? "未指定"}`).join("\n") : "构件库为空。";
  return { toolName: "get_component_library", summary: `已读取 ${components.length} 个全局构件`, content };
}

function executeDeleteNode(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const id = readStringArg(args, "id");
  if (!id) return sceneToolFailure("delete_node", "缺少节点 ID。");
  return executeSceneTool("delete_node", { type: "node.delete", id }, context);
}

function executeSceneTool(
  toolName: Extract<BuiltinToolName, "create_wall" | "update_wall" | "create_slab" | "update_slab" | "create_ceiling" | "update_ceiling" | "create_column" | "update_column" | "create_zone" | "update_zone" | "create_stair" | "update_stair" | "create_fence" | "update_fence" | "create_door" | "update_door" | "create_window" | "update_window" | "update_asset" | "delete_node">,
  command: SceneCommandInput,
  context: AgentToolExecutionContext
): AgentToolExecutionResult {
  if (!context.executeSceneCommand) return sceneToolFailure(toolName, "当前应用未连接场景服务。");
  const result = context.executeSceneCommand(command);
  if (!result.accepted) return sceneToolFailure(toolName, result.message);

  const nodeId = result.command.type === "level.clear" ? result.command.levelId : result.command.id;
  const action = result.command.type === "wall.create" ? "已创建墙体"
    : result.command.type === "wall.update" ? "已更新墙体"
    : result.command.type === "slab.create" ? "已创建楼板"
    : result.command.type === "slab.update" ? "已更新楼板"
    : result.command.type === "ceiling.create" ? "已创建天花"
    : result.command.type === "ceiling.update" ? "已更新天花"
    : result.command.type === "column.create" ? "已创建柱"
    : result.command.type === "column.update" ? "已更新柱"
    : result.command.type === "zone.create" ? "已创建房间"
    : result.command.type === "zone.update" ? "已更新房间"
    : result.command.type === "stair.create" ? "已创建楼梯"
    : result.command.type === "stair.update" ? "已更新楼梯"
    : result.command.type === "fence.create" ? "已创建围栏"
    : result.command.type === "fence.update" ? "已更新围栏"
    : result.command.type === "door.create" ? "已创建门"
    : result.command.type === "door.update" ? "已更新门"
    : result.command.type === "window.create" ? "已创建窗"
    : result.command.type === "window.update" ? "已更新窗"
    : result.command.type === "asset.update" ? "已更新参考模型"
    : result.command.type === "level.clear" ? "已清空楼层"
    : "已删除构件";
  return {
    toolName,
    summary: `${action}：${nodeId}`,
    content: `${action}\n节点 ID：${nodeId}\n场景版本：${result.snapshot.revision}`
  };
}

function sceneToolFailure(toolName: Extract<BuiltinToolName, "create_wall" | "update_wall" | "create_slab" | "update_slab" | "create_ceiling" | "update_ceiling" | "create_column" | "update_column" | "create_zone" | "update_zone" | "create_stair" | "update_stair" | "create_fence" | "update_fence" | "create_door" | "update_door" | "create_window" | "update_window" | "update_asset" | "delete_node">, message: string): AgentToolExecutionResult {
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

function readPoint3Arg(args: Record<string, unknown>, key: string): [number, number, number] | undefined {
  const value = args[key];
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item)) ? [value[0], value[1], value[2]] : undefined;
}

function readColumnCrossSection(args: Record<string, unknown>): "round" | "square" | "rectangular" | undefined {
  const value = readStringArg(args, "cross_section");
  return value === "round" || value === "square" || value === "rectangular" ? value : undefined;
}

function readRailingMode(args: Record<string, unknown>): "none" | "left" | "right" | "both" | undefined {
  const value = readStringArg(args, "railing_mode");
  return value === "none" || value === "left" || value === "right" || value === "both" ? value : undefined;
}

function readFenceStyle(args: Record<string, unknown>): "slat" | "rail" | "privacy" | undefined {
  const value = readStringArg(args, "style");
  return value === "slat" || value === "rail" || value === "privacy" ? value : undefined;
}

function readColorArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = readStringArg(args, key);
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
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
const createCeilingSchema = { type: "object", properties: { parent_id: { type: "string" }, name: { type: "string" }, polygon: polygonSchema, height: { type: "number" }, material_preset: materialPresetSchema }, required: ["polygon"], additionalProperties: false } as const;
const updateCeilingSchema = { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, polygon: polygonSchema, height: { type: "number" }, material_preset: materialPresetSchema }, required: ["id"], additionalProperties: false } as const;
const createColumnSchema = { type: "object", properties: { parent_id: { type: "string" }, name: { type: "string" }, position: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }, cross_section: { type: "string", enum: ["round", "square", "rectangular"] }, height: { type: "number" }, width: { type: "number" }, depth: { type: "number" }, material_preset: materialPresetSchema }, required: ["position"], additionalProperties: false } as const;
const updateColumnSchema = { type: "object", properties: { id: { type: "string" }, position: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }, cross_section: { type: "string", enum: ["round", "square", "rectangular"] }, height: { type: "number" }, width: { type: "number" }, depth: { type: "number" }, material_preset: materialPresetSchema }, required: ["id"], additionalProperties: false } as const;
const createZoneSchema = { type: "object", properties: { parent_id: { type: "string" }, name: { type: "string" }, polygon: polygonSchema, color: { type: "string" } }, required: ["polygon"], additionalProperties: false } as const;
const updateZoneSchema = { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, polygon: polygonSchema, color: { type: "string" } }, required: ["id"], additionalProperties: false } as const;
const stairRailingModeSchema = { type: "string", enum: ["none", "left", "right", "both"] } as const;
const point3Schema = { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 } as const;
const createStairSchema = { type: "object", properties: { parent_id: { type: "string" }, name: { type: "string" }, position: point3Schema, rotation: { type: "number" }, width: { type: "number" }, total_rise: { type: "number" }, step_count: { type: "integer", minimum: 2 }, thickness: { type: "number" }, railing_mode: stairRailingModeSchema, material_preset: materialPresetSchema }, required: ["position"], additionalProperties: false } as const;
const updateStairSchema = { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, position: point3Schema, rotation: { type: "number" }, width: { type: "number" }, total_rise: { type: "number" }, step_count: { type: "integer", minimum: 2 }, thickness: { type: "number" }, railing_mode: stairRailingModeSchema, material_preset: materialPresetSchema }, required: ["id"], additionalProperties: false } as const;
const fenceStyleSchema = { type: "string", enum: ["slat", "rail", "privacy"] } as const;
const createFenceSchema = { type: "object", properties: { parent_id: { type: "string" }, name: { type: "string" }, start: pointSchema, end: pointSchema, height: { type: "number" }, thickness: { type: "number" }, style: fenceStyleSchema, material_preset: materialPresetSchema }, required: ["start", "end"], additionalProperties: false } as const;
const updateFenceSchema = { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, start: pointSchema, end: pointSchema, height: { type: "number" }, thickness: { type: "number" }, style: fenceStyleSchema, material_preset: materialPresetSchema }, required: ["id"], additionalProperties: false } as const;
const createDoorSchema = { type: "object", properties: { wall_id: { type: "string" }, name: { type: "string" }, offset: { type: "number" }, width: { type: "number" }, height: { type: "number" }, sill_height: { type: "number" }, material_preset: materialPresetSchema }, required: ["wall_id", "offset"], additionalProperties: false } as const;
const updateDoorSchema = { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, offset: { type: "number" }, width: { type: "number" }, height: { type: "number" }, sill_height: { type: "number" }, material_preset: materialPresetSchema }, required: ["id"], additionalProperties: false } as const;
const createWindowSchema = { type: "object", properties: { wall_id: { type: "string" }, name: { type: "string" }, offset: { type: "number" }, width: { type: "number" }, height: { type: "number" }, sill_height: { type: "number" }, material_preset: materialPresetSchema }, required: ["wall_id", "offset"], additionalProperties: false } as const;
const updateWindowSchema = { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, offset: { type: "number" }, width: { type: "number" }, height: { type: "number" }, sill_height: { type: "number" }, material_preset: materialPresetSchema }, required: ["id"], additionalProperties: false } as const;
const updateAssetSchema = { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, position: point3Schema, rotation: point3Schema, scale: point3Schema }, required: ["id"], additionalProperties: false } as const;
const generate3dAssetSchema = { type: "object", properties: { name: { type: "string" }, prompt: { type: "string" }, image_path: { type: "string" }, detail_level: { type: "string", enum: ["draft", "standard", "high"], description: "draft 约 20,000 面，用于快速布局；standard 约 50,000 面，默认；high 约 120,000 面，仅用于单件近景展示。" } }, required: ["name"], additionalProperties: false } as const;
const importComponentAssetSchema = { type: "object", properties: { path: { type: "string" }, name: { type: "string" }, description: { type: "string" }, category: { type: "string" }, tags: { type: "array", items: { type: "string" } }, placement_rule: { type: "string" } }, required: ["path"], additionalProperties: false } as const;
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
