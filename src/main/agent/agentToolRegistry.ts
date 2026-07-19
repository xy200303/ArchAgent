/** Registers Agent-callable tools and routes validated calls to focused executors. */
import { exec, type ExecOptions } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { TextDecoder, promisify } from "node:util";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall, ChatCompletionTool } from "openai/resources/chat/completions";
import type { AppSettings, ReconstructionWorkflowPlacement, SessionResource } from "../../shared/types";
import type { SceneAssetNode, SceneCommandInput, SceneCommandResult, ScenePoint, SceneSnapshot, SceneWallNode, WallMaterialPreset } from "../../shared/modeling3d/sceneContracts";
import { getSceneCoordinateContext } from "../../shared/modeling3d/sceneCoordinates";
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
import type { CreateReconstructionWorkflowInput } from "./reconstructionWorkflowService";
import { extractObjectReference, generateDesignPreview } from "./designPreviewService";
import { cropReferenceObjects } from "./referenceCropService";
import { findGlobalComponent, importGlobalComponent, listGlobalComponents } from "../modeling3d/componentLibraryService";

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
  attachmentPaths?: Record<string, string>;
  artifactPaths?: Record<string, string>;
  resources?: SessionResource[];
  execBashEnabled: boolean;
  bundledPythonRuntime?: BundledPythonRuntime;
  getSceneSnapshot?: () => SceneSnapshot;
  captureScenePreview?: (view?: import("./agentRuntime").ScenePreviewView) => Promise<string>;
  executeSceneCommand?: (command: SceneCommandInput) => SceneCommandResult;
  placeComponentLibraryItem?: (input: {
    componentId: string;
    name?: string;
    parentId?: string;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    footprint?: [number, number];
  }) => SceneCommandResult;
  createReconstructionWorkflow?: (input: CreateReconstructionWorkflowInput) => unknown;
}

export interface AgentToolExecutionResult {
  toolName: BuiltinToolName;
  summary: string;
  content: string;
  artifactPath?: string;
  /** A registered session resource that must be explicitly delivered to the user. */
  sendResourceId?: string;
  imagePaths?: string[];
  parentResourceIds?: string[];
}

export type AgentToolLayer = "foundation" | "reference" | "workflow" | "scene" | "asset" | "delivery" | "extension";

export function buildAgentChatTools(options: { includeExecBash: boolean; includeArtifactTools?: boolean; layers?: readonly AgentToolLayer[] }): ChatCompletionTool[] {
  return buildRefactoredAgentChatTools(options);
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
    { type: "function", function: { name: "generate_3d_asset", description: "独立家具/陈设/设备资产制作：仅在非重建工作流、且构件库没有匹配项或用户明确要求新资产时调用。输入中文 prompt 或单物件参考图之一；GLB 仅保存到 output/assets，后续必须显式入库再实例化。", parameters: generate3dAssetSchema } },
    { type: "function", function: { name: "import_component_asset", description: "资产入库：登记当前项目内的 GLB、GLTF、OBJ、STL 到全局构件库并返回 component_id。入库不会把模型显示到场景；如需场景可见，必须再用 place_component_asset 获取 asset_id。", parameters: importComponentAssetSchema } },
    { type: "function", function: { name: "get_component_library", description: "构件库全量浏览：仅在 search_component_library 不足以判断时调用。", parameters: emptyObjectSchema } },
    { type: "function", function: { name: "search_component_library", description: "构件库候选检索：按名称、类别、标签和描述返回可复用 component_id。所有资产生成前必须先调用。", parameters: componentLibrarySearchSchema } },
    { type: "function", function: { name: "place_component_asset", description: "放置已入库构件：使用检索返回的 component_id 创建场景资产并返回 asset 节点 ID。不得用 component_id 调用 update_asset。", parameters: placeComponentAssetSchema } },
    { type: "function", function: { name: "create_reconstruction_workflow", description: "创建重建计划：记录资料、假设、必答选项、复用/待生成资产与摆放信息。计划未由用户确认前，禁止生成、入库或摆放计划资产。", parameters: reconstructionWorkflowSchema } },
    { type: "function", function: { name: "generate_design_preview", description: "根据已确认或明确标注假设的户型/空间方案生成一张 2D 效果图，供用户确认布局和风格；这是视觉预览，不得把它当作精确尺寸或 3D 生成授权。", parameters: designPreviewSchema } },
    { type: "function", function: { name: "analyze_spatial_reference", description: "结构化分析户型图或实物照片。对复杂照片必须返回场景复杂度、独立物件及其 [x,y,width,height] 千分比边界框、遮挡和不确定项，再创建重建计划。", parameters: spatialReferenceSchema } },
    { type: "function", function: { name: "extract_object_reference", description: "对复杂照片使用图生图提取单个确认物件，生成纯背景单物件参考图。必须先让用户确认提取图正确，才能把它用于图生3D。", parameters: objectExtractionSchema } },
    { type: "function", function: { name: "crop_reference_objects", description: "把复杂照片中已识别的独立物件按千分比边界框裁成单物件 PNG，供重建计划使用 image_path 逐件图生 3D。", parameters: cropReferenceSchema } },
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

  const enabledLayers = options.layers ? new Set(options.layers) : undefined;
  return tools
    .filter((tool) => tool.type !== "function" || !enabledLayers || enabledLayers.has(resolveAgentToolLayer(tool.function.name)))
    .map((tool) =>
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

function buildRefactoredAgentChatTools(options: { includeExecBash: boolean }): ChatCompletionTool[] {
  const tools: ChatCompletionTool[] = [
    { type: "function", function: { name: "extract_reference_object", description: "从复杂照片提取指定的单件物体参考图，供用户确认后用于图生 3D。", parameters: extractReferenceObjectSchema } },
    { type: "function", function: { name: "generate_3d_asset", description: "生成一个最小单实体、边界干净且可独立摆放的完整低模 GLB，并自动登记到资产库。name 和 prompt 只描述资产及其外观；可包含完整互动，但不得传功能、方案、场景、摆放说明、截断物体或无关环境。不会摆放；返回 library_asset_id，随后可查看预览或用 place_library_assets 实例化。", parameters: generate3dAssetSchema } },
    { type: "function", function: { name: "search_resources", description: "按名称、类型、来源或状态搜索当前会话资源，返回后续 view_resources、图生 3D 或 send_file 可使用的 resource_id。", parameters: searchResourcesSchema } },
    { type: "function", function: { name: "view_resources", description: "按 resource_id 查看项目资源，或按 search_library_assets 返回的 library_asset_id 查看资产库模型。图片和可用 3D 预览直接回传给模型；文档返回相关文字。不得传本机路径。", parameters: viewResourcesSchema } },
    { type: "function", function: { name: "search_library_assets", description: "按名称、类别、标签或描述搜索全局资产库，返回可直接用于实例化的 library_asset_id、名称、参数与预览状态。", parameters: componentLibrarySearchSchema } },
    { type: "function", function: { name: "place_library_asset", description: "将一个 library_asset_id 实例化到当前场景。用于单件精确摆放；参数与 place_library_assets.items 的单项一致，必须携带 expected_revision。", parameters: placeLibraryAssetSchema } },
    { type: "function", function: { name: "preview_library_asset_placement", description: "预览一个或多个资产的落点与几何校验，不修改场景。anchor.side=room_interior（inside 兼容别名）会按房间/楼板边界自动判定室内侧，不依赖墙体绘制方向。", parameters: previewLibraryAssetPlacementSchema } },
    { type: "function", function: { name: "place_library_assets", description: "将 search_library_assets 返回的 library_asset_id 实例化到当前场景。position 为世界米制坐标，或使用 anchor 锚定墙体；anchor.side=room_interior（inside 兼容别名）自动落在室内侧，不依赖墙体绘制方向。朝向优先使用 look_at 或 facing，rotation_degrees 仅作精确兜底。返回 scene_object_id、显示名和几何校验结果。", parameters: placeLibraryAssetsSchema } },
    { type: "function", function: { name: "inspect_scene", description: "读取当前场景的建筑元素和已放置物件，返回可用于后续操作的公开 ID、显示名、参数与版本。", parameters: emptyObjectSchema } },
    { type: "function", function: { name: "view_scene_preview", description: "获取当前 3D 工作台的 WebGL 预览图并直接返回给 Agent。可选 view 指定 current、perspective、top、front、right、left、back 或 bottom，以核对不同方向的摆放和明显穿模；只读，不修改场景数据。若要把截图展示给用户，必须再用本工具结果中的 resource_id 调用 send_file。", parameters: scenePreviewSchema } },
    { type: "function", function: { name: "update_scene_object", description: "按 scene_object_id 或唯一显示名调整或删除一个已放置物件。可用世界 position，或 anchor 锚定墙体加 local 偏移；朝向优先 look_at 或 facing，rotation_degrees 仅作精确兜底。", parameters: updateSceneObjectsSchema } },
    { type: "function", function: { name: "create_architecture_element", description: "创建一个建筑元素（墙、门、窗、楼板、房间等）。用于单元素精确创建；必须携带 kind、properties 和 expected_revision。", parameters: createArchitectureElementSchema } },
    { type: "function", function: { name: "create_architecture_elements", description: "批量创建多个明确的建筑元素；元素可使用 reference 作为唯一显示名，工具返回公开元素 ID。", parameters: buildArchitectureSchema } },
    { type: "function", function: { name: "update_architecture_element", description: "更新或删除一个指定类型的建筑元素。用于单元素精确修改；kind 必须与目标元素一致。", parameters: updateArchitectureElementSchema } },
    { type: "function", function: { name: "update_architecture_elements", description: "批量更新或删除建筑元素。", parameters: updateArchitectureSchema } },
    { type: "function", function: { name: "create_reconstruction_plan", description: "创建待用户确认的重建计划，记录假设、必答问题、可复用与待生成物件及其语义摆放；不会生成 3D。", parameters: reconstructionWorkflowSchema } },
    { type: "function", function: { name: "generate_design_preview", description: "根据已知事实和明确假设生成二维效果预览，供用户确认布局与风格。", parameters: designPreviewSchema } },
    { type: "function", function: { name: "send_file", description: "把效果图、提取图、模型或报告 resource 显式发送给用户。", parameters: sendArtifactSchema } }
  ];
  if (options.includeExecBash) tools.push({ type: "function", function: { name: "exec_bash", description: "在受控项目目录执行外部脚本。仅用于有明确 purpose 和 expected_outputs 的可信处理任务。", parameters: execBashSchema } });
  return tools.map((tool) => tool.type === "function" ? { ...tool, function: { ...tool.function, strict: true } } : tool);
}

function resolveAgentToolLayer(toolName: string): AgentToolLayer {
  if (["get_scene", "create_wall", "update_wall", "create_slab", "update_slab", "create_ceiling", "update_ceiling", "create_column", "update_column", "create_zone", "update_zone", "create_stair", "update_stair", "create_fence", "update_fence", "create_door", "update_door", "create_window", "update_window", "update_asset", "delete_node"].includes(toolName)) return "scene";
  if (["generate_3d_asset", "import_component_asset", "get_component_library", "place_component_asset"].includes(toolName)) return "asset";
  if (["search_component_library", "create_reconstruction_workflow"].includes(toolName)) return "workflow";
  if (["generate_design_preview", "analyze_spatial_reference", "extract_object_reference", "crop_reference_objects", "read_image"].includes(toolName)) return "reference";
  if (["write_file", "send_file"].includes(toolName)) return "delivery";
  if (toolName === "exec_bash") return "extension";
  return "foundation";
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
    case "extract_reference_object":
      return executeExtractReferenceObject(args, context);
    case "generate_3d_asset":
      return executeGenerateSingleAsset(args, context);
    case "search_resources":
      return executeSearchResources(args, context);
    case "view_resources":
      return executeViewResources(args, context);
    case "search_library_assets":
      return executeSearchLibraryAssets(args, context);
    case "place_library_asset":
      return executePlaceLibraryAsset(args, context);
    case "place_library_assets":
      return executePlaceLibraryAssets(args, context);
    case "preview_library_asset_placement":
      return executePreviewLibraryAssetPlacement(args, context);
    case "inspect_scene":
      return executeInspectScene(context);
    case "view_scene_preview":
      return executeViewScenePreview(args, context);
    case "update_scene_object":
      return executeUpdateSceneObjects(args, context);
    case "create_architecture_element":
      return executeCreateArchitectureElement(args, context);
    case "create_architecture_elements":
      return executeBuildArchitecture(args, context);
    case "update_architecture_element":
      return executeUpdateArchitectureElement(args, context);
    case "update_architecture_elements":
      return executeUpdateArchitecture(args, context);
    case "create_reconstruction_plan":
      return renameToolResult(executeCreateReconstructionWorkflow(args, context), "create_reconstruction_plan");
    case "generate_design_preview":
      return renameToolResult(await executeGenerateDesignPreview(args, context), "generate_design_preview");
    case "send_file":
      return executeSendArtifact(args, context);
    case "exec_bash":
      return executeBash(args, context);
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

function executeInspectScene(context: AgentToolExecutionContext): AgentToolExecutionResult {
  if (!context.getSceneSnapshot) return { toolName: "inspect_scene", summary: "当前应用未连接场景服务。", content: "inspect_scene failed: scene service unavailable" };
  const snapshot = context.getSceneSnapshot();
  const objects = Object.values(snapshot.nodes).filter((node) => node.type === "asset");
  const publicObjects = objects.length
    ? objects.map((object) => formatSemanticAssetPlacement(snapshot, object)).join("\n")
    : "- 无";
  return { toolName: "inspect_scene", summary: `已读取场景版本 ${snapshot.revision}`, content: `${summarizeSceneForAgent(snapshot)}\n\n可操作场景物件：\n${publicObjects}` };
}

async function executeViewScenePreview(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  if (!context.captureScenePreview) return { toolName: "view_scene_preview", summary: "当前应用未连接 WebGL 预览服务。", content: "view_scene_preview failed: viewport capture unavailable" };
  try {
    const view = readStringArg(args, "view") || "current";
    if (!SCENE_PREVIEW_VIEWS.includes(view as typeof SCENE_PREVIEW_VIEWS[number])) throw new Error("view 必须为 current、perspective、top、front、right、left、back 或 bottom。");
    const dataBase64 = await context.captureScenePreview(view as import("./agentRuntime").ScenePreviewView);
    if (!dataBase64) throw new Error("WebGL 预览图为空。");
    const filePath = join(context.outputDir, `scene-preview-${Date.now()}.png`);
    writeFileSync(filePath, Buffer.from(dataBase64, "base64"));
    return {
      toolName: "view_scene_preview",
      summary: `已获取 WebGL 场景预览图（${view}）`,
      content: `WebGL 场景预览图（${view}）已返回。请以图中可见结果核对物件位置、朝向与明显穿模；精确坐标和版本仍以 inspect_scene 为准。`,
      artifactPath: filePath
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { toolName: "view_scene_preview", summary: `获取 WebGL 预览图失败：${message}`, content: `view_scene_preview failed: ${message}` };
  }
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
  const snapshot = context.getSceneSnapshot?.();
  if (snapshot && !snapshot.nodes[id]) return sceneAssetNodeNotFoundFailure("update_asset", id);
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
  return {
    toolName: "generate_3d_asset",
    summary: `已在当前项目生成资产：${name}${faceBudget}`,
    content: `已生成 GLB：${generated.path}${faceBudget}\n该文件尚未入库，也尚未出现在场景中。下一步调用 import_component_asset(path=上述 GLB 路径) 获取 component_id；如需摆放，再调用 place_component_asset(component_id) 获取 asset_id。只有 asset_id 能用于 update_asset。`,
    artifactPath: generated.path
  };
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
    content: `已导入构件：${component.name}\n构件库 component_id：${component.id}\n全局文件：${component.file}\n该构件仍未出现在场景中。若用户要求摆放，立即调用 place_component_asset(component_id=${component.id})；只有该调用返回的 asset_id 可以传给 update_asset。`
  };
}

function executeGetComponentLibrary(context: AgentToolExecutionContext): AgentToolExecutionResult {
  const components = listGlobalComponents(context.componentLibraryRootDir ?? context.rootDir);
  const content = components.length
    ? `${components.map((item) => `- ${item.name}（component_id: ${item.id}）：${item.category ?? "未分类"}；标签 ${item.tags.join("、") || "无"}；${item.description ?? item.prompt ?? "无描述"}；放置规则 ${item.placementRule ?? "未指定"}`).join("\n")}\n\n命中构件时，必须调用 place_component_asset 并原样传 component_id 放入场景；它可能显示为构件库文件路径，但不能直接传给 update_asset。`
    : "构件库为空。";
  return { toolName: "get_component_library", summary: `已读取 ${components.length} 个全局构件`, content };
}

function executeSearchComponentLibrary(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const query = readStringArg(args, "query");
  if (!query) return { toolName: "search_component_library", summary: "缺少构件检索关键词。", content: "search_component_library failed: missing query" };
  const limit = Math.min(Math.max(Math.floor(readNumberArg(args, "limit", 6)), 1), 20);
  const terms = query.toLowerCase().split(/[\s,，、/]+/).filter((term) => term.length > 0);
  const matches = listGlobalComponents(context.componentLibraryRootDir ?? context.rootDir)
    .map((component) => {
      const searchable = `${component.name} ${component.category ?? ""} ${component.tags.join(" ")} ${component.description ?? component.prompt ?? ""}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
      return { component, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.component.createdAt.localeCompare(left.component.createdAt))
    .slice(0, limit);
  const content = matches.length
    ? matches.map(({ component, score }) => `- ${component.name}（component_id: ${component.id}，匹配 ${score}）：${component.category ?? "未分类"}；标签 ${component.tags.join("、") || "无"}；${component.description ?? component.prompt ?? "无描述"}`).join("\n")
    : "未找到语义匹配的构件。可以在重建计划中将该物件标为待生成，但必须等待用户确认。";
  return { toolName: "search_component_library", summary: matches.length ? `找到 ${matches.length} 个“${query}”候选构件` : `未找到“${query}”候选构件`, content };
}

function executeSearchLibraryAssets(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const query = readStringArg(args, "query");
  if (!query) return { toolName: "search_library_assets", summary: "缺少资产搜索关键词。", content: "search_library_assets failed: missing query" };
  const limit = Math.min(Math.max(Math.floor(readNumberArg(args, "limit", 6)), 1), 20);
  const terms = query.toLowerCase().split(/[\s,，、/]+/).filter(Boolean);
  const matches = listGlobalComponents(context.componentLibraryRootDir ?? context.rootDir)
    .map((component) => {
      const searchable = `${component.name} ${component.category ?? ""} ${component.tags.join(" ")} ${component.description ?? component.prompt ?? ""}`.toLowerCase();
      return { component, score: terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0) };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.component.createdAt.localeCompare(left.component.createdAt))
    .slice(0, limit);
  const content = matches.length
    ? matches.map(({ component }) => `- library_asset_id: ${component.id}\n  名称：${component.name}\n  类别：${component.category ?? "未分类"}\n  标签：${component.tags.join("、") || "无"}\n  描述：${component.description ?? component.prompt ?? "无"}\n  放置建议：${component.placementRule ?? "无"}\n  预览：${component.previewAvailable ? "可用" : "无"}`).join("\n")
    : `没有找到“${query}”的资产。`;
  return { toolName: "search_library_assets", summary: matches.length ? `找到 ${matches.length} 个资产候选` : `未找到“${query}”资产`, content };
}

function executePlaceLibraryAssets(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  if (!context.placeComponentLibraryItem) return { toolName: "place_library_assets", summary: "当前应用未连接场景资产服务。", content: "place_library_assets failed: scene asset placement unavailable" };
  const items = Array.isArray(args.items) ? args.items : [];
  if (!items.length) return { toolName: "place_library_assets", summary: "请至少提供一个资产。", content: "place_library_assets failed: missing items" };
  const library = new Map(listGlobalComponents(context.componentLibraryRootDir ?? context.rootDir).map((item) => [item.id, item]));
  const references = new Set(Object.values(context.getSceneSnapshot?.().nodes ?? {}).filter((node) => node.type === "asset").map((node) => node.name));
  const created: Array<{ id: string; reference: string; diagnostics: string }> = [];
  for (const rawItem of items) {
    const item = readRecord(rawItem);
    const libraryAssetId = item ? readStringArg(item, "library_asset_id") : "";
    const component = library.get(libraryAssetId);
    if (!component) return { toolName: "place_library_assets", summary: `未找到资产库 ID：${libraryAssetId || "（缺失）"}`, content: "place_library_assets failed: unknown library asset" };
    if (!context.getSceneSnapshot) return { toolName: "place_library_assets", summary: "当前应用未连接场景服务。", content: "place_library_assets failed: scene unavailable" };
    const placement = resolveAssetPlacement(item ?? {}, context.getSceneSnapshot());
    if ("error" in placement) return { toolName: "place_library_assets", summary: placement.error, content: `place_library_assets failed: ${placement.error}` };
    const { position, rotation } = placement;
    const scale = item && "scale" in item ? readPoint3Arg(item, "scale") : undefined;
    const footprint = item && "footprint_meters" in item ? readPoint2Arg(item, "footprint_meters") : undefined;
    if (item && "scale" in item && (!scale || scale.some((value) => value <= 0))) return { toolName: "place_library_assets", summary: `资产“${component.name}”的缩放参数无效。`, content: "place_library_assets failed: invalid scale" };
    if (item && "footprint_meters" in item && (!footprint || footprint.some((value) => value <= 0))) return { toolName: "place_library_assets", summary: `资产“${component.name}”的占地尺寸无效。`, content: "place_library_assets failed: invalid footprint" };
    const collision = footprint && position ? findAssetPlacementCollision(context.getSceneSnapshot(), position, rotation ?? [0, 0, 0], footprint, scale ?? [1, 1, 1]) : undefined;
    if (collision) return { toolName: "place_library_assets", summary: `“${component.name}”会与“${collision.name}”占地碰撞。`, content: `place_library_assets failed: footprint collision with ${collision.name} (${collision.id})` };
    const architectureCollision = footprint && position ? findArchitecturePlacementCollision(context.getSceneSnapshot(), position, rotation ?? [0, 0, 0], footprint, scale ?? [1, 1, 1]) : undefined;
    if (architectureCollision) return { toolName: "place_library_assets", summary: `“${component.name}”会与${architectureCollision.wall.name}穿模 ${formatMeters(architectureCollision.overlap)}。`, content: `place_library_assets failed: wall collision with ${architectureCollision.wall.id}` };
    const reference = uniqueSceneReference(item ? readStringArg(item, "reference") || component.name : component.name, references);
    references.add(reference);
    try {
      const result = context.placeComponentLibraryItem({ componentId: component.id, name: reference, ...(position ? { position } : {}), ...(rotation ? { rotation } : {}), ...(scale ? { scale } : {}), ...(footprint ? { footprint } : {}) });
      if (!result.accepted) return { toolName: "place_library_assets", summary: `实例化“${component.name}”失败：${result.message}`, content: `place_library_assets failed: ${result.message}` };
      if (result.command.type !== "asset.create") return { toolName: "place_library_assets", summary: "实例化未返回场景物件。", content: "place_library_assets failed: unexpected scene command" };
      created.push({ id: result.command.id, reference, diagnostics: formatPlacementDiagnostics(context.getSceneSnapshot() ?? result.snapshot, position!, rotation ?? [0, 0, 0], footprint, scale ?? [1, 1, 1]) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { toolName: "place_library_assets", summary: `实例化“${component.name}”失败：${message}`, content: `place_library_assets failed: ${message}` };
    }
  }
  return { toolName: "place_library_assets", summary: `已实例化 ${created.length} 个场景物件`, content: created.map((item) => `- scene_object_id: ${item.id}；显示名：${item.reference}\n${item.diagnostics}`).join("\n") };
}

function executePreviewLibraryAssetPlacement(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const snapshot = context.getSceneSnapshot?.();
  const items = Array.isArray(args.items) ? args.items : [];
  if (!snapshot) return { toolName: "preview_library_asset_placement", summary: "当前应用未连接场景服务。", content: "preview_library_asset_placement failed: scene unavailable" };
  if (!items.length) return { toolName: "preview_library_asset_placement", summary: "请至少提供一个资产。", content: "preview_library_asset_placement failed: missing items" };

  const previews: string[] = [];
  for (const rawItem of items) {
    const item = readRecord(rawItem) ?? {};
    const placement = resolveAssetPlacement(item, snapshot);
    if ("error" in placement || !placement.position) {
      const message = "error" in placement ? placement.error : "无法解析落点。";
      return { toolName: "preview_library_asset_placement", summary: message, content: `preview_library_asset_placement failed: ${message}` };
    }
    const scale = "scale" in item ? readPoint3Arg(item, "scale") : [1, 1, 1] as [number, number, number];
    const footprint = "footprint_meters" in item ? readPoint2Arg(item, "footprint_meters") : undefined;
    if (!scale || scale.some((value) => value <= 0) || ("footprint_meters" in item && (!footprint || footprint.some((value) => value <= 0)))) {
      return { toolName: "preview_library_asset_placement", summary: "缩放或占地尺寸无效。", content: "preview_library_asset_placement failed: invalid placement dimensions" };
    }
    const furnitureCollision = footprint ? findAssetPlacementCollision(snapshot, placement.position, placement.rotation ?? [0, 0, 0], footprint, scale) : undefined;
    const architectureCollision = footprint ? findArchitecturePlacementCollision(snapshot, placement.position, placement.rotation ?? [0, 0, 0], footprint, scale) : undefined;
    previews.push(`- 预览落点：[${placement.position.map(formatCoordinate).join(", ")}]\n${formatPlacementDiagnostics(snapshot, placement.position, placement.rotation ?? [0, 0, 0], footprint, scale)}${furnitureCollision ? `\n  家具碰撞：与“${furnitureCollision.name}”占地重叠` : ""}${architectureCollision ? `\n  建筑穿模：与${architectureCollision.wall.name}重叠 ${formatMeters(architectureCollision.overlap)}` : ""}`);
  }
  return { toolName: "preview_library_asset_placement", summary: `已预览 ${previews.length} 个落点（场景版本 ${snapshot.revision}），未修改场景。`, content: previews.join("\n") };
}

function executePlaceLibraryAsset(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const expectedRevision = readOptionalNumberArg(args, "expected_revision");
  const snapshot = context.getSceneSnapshot?.();
  if (expectedRevision === undefined || !snapshot) return { toolName: "place_library_asset", summary: "需要场景版本。", content: "place_library_asset failed: missing expected_revision" };
  if (snapshot.revision !== expectedRevision) return staleSceneRevisionFailure("place_library_asset", snapshot);
  const { expected_revision: _expectedRevision, ...item } = args;
  return renameToolResult(executePlaceLibraryAssets({ items: [item] }, context), "place_library_asset");
}

function executePlaceSceneObjects(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  if (!context.placeComponentLibraryItem) return { toolName: "place_scene_objects", summary: "当前应用未连接场景资产服务。", content: "place_scene_objects failed: scene asset placement unavailable" };
  const rawItems = Array.isArray(args.items) ? args.items : [];
  if (!rawItems.length) return { toolName: "place_scene_objects", summary: "请至少提供一个待放置物件。", content: "place_scene_objects failed: missing items" };

  const existingReferences = new Set(Object.values(context.getSceneSnapshot?.().nodes ?? {}).filter((node) => node.type === "asset").map((node) => node.name));
  const reservedReferences = new Set(existingReferences);
  const components = listGlobalComponents(context.componentLibraryRootDir ?? context.rootDir);
  const placements: Array<{ componentId: string; reference: string; position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] }> = [];

  for (const rawItem of rawItems) {
    const item = readRecord(rawItem);
    const query = item ? readStringArg(item, "query") : "";
    if (!query) return { toolName: "place_scene_objects", summary: "每个物件都需要 query。", content: "place_scene_objects failed: missing object query" };
    const position = item && "position" in item ? readPoint3Arg(item, "position") : undefined;
    const rotation = item && "rotation" in item ? readPoint3Arg(item, "rotation") : undefined;
    const scale = item && "scale" in item ? readPoint3Arg(item, "scale") : undefined;
    if ((item && "position" in item && !position) || (item && "rotation" in item && !rotation) || (item && "scale" in item && (!scale || scale.some((value) => value <= 0)))) {
      return { toolName: "place_scene_objects", summary: `物件“${query}”的变换参数无效。`, content: "place_scene_objects failed: invalid transform" };
    }
    const resolved = resolveLibraryComponent(query, components);
    if ("message" in resolved) return { toolName: "place_scene_objects", summary: resolved.message, content: `place_scene_objects failed: ${resolved.message}` };
    const requestedReference = item ? readStringArg(item, "reference") : "";
    const reference = uniqueSceneReference(requestedReference || resolved.component.name, reservedReferences);
    reservedReferences.add(reference);
    placements.push({ componentId: resolved.component.id, reference, ...(position ? { position } : {}), ...(rotation ? { rotation } : {}), ...(scale ? { scale } : {}) });
  }

  const created: Array<{ reference: string; id: string }> = [];
  for (const placement of placements) {
    try {
      const result = context.placeComponentLibraryItem({ componentId: placement.componentId, name: placement.reference, ...(placement.position ? { position: placement.position } : {}), ...(placement.rotation ? { rotation: placement.rotation } : {}), ...(placement.scale ? { scale: placement.scale } : {}) });
      if (!result.accepted) return { toolName: "place_scene_objects", summary: `放置“${placement.reference}”失败：${result.message}`, content: `place_scene_objects failed: ${result.message}` };
      if (result.command.type !== "asset.create") return { toolName: "place_scene_objects", summary: `放置“${placement.reference}”失败：未创建场景节点`, content: "place_scene_objects failed: asset node was not created" };
      created.push({ reference: placement.reference, id: result.command.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { toolName: "place_scene_objects", summary: `放置“${placement.reference}”失败：${message}`, content: `place_scene_objects failed: ${message}` };
    }
  }
  const revision = context.getSceneSnapshot?.().revision;
  return {
    toolName: "place_scene_objects",
    summary: `已放置 ${created.length} 个场景物件`,
    content: `已放置场景物件：\n${created.map(({ reference }) => `- ${reference}`).join("\n")}\n后续仅使用上述场景引用调用 adjust_scene_object，不要使用构件库 ID、GLB 路径或内部节点 ID。${revision === undefined ? "" : `\n场景版本：${revision}`}`
  };
}

function resolveLibraryComponent(query: string, components: ReturnType<typeof listGlobalComponents>): { component: ReturnType<typeof listGlobalComponents>[number] } | { message: string } {
  const normalized = query.trim().toLowerCase();
  const scored = components.map((component) => {
    const searchable = `${component.name} ${component.category ?? ""} ${component.tags.join(" ")} ${component.description ?? component.prompt ?? ""}`.toLowerCase();
    const exact = component.name.trim().toLowerCase() === normalized;
    const score = exact ? 100 : normalized.split(/[\s,，、/]+/).filter(Boolean).reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0);
    return { component, score };
  }).filter((item) => item.score > 0).sort((left, right) => right.score - left.score || right.component.createdAt.localeCompare(left.component.createdAt));
  if (!scored.length) return { message: `构件库中没有找到“${query}”。请在重建计划中标记为待生成并等待用户确认。` };
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return { message: `“${query}”存在多个同等候选：${scored.slice(0, 3).map((item) => item.component.name).join("、")}。请向用户确认具体款式后再放置。` };
  }
  return { component: scored[0].component };
}

function uniqueSceneReference(base: string, usedReferences: Set<string>): string {
  const trimmed = base.trim() || "场景物件";
  let sequence = 1;
  let reference = `${trimmed}_${sequence}`;
  while (usedReferences.has(reference)) reference = `${trimmed}_${++sequence}`;
  return reference;
}

/** Places a registered library model and returns the generated scene asset ID for later edits. */
function executePlaceComponentAsset(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const componentId = readStringArg(args, "component_id");
  if (!componentId) return { toolName: "place_component_asset", summary: "缺少构件库 component_id。", content: "place_component_asset failed: missing component_id" };
  if (!context.placeComponentLibraryItem) return { toolName: "place_component_asset", summary: "当前应用未连接构件库放置服务。", content: "place_component_asset failed: component placement unavailable" };

  const position = "position" in args ? readPoint3Arg(args, "position") : undefined;
  const rotation = "rotation" in args ? readPoint3Arg(args, "rotation") : undefined;
  const scale = "scale" in args ? readPoint3Arg(args, "scale") : undefined;
  if (("position" in args && !position) || ("rotation" in args && !rotation) || ("scale" in args && (!scale || scale.some((value) => value <= 0)))) {
    return { toolName: "place_component_asset", summary: "位置、旋转和缩放必须是三个有效数字；缩放必须大于 0。", content: "place_component_asset failed: invalid transform" };
  }

  try {
    const result = context.placeComponentLibraryItem({
      componentId,
      ...(readStringArg(args, "name") ? { name: readStringArg(args, "name") } : {}),
      parentId: readStringArg(args, "parent_id") || undefined,
      ...(position ? { position } : {}),
      ...(rotation ? { rotation } : {}),
      ...(scale ? { scale } : {})
    });
    if (!result.accepted) return { toolName: "place_component_asset", summary: result.message, content: `place_component_asset failed: ${result.message}` };
    if (result.command.type !== "asset.create") return { toolName: "place_component_asset", summary: "构件放置未返回参考模型节点。", content: "place_component_asset failed: unexpected scene command" };
    return {
      toolName: "place_component_asset",
      summary: `已放置构件：${result.command.name}`,
      content: `已将构件“${result.command.name}”实例化到场景。\nasset_id（后续 update_asset / asset.update 只能使用此 ID）：${result.command.id}\n场景版本：${result.snapshot.revision}\n下一步如需修改，先读取场景，再使用此 asset_id。`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { toolName: "place_component_asset", summary: `放置构件失败：${message}`, content: `place_component_asset failed: ${message}` };
  }
}

function executeCreateReconstructionWorkflow(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  if (!context.createReconstructionWorkflow) {
    return { toolName: "create_reconstruction_workflow", summary: "当前应用未连接重建编排服务。", content: "create_reconstruction_workflow failed: workflow unavailable" };
  }
  const mode = readStringArg(args, "mode");
  if (mode !== "floorplan" && mode !== "photo_simple" && mode !== "photo_complex") {
    return { toolName: "create_reconstruction_workflow", summary: "方案类型必须是 floorplan、photo_simple 或 photo_complex。", content: "create_reconstruction_workflow failed: invalid mode" };
  }
  const assets = readReconstructionAssets(args, context);
  if (!assets.length) return { toolName: "create_reconstruction_workflow", summary: "请至少提供一个资产计划。", content: "create_reconstruction_workflow failed: missing assets" };
  const questions = readReconstructionQuestions(args);
  try {
    const workflow = context.createReconstructionWorkflow({
      mode,
      title: readStringArg(args, "title"),
      summary: readStringArg(args, "summary"),
      assumptions: readStringListArg(args, "assumptions"),
      sourceResourceIds: readStringListArg(args, "source_resource_ids"),
      questions,
      assets
    }) as { id: string; revision: number; status: string; questions: Array<{ required: boolean; selectedOptionId?: string }>; assets: unknown[] };
    const pendingQuestions = workflow.questions.filter((question) => question.required && !question.selectedOptionId).length;
    return {
      toolName: "create_reconstruction_workflow",
      summary: pendingQuestions ? `已创建方案，等待回答 ${pendingQuestions} 个必答问题。` : "已创建方案，等待用户确认生成。",
      content: `重建方案已创建：${workflow.id}（版本 ${workflow.revision}）。\n状态：${workflow.status}\n资产：${workflow.assets.length} 项。${pendingQuestions ? "请让用户在方案卡片中选择必答选项；全部回答后，仍必须点击“按当前方案生成”。" : "请让用户检查方案卡片后点击“按当前方案生成”；在此之前不得调用 generate_3d_asset。"}`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { toolName: "create_reconstruction_workflow", summary: `创建方案失败：${message}`, content: `create_reconstruction_workflow failed: ${message}` };
  }
}

async function executeGenerateDesignPreview(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const name = readStringArg(args, "name");
  const prompt = readStringArg(args, "prompt");
  if (!name || !prompt) {
    return { toolName: "generate_design_preview", summary: "效果图需要名称和中文方案提示词。", content: "generate_design_preview failed: missing name or prompt" };
  }
  try {
    const generated = await generateDesignPreview({
      name,
      prompt,
      outputDir: join(context.outputDir, "previews"),
      settings: context.settings
    });
    return {
      toolName: "generate_design_preview",
      summary: `已生成方案效果图：${name}`,
      content: `方案效果图已生成：${generated.path}\n请让用户确认布局、风格和假设；确认 3D 场景前仍需创建并确认重建计划。`,
      artifactPath: generated.path
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { toolName: "generate_design_preview", summary: `生成方案效果图失败：${message}`, content: `generate_design_preview failed: ${message}` };
  }
}

function executeAnalyzeSpatialReference(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const path = readStringArg(args, "path");
  const task = readStringArg(args, "task") || "识别空间重建信息";
  return executeReadImage({
    path,
    detail: "high",
    question: `${task}。请严格以 JSON 输出：{scene_type,complexity(simple|complex),facts,assumptions,objects:[{id,name,category,bbox:[x,y,width,height],occluded}],unknowns}。bbox 使用 0-1000 千分比坐标；无法可靠定位时 bbox 为 null，绝不能编造。`
  }, context);
}

async function executeExtractObjectReference(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const inputPath = readStringArg(args, "path");
  const name = readStringArg(args, "name");
  const instruction = readStringArg(args, "instruction");
  if (!inputPath || !name || !instruction) return { toolName: "extract_object_reference", summary: "提取物件需要图片、名称和目标描述。", content: "extract_object_reference failed: missing arguments" };
  const sourcePath = resolveReadablePath(inputPath, context);
  assertPathAllowed(sourcePath, context.allowedReadDirs, context.allowedReadFiles ?? [], "extract_object_reference");
  try {
    const generated = await extractObjectReference({ sourcePath, name, instruction, outputDir: join(context.outputDir, "object-references"), settings: context.settings });
    return { toolName: "extract_object_reference", summary: `已生成“${name}”单物件提取图，等待用户确认`, content: `物件提取图：${generated.path}\n下一步创建重建计划时，必须加入“确认 ${name} 提取图正确”的必答选项；只有用户选择确认并点击“按当前方案生成”后，才能将该路径用于图生3D。`, artifactPath: generated.path };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { toolName: "extract_object_reference", summary: `物件提取失败：${message}`, content: `extract_object_reference failed: ${message}` };
  }
}

async function executeCropReferenceObjects(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const inputPath = readStringArg(args, "path");
  const regions = readCropRegions(args);
  if (!inputPath || !regions.length) return { toolName: "crop_reference_objects", summary: "裁图需要图片路径和至少一个边界框。", content: "crop_reference_objects failed: missing path or regions" };
  const sourcePath = resolveReadablePath(inputPath, context);
  assertPathAllowed(sourcePath, context.allowedReadDirs, context.allowedReadFiles ?? [], "crop_reference_objects");
  try {
    const crops = await cropReferenceObjects({ sourcePath, regions, outputDir: join(context.outputDir, "reference-crops") });
    return { toolName: "crop_reference_objects", summary: `已裁出 ${crops.length} 个独立物件参考图`, content: crops.map((crop) => `- ${crop.name}（${crop.id}）：${crop.path}`).join("\n") };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { toolName: "crop_reference_objects", summary: `裁图失败：${message}`, content: `crop_reference_objects failed: ${message}` };
  }
}

function readCropRegions(args: Record<string, unknown>): Array<{ id: string; name: string; box: [number, number, number, number] }> {
  if (!Array.isArray(args.regions)) return [];
  return args.regions.flatMap((item) => {
    const record = readRecord(item);
    const id = record ? readStringArg(record, "id") : "";
    const name = record ? readStringArg(record, "name") : "";
    const box = record?.box;
    const validBox = Array.isArray(box) && box.length === 4 && box.every((value) => typeof value === "number" && Number.isFinite(value)) ? box as [number, number, number, number] : undefined;
    return id && name && validBox ? [{ id, name, box: validBox }] : [];
  });
}

function readReconstructionQuestions(args: Record<string, unknown>): CreateReconstructionWorkflowInput["questions"] {
  const value = args.questions;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = readRecord(item);
    const id = record ? readStringArg(record, "id") : "";
    const prompt = record ? readStringArg(record, "prompt") : "";
    const options = record && Array.isArray(record.options)
      ? record.options.flatMap((option) => {
        const optionRecord = readRecord(option);
        const optionId = optionRecord ? readStringArg(optionRecord, "id") : "";
        const label = optionRecord ? readStringArg(optionRecord, "label") : "";
        return optionId && label ? [{ id: optionId, label, ...(optionRecord && readStringArg(optionRecord, "description") ? { description: readStringArg(optionRecord, "description") } : {}) }] : [];
      })
      : [];
    return id && prompt && options.length >= 2 ? [{ id, prompt, required: record ? readBooleanArg(record, "required", true) : true, options }] : [];
  });
}

function readReconstructionAssets(args: Record<string, unknown>, context: AgentToolExecutionContext): CreateReconstructionWorkflowInput["assets"] {
  const value = args.assets;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = readRecord(item);
    if (!record) return [];
    const id = readStringArg(record, "id");
    const name = readStringArg(record, "name");
    const source = readStringArg(record, "source");
    if (!id || !name || (source !== "library" && source !== "image" && source !== "text")) return [];
    const resourceId = readStringArg(record, "resource_id");
    const libraryAssetId = readStringArg(record, "library_asset_id");
    const imageResource = resourceId ? context.resources?.find((resource) => resource.id === resourceId) : undefined;
    const imagePath = imageResource?.path ?? "";
    if (source === "image") {
      if (!imagePath || imageResource?.kind !== "image") throw new Error("图生资产需要有效的图片 resource_id。 ");
      const resolved = resolveReadablePath(imagePath, context);
      assertPathAllowed(resolved, context.allowedReadDirs, context.allowedReadFiles ?? [], "create_reconstruction_workflow");
      if (!isSupportedImageFile(resolved)) throw new Error("图生资产仅支持 JPG、PNG、WEBP 图片。");
    }
    if (source === "library" && !/^lib_[a-z0-9-]+$/i.test(libraryAssetId)) {
      throw new Error("复用资产必须使用 search_library_assets 返回的 library_asset_id。");
    }
    const placement = readWorkflowPlacement(record);
    const placements = readWorkflowPlacements(record);
    return [{
      id,
      name,
      source,
      quantity: readNumberArg(record, "quantity", 1),
      ...(libraryAssetId ? { componentId: libraryAssetId } : {}),
      ...(resourceId ? { sourceResourceId: resourceId } : {}),
      ...(imagePath ? { imagePath: source === "image" ? resolveReadablePath(imagePath, context) : imagePath } : {}),
      ...(readStringArg(record, "prompt") ? { prompt: readStringArg(record, "prompt") } : {}),
      ...(placement ? { placement } : {}),
      ...(placements ? { placements } : {})
    }];
  });
}

function readWorkflowPlacement(args: Record<string, unknown>): CreateReconstructionWorkflowInput["assets"][number]["placement"] | undefined {
  const position = "position" in args ? readPoint3Arg(args, "position") : undefined;
  const anchorRecord = "anchor" in args ? readRecord(args.anchor) : undefined;
  const anchorElementId = anchorRecord ? readStringArg(anchorRecord, "element_id") : "";
  const anchorSide = anchorRecord ? readStringArg(anchorRecord, "side") : "";
  const anchorDistance = anchorRecord ? readOptionalNumberArg(anchorRecord, "distance") : undefined;
  const anchor = anchorElementId && (anchorSide === "inside" || anchorSide === "outside") && anchorDistance !== undefined && anchorDistance >= 0
    ? { elementId: anchorElementId, side: anchorSide as "inside" | "outside", distance: anchorDistance }
    : undefined;
  const local = "local" in args ? readPoint3Arg(args, "local") : undefined;
  const lookAt = "look_at" in args ? readPoint3Arg(args, "look_at") : undefined;
  const rotationDegrees = "rotation_degrees" in args ? readPoint3Arg(args, "rotation_degrees") : undefined;
  const scale = "scale" in args ? readPoint3Arg(args, "scale") : undefined;
  const footprint = "footprint_meters" in args ? readPoint2Arg(args, "footprint_meters") : undefined;
  const facing = readStringArg(args, "facing");
  if (("position" in args && !position) || ("anchor" in args && !anchor) || (position && anchor) || ("local" in args && (!anchor || !local)) || ("look_at" in args && !lookAt) || ("rotation_degrees" in args && !rotationDegrees) || ("scale" in args && (!scale || scale.some((value) => value <= 0))) || ("footprint_meters" in args && (!footprint || footprint.some((value) => value <= 0))) || (facing && !["north", "south", "east", "west", "wall_inward", "wall_outward"].includes(facing))) {
    throw new Error("资产摆放参数无效：请使用世界 position 或墙体 anchor，语义朝向使用 facing/look_at/rotation_degrees。");
  }
  return position || anchor || scale || footprint || facing || lookAt || rotationDegrees
    ? { ...(position ? { position } : {}), ...(anchor ? { anchor } : {}), ...(local ? { local } : {}), ...(facing ? { facing: facing as "north" | "south" | "east" | "west" | "wall_inward" | "wall_outward" } : {}), ...(lookAt ? { lookAt } : {}), ...(rotationDegrees ? { rotationDegrees } : {}), ...(scale ? { scale } : {}), ...(footprint ? { footprint } : {}) }
    : undefined;
}

function readWorkflowPlacements(args: Record<string, unknown>): ReconstructionWorkflowPlacement[] | undefined {
  const value = args.placements;
  if (!Array.isArray(value)) return undefined;
  const placements = value.map((item) => readWorkflowPlacement(readRecord(item) ?? {}));
  if (placements.some((item) => !item)) throw new Error("placements 中的每项都必须包含有效变换。");
  return placements as ReconstructionWorkflowPlacement[];
}

async function executeAnalyzeReference(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const path = readStringArg(args, "path");
  const profile = readStringArg(args, "profile");
  if (!path || !["document", "image", "spatial"].includes(profile)) return { toolName: "analyze_reference", summary: "需要资料路径和分析类型 document、image 或 spatial。", content: "analyze_reference failed: invalid arguments" };
  if (profile === "document") return renameToolResult(await executeReadFile({ path }, context, "read_file"), "analyze_reference");
  if (profile === "spatial") return renameToolResult(await executeAnalyzeSpatialReference({ path }, context), "analyze_reference");
  return renameToolResult(await executeReadImage({ path }, context), "analyze_reference");
}

async function executeExtractReferenceObject(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const resourceId = readStringArg(args, "resource_id");
  const resource = resourceId ? context.resources?.find((item) => item.id === resourceId) : undefined;
  if (!resource || resource.kind !== "image") return { toolName: "extract_reference_object", summary: "未找到图片资源。", content: "extract_reference_object failed: unknown image resource" };
  const path = resource.path;
  const result = renameToolResult(await executeExtractObjectReference({ path, name: readStringArg(args, "name"), instruction: readStringArg(args, "instruction") }, context), "extract_reference_object");
  return { ...result, parentResourceIds: [resource.id] };
}

async function executeGenerateSingleAsset(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const name = readStringArg(args, "name");
  const source = readStringArg(args, "source");
  const prompt = readStringArg(args, "prompt");
  const resourceId = readStringArg(args, "resource_id");
  if (!name || (source !== "text" && source !== "image")) {
    return { toolName: "generate_3d_asset", summary: "需要名称和 source=text 或 image。", content: "generate_3d_asset failed: invalid arguments" };
  }
  if (source === "text" && (!prompt || resourceId)) {
    return { toolName: "generate_3d_asset", summary: "文生 3D 需要 prompt，且不能传 resource_id。", content: "generate_3d_asset failed: invalid text source" };
  }
  const resource = resourceId ? context.resources?.find((item) => item.id === resourceId) : undefined;
  if (source === "image" && (!resource || resource.kind !== "image" || prompt)) {
    return { toolName: "generate_3d_asset", summary: "图生 3D 需要单物件图片 resource_id，且不能传 prompt。", content: "generate_3d_asset failed: invalid image source" };
  }
  try {
    const generated = await generateHunyuanGlb({
      name,
      ...(source === "text" ? { prompt } : { imageBase64: readFileSync(resource!.path).toString("base64") }),
      generateType: "low_poly"
    }, join(context.outputDir, "assets"));
    const component = importGlobalComponent(context.componentLibraryRootDir ?? context.rootDir, generated.path, {
      name,
      description: source === "text" ? prompt : "由用户确认的单物件参考图生成的低模资产",
      category: readStringArg(args, "category") || "未分类",
      tags: ["agent-generated", "low-poly", ...readStringListArg(args, "tags")]
    });
    return {
      toolName: "generate_3d_asset",
      summary: `已生成并入库单实体“${component.name}”。`,
      content: `已生成单实体 GLB 并自动入库。\nlibrary_asset_id: ${component.id}\n下一步可用 view_resources(library_asset_ids) 查看预览，或用 place_library_assets 实例化到场景。`,
      artifactPath: generated.path,
      ...(resource ? { parentResourceIds: [resource.id] } : {})
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { toolName: "generate_3d_asset", summary: `生成单实体失败：${message}`, content: `generate_3d_asset failed: ${message}` };
  }
}

async function executeViewResources(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const resourceIds = readStringListArg(args, "resource_ids");
  const libraryAssetIds = readStringListArg(args, "library_asset_ids");
  const purpose = readStringArg(args, "purpose");
  const query = readStringArg(args, "query");
  if ((!resourceIds.length && !libraryAssetIds.length) || !purpose) return { toolName: "view_resources", summary: "需要 resource_ids 或 library_asset_ids，以及 purpose。", content: "view_resources failed: missing arguments" };
  const resources = new Map((context.resources ?? []).map((resource) => [resource.id, resource]));
  const selected = resourceIds.map((id) => resources.get(id));
  const missing = resourceIds.filter((_, index) => !selected[index]);
  if (missing.length) return { toolName: "view_resources", summary: `未找到会话资源：${missing.join("、")}`, content: "view_resources failed: unknown resource" };
  const libraryAssets = libraryAssetIds.map((id) => findGlobalComponent(context.componentLibraryRootDir ?? context.rootDir, id));
  const missingLibraryAssets = libraryAssetIds.filter((_, index) => !libraryAssets[index]);
  if (missingLibraryAssets.length) return { toolName: "view_resources", summary: `未找到资产库资源：${missingLibraryAssets.join("、")}`, content: "view_resources failed: unknown library asset" };
  const imageResources = selected.filter((resource): resource is SessionResource => Boolean(resource && resource.kind === "image"));
  const modelPreviewPaths = selected.flatMap((resource) => resource?.kind === "model3d" && typeof resource.metadata.preview_path === "string" ? [resource.metadata.preview_path] : []);
  const libraryPreviewPaths = libraryAssets.flatMap((asset) => asset?.previewFile ? [asset.previewFile] : []);
  if (imageResources.length + modelPreviewPaths.length + libraryPreviewPaths.length > 4) return { toolName: "view_resources", summary: "一次最多查看 4 张图片或模型预览，请缩小范围。", content: "view_resources failed: too many visuals" };
  const textParts: string[] = [`查看目的：${purpose}`];
  for (const resource of selected) {
    if (!resource) continue;
    textParts.push(`- resource_id: ${resource.id}；名称：${resource.name}；类型：${resource.kind}；来源：${resource.source}`);
    if (["document", "table", "database", "text"].includes(resource.kind)) {
      const result = await executeReadFile({ path: resource.path }, context, "read_file");
      textParts.push(query ? extractRelevantResourceText(result.content, query) : result.content);
    } else if (resource.kind === "model3d") {
      textParts.push(`  3D 元数据：${JSON.stringify(resource.metadata)}。${typeof resource.metadata.preview_path === "string" ? "已附带缓存预览图。" : "当前没有缓存预览图。"}`);
    }
  }
  for (const asset of libraryAssets) {
    if (!asset) continue;
    textParts.push(`- library_asset_id: ${asset.id}；名称：${asset.name}；类别：${asset.category ?? "未分类"}；预览：${asset.previewFile ? "已附带" : "无"}`);
  }
  return {
    toolName: "view_resources",
    summary: `已查看 ${selected.length + libraryAssets.length} 个资源`,
    content: textParts.join("\n"),
    ...((imageResources.length || modelPreviewPaths.length || libraryPreviewPaths.length) ? { imagePaths: [...imageResources.map((resource) => resource.path), ...modelPreviewPaths, ...libraryPreviewPaths] } : {})
  };
}

function extractRelevantResourceText(content: string, query: string): string {
  const normalizedQuery = query.toLocaleLowerCase();
  const lines = content.split(/\r?\n/);
  const matchingIndexes = lines.flatMap((line, index) => line.toLocaleLowerCase().includes(normalizedQuery) ? [index] : []);
  if (!matchingIndexes.length) return `  未在已抽取文本中找到“${query}”。`;
  const included = new Set<number>();
  for (const index of matchingIndexes) {
    for (let offset = -1; offset <= 1; offset += 1) {
      if (index + offset >= 0 && index + offset < lines.length) included.add(index + offset);
    }
  }
  return `  与“${query}”相关的文本：\n${[...included].sort((left, right) => left - right).map((index) => lines[index]).join("\n")}`;
}

function executeSearchResources(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const query = readStringArg(args, "query").toLowerCase();
  const limit = Math.min(Math.max(Math.floor(readNumberArg(args, "limit", 8)), 1), 20);
  const kinds = new Set(readStringListArg(args, "kinds"));
  const resources = (context.resources ?? [])
    .filter((resource) => !kinds.size || kinds.has(resource.kind))
    .filter((resource) => !query || `${resource.id} ${resource.name} ${resource.kind} ${resource.source}`.toLowerCase().includes(query))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
  return {
    toolName: "search_resources",
    summary: resources.length ? `找到 ${resources.length} 个会话资源` : "未找到匹配会话资源",
    content: resources.length
      ? resources.map((resource) => `- resource_id: ${resource.id}\n  名称：${resource.name}\n  类型：${resource.kind}\n  来源：${resource.source}\n  状态：${resource.status}${resource.confirmed ? "（已确认）" : ""}${resource.parentResourceIds.length ? `\n  父资源：${resource.parentResourceIds.join("、")}` : ""}`).join("\n")
      : "没有匹配资源。"
  };
}

async function executeApplyScenePlan(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const expectedRevision = readOptionalNumberArg(args, "expected_revision");
  if (expectedRevision !== undefined && context.getSceneSnapshot?.().revision !== expectedRevision) {
    return { toolName: "apply_scene_plan", summary: "场景版本已变化，请重新读取场景后规划。", content: "apply_scene_plan failed: stale scene revision" };
  }
  const commands = Array.isArray(args.commands) ? args.commands : [];
  if (!commands.length) return { toolName: "apply_scene_plan", summary: "场景计划不能为空。", content: "apply_scene_plan failed: missing commands" };
  const results: AgentToolExecutionResult[] = [];
  for (const item of commands) {
    const record = readRecord(item);
    const operation = record ? readStringArg(record, "operation") : "";
    const input = record ? readRecord(record.input) : undefined;
    const legacyName = sceneOperationMap[operation];
    if (!legacyName || !input) return { toolName: "apply_scene_plan", summary: `不支持场景操作：${operation || "unknown"}`, content: `apply_scene_plan failed: unsupported operation ${operation}` };
    const result = await executeAgentToolCall({ id: `scene_plan_${operation}`, type: "function", function: { name: legacyName, arguments: JSON.stringify(input) } }, context);
    if (result.content.includes(" failed:")) return { toolName: "apply_scene_plan", summary: `场景计划中断：${result.summary}`, content: result.content };
    results.push(result);
  }
  return { toolName: "apply_scene_plan", summary: `已应用 ${results.length} 项场景操作`, content: results.map((result) => result.content).join("\n\n") };
}

function executeUpdateScene(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  return executeApplyScenePlan({ expected_revision: args.expected_revision, commands: [{ operation: args.operation, input: args.input }] }, context).then((result) => {
    if (args.operation === "asset.update" && result.content.includes(" failed:")) {
      const id = readStringArg(readRecord(args.input) ?? {}, "id");
      return sceneAssetNodeNotFoundFailure("update_scene", id);
    }
    return renameToolResult(result, "update_scene");
  });
}

function executeAdjustSceneObject(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const reference = readStringArg(args, "reference");
  if (!reference) return { toolName: "adjust_scene_object", summary: "缺少场景物件引用。", content: "adjust_scene_object failed: missing reference" };
  const expectedRevision = readOptionalNumberArg(args, "expected_revision");
  const snapshot = context.getSceneSnapshot?.();
  if (!snapshot) return { toolName: "adjust_scene_object", summary: "当前应用未连接场景服务。", content: "adjust_scene_object failed: scene unavailable" };
  if (expectedRevision !== undefined && snapshot.revision !== expectedRevision) return { toolName: "adjust_scene_object", summary: "场景版本已变化，请重新读取场景后再调整物件。", content: "adjust_scene_object failed: stale scene revision" };
  const matches = Object.values(snapshot.nodes).filter((node) => node.type === "asset" && node.name === reference);
  if (!matches.length) return { toolName: "adjust_scene_object", summary: `未找到场景物件“${reference}”。`, content: `adjust_scene_object failed: unknown scene reference\n请先调用 get_scene，使用其中列出的唯一显示名。` };
  if (matches.length > 1) return { toolName: "adjust_scene_object", summary: `场景引用“${reference}”不唯一。`, content: `adjust_scene_object failed: ambiguous scene reference\n请先调用 get_scene 并使用唯一显示名。` };
  const position = "position" in args ? readPoint3Arg(args, "position") : undefined;
  const rotation = "rotation" in args ? readPoint3Arg(args, "rotation") : undefined;
  const scale = "scale" in args ? readPoint3Arg(args, "scale") : undefined;
  if (("position" in args && !position) || ("rotation" in args && !rotation) || ("scale" in args && (!scale || scale.some((value) => value <= 0)))) {
    return { toolName: "adjust_scene_object", summary: "位置、旋转和缩放必须有效，缩放必须大于 0。", content: "adjust_scene_object failed: invalid transform" };
  }
  const result = executeSceneTool("update_asset", { type: "asset.update", id: matches[0].id, ...(position ? { position } : {}), ...(rotation ? { rotation } : {}), ...(scale ? { scale } : {}) }, context);
  if (result.content.includes(" failed:")) return { ...result, toolName: "adjust_scene_object", content: result.content.replace("update_asset", "adjust_scene_object") };
  return { toolName: "adjust_scene_object", summary: `已调整场景物件：${reference}`, content: `已调整场景物件：${reference}\n场景版本：${context.getSceneSnapshot?.().revision}` };
}

function executeUpdateSceneObjects(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const target = readStringArg(args, "scene_object_id") || readStringArg(args, "reference");
  if (!target) return { toolName: "update_scene_object", summary: "需要 scene_object_id 或 reference。", content: "update_scene_object failed: missing target" };
  const snapshot = context.getSceneSnapshot?.();
  if (!snapshot) return { toolName: "update_scene_object", summary: "当前应用未连接场景服务。", content: "update_scene_object failed: scene unavailable" };
  const expectedRevision = readOptionalNumberArg(args, "expected_revision");
  if (expectedRevision !== undefined && snapshot.revision !== expectedRevision) return staleSceneRevisionFailure("update_scene_object", snapshot);
  const object = Object.values(snapshot.nodes).find((node) => node.type === "asset" && (node.id === target || node.name === target));
  if (!object || object.type !== "asset") return { toolName: "update_scene_object", summary: `未找到场景物件：${target}`, content: "update_scene_object failed: unknown scene object" };
  const action = readStringArg(args, "action") || "update";
  if (action === "delete") {
    const result = executeSceneTool("delete_node", { type: "node.delete", id: object.id }, context);
    return result.content.includes(" failed:") ? { ...result, toolName: "update_scene_object" } : { toolName: "update_scene_object", summary: `已删除场景物件：${object.name}`, content: `已删除场景物件：${object.name}` };
  }
  const placement = resolveAssetPlacement(args, snapshot, object.position, object.rotation);
  if ("error" in placement) return { toolName: "update_scene_object", summary: placement.error, content: `update_scene_object failed: ${placement.error}` };
  const scale = "scale" in args ? readPoint3Arg(args, "scale") : object.scale;
  const footprint = "footprint_meters" in args ? readPoint2Arg(args, "footprint_meters") : object.footprint;
  if (("scale" in args && (!scale || scale.some((value) => value <= 0))) || ("footprint_meters" in args && (!footprint || footprint.some((value) => value <= 0)))) {
    return { toolName: "update_scene_object", summary: "缩放或占地尺寸无效。", content: "update_scene_object failed: invalid placement dimensions" };
  }
  const collision = footprint && scale && placement.position ? findAssetPlacementCollision(snapshot, placement.position, placement.rotation ?? object.rotation, footprint, scale, object.id) : undefined;
  if (collision) return { toolName: "update_scene_object", summary: `“${object.name}”会与“${collision.name}”占地碰撞。`, content: `update_scene_object failed: footprint collision with ${collision.name} (${collision.id})` };
  const architectureCollision = footprint && scale && placement.position ? findArchitecturePlacementCollision(snapshot, placement.position, placement.rotation ?? object.rotation, footprint, scale) : undefined;
  if (architectureCollision) return { toolName: "update_scene_object", summary: `“${object.name}”会与${architectureCollision.wall.name}穿模 ${formatMeters(architectureCollision.overlap)}。`, content: `update_scene_object failed: wall collision with ${architectureCollision.wall.id}` };
  const result = executeSceneTool("update_asset", {
    type: "asset.update",
    id: object.id,
    ...(placement.position ? { position: placement.position } : {}),
    ...(placement.rotation ? { rotation: placement.rotation } : {}),
    ...(scale ? { scale } : {}),
    ...(footprint ? { footprint } : {})
  }, context);
  if (result.content.includes(" failed:")) return { ...result, toolName: "update_scene_object", content: result.content.replace("update_asset", "update_scene_object") };
  const currentSnapshot = context.getSceneSnapshot?.() ?? snapshot;
  return { toolName: "update_scene_object", summary: `已调整场景物件：${object.name}`, content: `已调整场景物件：${object.name}\n${formatPlacementDiagnostics(currentSnapshot, placement.position ?? object.position, placement.rotation ?? object.rotation, footprint, scale ?? object.scale)}\n场景版本：${currentSnapshot.revision}` };
}

function staleSceneRevisionFailure(toolName: BuiltinToolName, snapshot: SceneSnapshot): AgentToolExecutionResult {
  return {
    toolName,
    summary: `场景版本已变化；可重试的最新版本为 ${snapshot.revision}。`,
    content: `${toolName} failed: stale scene revision\nexpected_revision 已过期；current_revision: ${snapshot.revision}\n如确认原操作仍适用，可直接携带 expected_revision=${snapshot.revision} 重试；若操作依赖已有物件或建筑关系，请先 inspect_scene。`
  };
}

type AssetPlacementResolution = {
  position?: [number, number, number];
  rotation?: [number, number, number];
} | { error: string };

/** Resolves the public furniture-placement contract into the scene's world transform. */
function resolveAssetPlacement(
  args: Record<string, unknown>,
  snapshot: SceneSnapshot,
  fallbackPosition?: [number, number, number],
  fallbackRotation?: [number, number, number]
): AssetPlacementResolution {
  const hasPosition = "position" in args;
  const hasAnchor = "anchor" in args;
  if (hasPosition && hasAnchor) return { error: "position 与 anchor 只能二选一。" };
  if ("local" in args && !hasAnchor) return { error: "local 只能与 anchor 一起使用。" };

  let position = fallbackPosition;
  let anchorWall: SceneWallNode | undefined;
  let anchorNormal: [number, number] | undefined;
  if (hasPosition) {
    position = readPoint3Arg(args, "position");
    if (!position) return { error: "position 必须是有效的世界坐标 [x,y,z]（米）。" };
  } else if (hasAnchor) {
    const anchor = readRecord(args.anchor);
    const wallReference = anchor ? readStringArg(anchor, "element_id") : "";
    const side = anchor ? readStringArg(anchor, "side") : "";
    const distance = anchor ? readOptionalNumberArg(anchor, "distance") : undefined;
    const local = "local" in args ? readPoint3Arg(args, "local") : [0, 0, 0] as [number, number, number];
    if (!wallReference) return { error: "anchor.element_id 必须是墙体 ID 或唯一显示名。" };
    if (!isAnchorSide(side)) return { error: "anchor.side 必须为 room_interior、outside 或兼容值 inside。" };
    if (distance === undefined || distance < 0) return { error: "anchor.distance 必须是大于等于 0 的米制距离。" };
    if (!local) return { error: "local 必须是 [沿墙偏移, 高度偏移, 额外离墙偏移]（米）。" };
    const matches = Object.values(snapshot.nodes).filter((node): node is SceneWallNode => node.type === "wall" && (node.id === wallReference || node.name === wallReference));
    if (!matches.length) return { error: `未找到锚定墙体：${wallReference}` };
    if (matches.length > 1) return { error: `锚定墙体“${wallReference}”不唯一，请传 element_id。` };
    anchorWall = matches[0];
    const deltaX = anchorWall.end[0] - anchorWall.start[0];
    const deltaZ = anchorWall.end[1] - anchorWall.start[1];
    const length = Math.hypot(deltaX, deltaZ);
    if (length < 0.01) return { error: `锚定墙体“${anchorWall.name}”长度无效。` };
    const tangent: [number, number] = [deltaX / length, deltaZ / length];
    const leftNormal: [number, number] = [-tangent[1], tangent[0]];
    const interiorNormal = findRoomInteriorNormal(snapshot, anchorWall, leftNormal);
    if (!interiorNormal) return { error: `无法从房间、楼板或封闭墙体推断“${anchorWall.name}”的室内侧；请补充房间/楼板轮廓或改用世界 position。` };
    anchorNormal = side === "outside" ? [-interiorNormal[0], -interiorNormal[1]] : interiorNormal;
    const midX = (anchorWall.start[0] + anchorWall.end[0]) / 2;
    const midZ = (anchorWall.start[1] + anchorWall.end[1]) / 2;
    const normalDistance = anchorWall.thickness / 2 + distance + local[2];
    position = [
      midX + tangent[0] * local[0] + anchorNormal[0] * normalDistance,
      local[1],
      midZ + tangent[1] * local[0] + anchorNormal[1] * normalDistance
    ];
  } else if (!position) {
    return { error: "请提供世界 position，或 anchor 锚定墙体。" };
  }

  const lookAt = "look_at" in args ? readPoint3Arg(args, "look_at") : undefined;
  if ("look_at" in args && !lookAt) return { error: "look_at 必须是有效的世界坐标 [x,y,z]。" };
  const facing = readStringArg(args, "facing");
  const explicitRotation = "rotation_degrees" in args ? readRotationDegreesArg(args, "rotation_degrees") : undefined;
  if ("rotation_degrees" in args && !explicitRotation) return { error: "rotation_degrees 必须是 [pitch,yaw,roll] 角度。" };
  let rotation = fallbackRotation;
  if (lookAt) {
    rotation = withSemanticYaw(fallbackRotation, Math.atan2(lookAt[0] - position[0], lookAt[2] - position[2]));
  } else if (facing) {
    const yaw = resolveFacingYaw(facing, anchorNormal);
    if (yaw === undefined) return { error: "facing 必须为 north、south、east、west、wall_inward 或 wall_outward；后两者需要 anchor。" };
    rotation = withSemanticYaw(fallbackRotation, yaw);
  } else if (explicitRotation) {
    rotation = explicitRotation;
  }
  return { position, ...(rotation ? { rotation } : {}) };
}

function isAnchorSide(side: string): side is "inside" | "outside" | "room_interior" | "against_wall" {
  return side === "inside" || side === "outside" || side === "room_interior" || side === "against_wall";
}

/** Resolves the semantic interior side from room geometry, never wall drawing order. */
function findRoomInteriorNormal(snapshot: SceneSnapshot, wall: SceneWallNode, leftNormal: [number, number]): [number, number] | undefined {
  const midpoint: [number, number] = [(wall.start[0] + wall.end[0]) / 2, (wall.start[1] + wall.end[1]) / 2];
  const probeDistance = wall.thickness / 2 + 0.01;
  const polygons = Object.values(snapshot.nodes)
    .filter((node): node is Extract<typeof node, { polygon: ScenePoint[] }> => (node.type === "zone" || node.type === "slab") && node.polygon.length >= 3)
    .map((node) => node.polygon);
  const isInside = (normal: [number, number]) => polygons.some((polygon) => isPointInsidePolygon([midpoint[0] + normal[0] * probeDistance, midpoint[1] + normal[1] * probeDistance], polygon));
  const leftInside = isInside(leftNormal);
  const rightNormal: [number, number] = [-leftNormal[0], -leftNormal[1]];
  const rightInside = isInside(rightNormal);
  if (leftInside !== rightInside) return leftInside ? leftNormal : rightNormal;

  const wallPoints = Object.values(snapshot.nodes).filter((node): node is SceneWallNode => node.type === "wall").flatMap((node) => [node.start, node.end]);
  if (wallPoints.length < 4) return undefined;
  const center: [number, number] = [wallPoints.reduce((total, point) => total + point[0], 0) / wallPoints.length, wallPoints.reduce((total, point) => total + point[1], 0) / wallPoints.length];
  const towardCenter: [number, number] = [center[0] - midpoint[0], center[1] - midpoint[1]];
  const side = towardCenter[0] * leftNormal[0] + towardCenter[1] * leftNormal[1];
  return Math.abs(side) < 0.01 ? undefined : side > 0 ? leftNormal : rightNormal;
}

function isPointInsidePolygon(point: [number, number], polygon: ScenePoint[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [currentX, currentZ] = polygon[current];
    const [previousX, previousZ] = polygon[previous];
    const crosses = (currentZ > point[1]) !== (previousZ > point[1]) && point[0] < (previousX - currentX) * (point[1] - currentZ) / (previousZ - currentZ) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function withSemanticYaw(fallbackRotation: [number, number, number] | undefined, yaw: number): [number, number, number] {
  return [fallbackRotation?.[0] ?? 0, yaw, fallbackRotation?.[2] ?? 0];
}

function resolveFacingYaw(facing: string, anchorNormal?: [number, number]): number | undefined {
  if (facing === "south") return 0;
  if (facing === "east") return Math.PI / 2;
  if (facing === "north") return Math.PI;
  if (facing === "west") return -Math.PI / 2;
  if (!anchorNormal) return undefined;
  if (facing === "wall_inward") return Math.atan2(anchorNormal[0], anchorNormal[1]);
  if (facing === "wall_outward") return Math.atan2(-anchorNormal[0], -anchorNormal[1]);
  return undefined;
}

/** Rejects overlapping known furniture footprints without pretending unknown mesh bounds are precise. */
function findAssetPlacementCollision(
  snapshot: SceneSnapshot | undefined,
  position: [number, number, number],
  rotation: [number, number, number],
  footprint: [number, number],
  scale: [number, number, number],
  excludeId?: string
): SceneAssetNode | undefined {
  if (!snapshot) return undefined;
  const candidate = getFootprintCorners(position, rotation[1], footprint, scale);
  for (const node of Object.values(snapshot.nodes)) {
    if (node.type !== "asset" || node.id === excludeId || !node.footprint) continue;
    const existing = getFootprintCorners(node.position, node.rotation[1], node.footprint, node.scale);
    if (orientedRectanglesOverlap(candidate, existing)) return node;
  }
  return undefined;
}

function findArchitecturePlacementCollision(
  snapshot: SceneSnapshot | undefined,
  position: [number, number, number],
  rotation: [number, number, number],
  footprint: [number, number],
  scale: [number, number, number]
): { wall: SceneWallNode; overlap: number } | undefined {
  if (!snapshot) return undefined;
  const candidate = getFootprintCorners(position, rotation[1], footprint, scale, 0);
  for (const node of Object.values(snapshot.nodes)) {
    if (node.type !== "wall") continue;
    const deltaX = node.end[0] - node.start[0];
    const deltaZ = node.end[1] - node.start[1];
    const length = Math.hypot(deltaX, deltaZ);
    if (length < 0.01) continue;
    const yaw = Math.atan2(-deltaZ, deltaX);
    const wallCorners = getFootprintCorners([(node.start[0] + node.end[0]) / 2, 0, (node.start[1] + node.end[1]) / 2], yaw, [length, node.thickness], [1, 1, 1], 0);
    if (!orientedRectanglesOverlap(candidate, wallCorners)) continue;
    const wallDistance = distanceToWallCenterline(position, node);
    const extent = projectedFootprintExtent(rotation[1], footprint, scale, [-deltaZ / length, deltaX / length]);
    return { wall: node, overlap: Math.max(0, node.thickness / 2 + extent - wallDistance) };
  }
  return undefined;
}

function formatPlacementDiagnostics(
  snapshot: SceneSnapshot,
  position: [number, number, number],
  rotation: [number, number, number],
  footprint?: [number, number],
  scale: [number, number, number] = [1, 1, 1]
): string {
  const nearestWall = findNearestWall(snapshot, position);
  const roomState = isPointInRoom(snapshot, [position[0], position[2]]) ? "是" : "否或未定义房间边界";
  const wallDistance = nearestWall ? Math.max(0, nearestWall.distance - nearestWall.wall.thickness / 2) : undefined;
  const architectureCollision = footprint ? findArchitecturePlacementCollision(snapshot, position, rotation, footprint, scale) : undefined;
  return [
    `  最近墙体：${nearestWall ? `${nearestWall.wall.name}，距墙面 ${formatMeters(wallDistance ?? 0)}` : "无"}`,
    `  位于房间/楼板范围内：${roomState}`,
    footprint ? `  建筑穿模校验：${architectureCollision ? `与${architectureCollision.wall.name}重叠 ${formatMeters(architectureCollision.overlap)}` : "未发现墙体穿模"}` : "  建筑穿模校验：未提供 footprint_meters，无法校验模型边界"
  ].join("\n");
}

function isPointInRoom(snapshot: SceneSnapshot, point: [number, number]): boolean {
  const zones = Object.values(snapshot.nodes).filter((node) => node.type === "zone");
  const polygons = zones.length ? zones.map((node) => node.polygon) : Object.values(snapshot.nodes).filter((node) => node.type === "slab").map((node) => node.polygon);
  return polygons.some((polygon) => isPointInsidePolygon(point, polygon));
}

function distanceToWallCenterline(position: [number, number, number], wall: SceneWallNode): number {
  const deltaX = wall.end[0] - wall.start[0];
  const deltaZ = wall.end[1] - wall.start[1];
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  if (lengthSquared < 0.0001) return Infinity;
  const project = Math.max(0, Math.min(1, ((position[0] - wall.start[0]) * deltaX + (position[2] - wall.start[1]) * deltaZ) / lengthSquared));
  return Math.hypot(position[0] - (wall.start[0] + deltaX * project), position[2] - (wall.start[1] + deltaZ * project));
}

function projectedFootprintExtent(yaw: number, footprint: [number, number], scale: [number, number, number], normal: [number, number]): number {
  const widthVector: [number, number] = [Math.cos(yaw), -Math.sin(yaw)];
  const depthVector: [number, number] = [Math.sin(yaw), Math.cos(yaw)];
  return Math.abs(widthVector[0] * normal[0] + widthVector[1] * normal[1]) * footprint[0] * scale[0] / 2
    + Math.abs(depthVector[0] * normal[0] + depthVector[1] * normal[1]) * footprint[1] * scale[2] / 2;
}

function getFootprintCorners(position: [number, number, number], yaw: number, footprint: [number, number], scale: [number, number, number], padding = 0.02): Array<[number, number]> {
  const halfWidth = Math.max(0, footprint[0] * scale[0] / 2) + padding;
  const halfDepth = Math.max(0, footprint[1] * scale[2] / 2) + padding;
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  return [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]].map(([x, z]) => [position[0] + x * cosine + z * sine, position[2] - x * sine + z * cosine] as [number, number]);
}

function orientedRectanglesOverlap(first: Array<[number, number]>, second: Array<[number, number]>): boolean {
  const axes = [...getRectangleAxes(first), ...getRectangleAxes(second)];
  return axes.every((axis) => {
    const firstRange = projectCorners(first, axis);
    const secondRange = projectCorners(second, axis);
    return firstRange[0] < secondRange[1] && secondRange[0] < firstRange[1];
  });
}

function getRectangleAxes(corners: Array<[number, number]>): Array<[number, number]> {
  return [0, 1].map((index) => {
    const start = corners[index];
    const end = corners[(index + 1) % corners.length];
    const deltaX = end[0] - start[0];
    const deltaZ = end[1] - start[1];
    const length = Math.hypot(deltaX, deltaZ);
    return length ? [-deltaZ / length, deltaX / length] as [number, number] : [0, 0] as [number, number];
  });
}

function projectCorners(corners: Array<[number, number]>, axis: [number, number]): [number, number] {
  const values = corners.map((corner) => corner[0] * axis[0] + corner[1] * axis[1]);
  return [Math.min(...values), Math.max(...values)];
}

function formatSemanticAssetPlacement(snapshot: SceneSnapshot, asset: SceneAssetNode): string {
  const nearestWall = findNearestWall(snapshot, asset.position);
  const distance = nearestWall ? `${nearestWall.wall.name} ${formatMeters(Math.max(0, nearestWall.distance - nearestWall.wall.thickness / 2))}（${nearestWall.side === "room_interior" ? "室内侧" : "室外侧"}）` : "无墙体可参照";
  const elevation = Math.abs(asset.position[1]) < 0.005 ? "0m（落地）" : `${formatMeters(asset.position[1])}`;
  return [
    `- scene_object_id: ${asset.id}`,
    `  显示名：${asset.name}`,
    `  ${nearestWall ? `距墙：${distance}` : `距墙：${distance}`}`,
    `  离地：${elevation}`,
    `  面朝：${formatYawAsFacing(asset.rotation[1])}`,
    `  世界位置：[${asset.position.map(formatCoordinate).join(", ")}]`,
    `  rotation_degrees：[${asset.rotation.map((value) => radiansToDegrees(value)).join(", ")}]`,
    `  scale：[${asset.scale.join(", ")}]`,
    formatPlacementDiagnostics(snapshot, asset.position, asset.rotation, asset.footprint, asset.scale)
  ].join("\n");
}

function findNearestWall(snapshot: SceneSnapshot, position: [number, number, number]): { wall: SceneWallNode; distance: number; side: "room_interior" | "outside" } | undefined {
  let nearest: { wall: SceneWallNode; distance: number; side: "room_interior" | "outside" } | undefined;
  for (const wall of Object.values(snapshot.nodes)) {
    if (wall.type !== "wall") continue;
    const deltaX = wall.end[0] - wall.start[0];
    const deltaZ = wall.end[1] - wall.start[1];
    const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (lengthSquared < 0.0001) continue;
    const project = Math.max(0, Math.min(1, ((position[0] - wall.start[0]) * deltaX + (position[2] - wall.start[1]) * deltaZ) / lengthSquared));
    const projectedX = wall.start[0] + deltaX * project;
    const projectedZ = wall.start[1] + deltaZ * project;
    const offsetX = position[0] - projectedX;
    const offsetZ = position[2] - projectedZ;
    const distance = Math.hypot(offsetX, offsetZ);
    if (nearest && distance >= nearest.distance) continue;
    const leftNormal: [number, number] = [-deltaZ / Math.sqrt(lengthSquared), deltaX / Math.sqrt(lengthSquared)];
    const interiorNormal = findRoomInteriorNormal(snapshot, wall, leftNormal);
    nearest = { wall, distance, side: interiorNormal && offsetX * interiorNormal[0] + offsetZ * interiorNormal[1] >= 0 ? "room_interior" : "outside" };
  }
  return nearest;
}

function formatYawAsFacing(yaw: number): "north" | "south" | "east" | "west" {
  const directions: Array<["north" | "south" | "east" | "west", number]> = [["south", 0], ["east", Math.PI / 2], ["north", Math.PI], ["west", -Math.PI / 2]];
  const normalizedYaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  return directions.reduce((closest, candidate) => Math.abs(Math.atan2(Math.sin(normalizedYaw - candidate[1]), Math.cos(normalizedYaw - candidate[1]))) < Math.abs(Math.atan2(Math.sin(normalizedYaw - closest[1]), Math.cos(normalizedYaw - closest[1]))) ? candidate : closest)[0];
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function formatMeters(value: number): string {
  return `${formatCoordinate(value)}m`;
}

async function executeBuildArchitecture(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const expectedRevision = readOptionalNumberArg(args, "expected_revision");
  if (expectedRevision === undefined) return { toolName: "create_architecture_elements", summary: "缺少场景版本。", content: "create_architecture_elements failed: missing expected_revision" };
  if (context.getSceneSnapshot?.().revision !== expectedRevision) return { toolName: "create_architecture_elements", summary: "场景版本已变化，请重新读取场景。", content: "create_architecture_elements failed: stale scene revision" };
  const elements = Array.isArray(args.elements) ? args.elements : [];
  if (!elements.length) return { toolName: "create_architecture_elements", summary: "请至少提供一个建筑元素。", content: "create_architecture_elements failed: missing elements" };
  const createToolByKind: Record<string, BuiltinToolName> = { wall: "create_wall", slab: "create_slab", ceiling: "create_ceiling", column: "create_column", zone: "create_zone", stair: "create_stair", fence: "create_fence", door: "create_door", window: "create_window" };
  const created: AgentToolExecutionResult[] = [];
  for (const rawElement of elements) {
    const element = readRecord(rawElement);
    const kind = element ? readStringArg(element, "kind") : "";
    const legacyTool = createToolByKind[kind];
    const properties = element ? readRecord(element.properties) : undefined;
    if (!legacyTool || !properties) return { toolName: "create_architecture_elements", summary: `建筑元素无效：${kind || "unknown"}`, content: "create_architecture_elements failed: invalid element" };
    const reference = readStringArg(element ?? {}, "reference");
    const input = { ...properties, ...(reference ? { name: reference } : {}) } as Record<string, unknown>;
    if (kind === "door" || kind === "window") {
      const wallReference = readStringArg(input, "wall_reference");
      const wall = wallReference ? Object.values(context.getSceneSnapshot?.().nodes ?? {}).find((node) => node.type === "wall" && (node.id === wallReference || node.name === wallReference)) : undefined;
      if (!wall) return { toolName: "create_architecture_elements", summary: `未找到门窗所属墙体：${wallReference || "（缺失）"}`, content: "create_architecture_elements failed: unknown wall reference" };
      input.wall_id = wall.id;
      delete input.wall_reference;
    }
    const result = executeArchitectureCreateCommand(legacyTool, input, context);
    if (result.content.includes(" failed:")) return { toolName: "create_architecture_elements", summary: `创建中断：${result.summary}`, content: result.content };
    created.push(result);
  }
  return { toolName: "create_architecture_elements", summary: `已创建 ${created.length} 个建筑元素`, content: created.map((result) => result.content).join("\n\n") };
}

async function executeCreateArchitectureElement(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const kind = readStringArg(args, "kind");
  const properties = readRecord(args.properties);
  if (!kind || !properties) return { toolName: "create_architecture_element", summary: "需要 kind 和 properties。", content: "create_architecture_element failed: missing arguments" };
  const result = await executeBuildArchitecture({ expected_revision: args.expected_revision, elements: [{ kind, reference: readStringArg(args, "reference"), properties }] }, context);
  return renameToolResult(result, "create_architecture_element");
}

function executeArchitectureCreateCommand(toolName: BuiltinToolName, args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  switch (toolName) {
    case "create_wall": return executeCreateWall(args, context);
    case "create_slab": return executeCreateSlab(args, context);
    case "create_ceiling": return executeCreateCeiling(args, context);
    case "create_column": return executeCreateColumn(args, context);
    case "create_zone": return executeCreateZone(args, context);
    case "create_stair": return executeCreateStair(args, context);
    case "create_fence": return executeCreateFence(args, context);
    case "create_door": return executeCreateDoor(args, context);
    case "create_window": return executeCreateWindow(args, context);
    default: return { toolName, summary: "不支持该建筑创建。", content: `${toolName} failed: unsupported create` };
  }
}

function executeUpdateArchitecture(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const expectedRevision = readOptionalNumberArg(args, "expected_revision");
  const target = readStringArg(args, "element_id") || readStringArg(args, "reference");
  const snapshot = context.getSceneSnapshot?.();
  if (expectedRevision === undefined || !target || !snapshot) return { toolName: "update_architecture_elements", summary: "需要场景版本和建筑元素标识。", content: "update_architecture_elements failed: missing arguments" };
  if (snapshot.revision !== expectedRevision) return { toolName: "update_architecture_elements", summary: "场景版本已变化，请重新读取场景。", content: "update_architecture_elements failed: stale scene revision" };
  const element = Object.values(snapshot.nodes).find((node) => node.id === target || node.name === target);
  if (!element || ["site", "building", "level", "asset"].includes(element.type)) return { toolName: "update_architecture_elements", summary: `未找到建筑元素：${target}`, content: "update_architecture_elements failed: unknown element" };
  if (readStringArg(args, "action") === "delete") return renameToolResult(executeDeleteNode({ id: element.id }, context), "update_architecture_elements");
  const changes = readRecord(args.changes);
  if (!changes) return { toolName: "update_architecture_elements", summary: "缺少建筑元素修改内容。", content: "update_architecture_elements failed: missing changes" };
  const toolByType: Partial<Record<typeof element.type, BuiltinToolName>> = { wall: "update_wall", slab: "update_slab", ceiling: "update_ceiling", column: "update_column", zone: "update_zone", stair: "update_stair", fence: "update_fence", door: "update_door", window: "update_window" };
  const toolName = toolByType[element.type];
  if (!toolName) return { toolName: "update_architecture_elements", summary: "该建筑元素暂不支持修改。", content: "update_architecture_elements failed: unsupported element" };
  return renameToolResult(executeAgentToolCallSync(toolName, { ...changes, id: element.id }, context), "update_architecture_elements");
}

function executeUpdateArchitectureElement(args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  const kind = readStringArg(args, "kind");
  const target = readStringArg(args, "element_id") || readStringArg(args, "reference");
  const snapshot = context.getSceneSnapshot?.();
  const element = snapshot && target ? Object.values(snapshot.nodes).find((node) => node.id === target || node.name === target) : undefined;
  if (!kind || !element || element.type !== kind) return { toolName: "update_architecture_element", summary: "kind 必须与目标建筑元素一致。", content: "update_architecture_element failed: invalid target kind" };
  const result = executeUpdateArchitecture({ expected_revision: args.expected_revision, element_id: readStringArg(args, "element_id"), reference: readStringArg(args, "reference"), action: readStringArg(args, "action"), changes: args.changes }, context);
  return renameToolResult(result, "update_architecture_element");
}

function executeAgentToolCallSync(toolName: BuiltinToolName, args: Record<string, unknown>, context: AgentToolExecutionContext): AgentToolExecutionResult {
  switch (toolName) {
    case "update_wall": return executeUpdateWall(args, context);
    case "update_slab": return executeUpdateSlab(args, context);
    case "update_ceiling": return executeUpdateCeiling(args, context);
    case "update_column": return executeUpdateColumn(args, context);
    case "update_zone": return executeUpdateZone(args, context);
    case "update_stair": return executeUpdateStair(args, context);
    case "update_fence": return executeUpdateFence(args, context);
    case "update_door": return executeUpdateDoor(args, context);
    case "update_window": return executeUpdateWindow(args, context);
    default: return { toolName, summary: "不支持该建筑更新。", content: `${toolName} failed: unsupported update` };
  }
}

function renameToolResult(result: AgentToolExecutionResult, toolName: BuiltinToolName): AgentToolExecutionResult {
  return { ...result, toolName };
}

const sceneOperationMap: Record<string, BuiltinToolName> = {
  "wall.create": "create_wall", "wall.update": "update_wall", "slab.create": "create_slab", "slab.update": "update_slab",
  "ceiling.create": "create_ceiling", "ceiling.update": "update_ceiling", "column.create": "create_column", "column.update": "update_column",
  "zone.create": "create_zone", "zone.update": "update_zone", "stair.create": "create_stair", "stair.update": "update_stair",
  "fence.create": "create_fence", "fence.update": "update_fence", "door.create": "create_door", "door.update": "update_door",
  "window.create": "create_window", "window.update": "update_window", "asset.update": "update_asset", "node.delete": "delete_node"
};

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
  if (!result.accepted) {
    if (command.type === "asset.update") return sceneAssetNodeNotFoundFailure("update_asset", command.id);
    return sceneToolFailure(toolName, result.message);
  }

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

function sceneAssetNodeNotFoundFailure(toolName: "update_asset" | "update_scene", id: string): AgentToolExecutionResult {
  const shownId = id || "（缺失）";
  const message = `未找到场景资产节点：${shownId}。该值可能是 component_id 或 GLB 文件路径，而不是 asset_id。`;
  return {
    toolName,
    summary: message,
    content: `${toolName} failed: ${message}\n恢复步骤：先调用 get_scene 确认当前场景物件；若尚未放置，调用 place_scene_objects。后续使用其返回的场景引用调用 adjust_scene_object。不得复用本次失败的 ID。`
  };
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
    timeout: toMilliseconds(resolveVisionTimeoutSeconds(context.settings))
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
    timeout: toMilliseconds(resolveScriptTimeoutSeconds()),
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

function readPoint2Arg(args: Record<string, unknown>, key: string): [number, number] | undefined {
  const value = args[key];
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number" && Number.isFinite(item)) ? [value[0], value[1]] : undefined;
}

function readRelativePositionArg(args: Record<string, unknown>, key: string): [number, number, number] | undefined {
  const value = readPoint3Arg(args, key);
  return value && value.every((coordinate) => coordinate >= 0 && coordinate <= 1) ? value : undefined;
}

function readRotationDegreesArg(args: Record<string, unknown>, key: string): [number, number, number] | undefined {
  const value = readPoint3Arg(args, key);
  return value ? [toRadians(value[0]), toRadians(value[1]), toRadians(value[2])] : undefined;
}

function radiansToDegrees(value: number): number {
  return Math.round((value * 180 / Math.PI) * 100) / 100;
}

function toRadians(value: number): number {
  return value * Math.PI / 180;
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
  return settings.openai.apiKeyConfigured ? process.env.HY3_API_KEY : undefined;
}

async function executeSendArtifact(args: Record<string, unknown>, context: AgentToolExecutionContext): Promise<AgentToolExecutionResult> {
  const resourceId = readStringArg(args, "resource_id");
  const resource = resourceId ? context.resources?.find((item) => item.id === resourceId) : undefined;
  if (!resource) return { toolName: "send_file", summary: "未找到待发送资源。", content: "send_file failed: unknown resource_id" };
  if (!existsSync(resource.path)) {
    return { toolName: "send_file", summary: `待发送文件不存在：${resource.name}`, content: "send_file failed: resource file missing" };
  }
  return {
    toolName: "send_file",
    summary: `正在发送 ${resource.name}`,
    content: `send_file prepared: resource_id: ${resource.id}`,
    sendResourceId: resource.id
  };
}

function resolveVisionBaseUrl(settings: AppSettings): string {
  return settings.openai.baseUrl;
}

function resolveVisionModel(settings: AppSettings): string {
  return settings.openai.chatModel;
}

function resolveVisionTimeoutSeconds(settings: AppSettings): number {
  return settings.openai.requestTimeoutSeconds;
}

function resolveScriptTimeoutSeconds(): number {
  return readConfiguredTimeoutSeconds("AGENT_SCRIPT_TIMEOUT_S", 15, 1, 600);
}

function readConfiguredTimeoutSeconds(key: string, fallback: number, minimum: number, maximum: number): number {
  const seconds = Number(process.env[key]?.trim());
  const value = Number.isFinite(seconds) ? Math.trunc(seconds) : fallback;
  return Math.min(Math.max(value, minimum), maximum);
}

function toMilliseconds(seconds: number): number {
  return Math.max(1, Math.trunc(seconds)) * 1_000;
}

function looksDestructiveCommand(command: string): boolean {
  return /\b(rm\s+-rf|del\s+\/|rmdir\s+\/s|remove-item\b|format\b|shutdown\b|restart-computer\b|git\s+reset\s+--hard)\b/i.test(command);
}

const emptyObjectSchema = { type: "object", properties: {}, additionalProperties: false } as const;
const SCENE_PREVIEW_VIEWS = ["current", "perspective", "top", "front", "right", "left", "back", "bottom"] as const;
const scenePreviewSchema = { type: "object", properties: { view: { type: "string", enum: SCENE_PREVIEW_VIEWS, description: "视角：current 保持当前视角；perspective 为自由透视；其余为正交方向预设。" } }, additionalProperties: false } as const;
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
const placeComponentAssetSchema = { type: "object", properties: { component_id: { type: "string" }, parent_id: { type: "string" }, position: point3Schema, rotation: point3Schema, scale: point3Schema }, required: ["component_id"], additionalProperties: false } as const;
const reconstructionAnchorSchema = { type: "object", properties: { element_id: { type: "string" }, side: { type: "string", enum: ["inside", "outside"] }, distance: { type: "number", minimum: 0 } }, required: ["element_id", "side", "distance"], additionalProperties: false } as const;
const reconstructionFootprintSchema = { type: "array", items: { type: "number", exclusiveMinimum: 0 }, minItems: 2, maxItems: 2 } as const;
const reconstructionPlacementSchema = { type: "object", properties: { position: point3Schema, anchor: reconstructionAnchorSchema, local: point3Schema, facing: { type: "string", enum: ["north", "south", "east", "west", "wall_inward", "wall_outward"] }, look_at: point3Schema, rotation_degrees: point3Schema, scale: point3Schema, footprint_meters: reconstructionFootprintSchema }, anyOf: [{ required: ["position"] }, { required: ["anchor"] }], additionalProperties: false } as const;
const reconstructionAssetSchema = { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, source: { type: "string", enum: ["library", "image", "text"] }, quantity: { type: "integer", minimum: 1 }, library_asset_id: { type: "string" }, resource_id: { type: "string", description: "图生 3D 使用的图片资源 ID。" }, prompt: { type: "string" }, position: point3Schema, anchor: reconstructionAnchorSchema, local: point3Schema, facing: { type: "string", enum: ["north", "south", "east", "west", "wall_inward", "wall_outward"] }, look_at: point3Schema, rotation_degrees: point3Schema, scale: point3Schema, footprint_meters: reconstructionFootprintSchema, placements: { type: "array", items: reconstructionPlacementSchema } }, required: ["id", "name", "source"], additionalProperties: false } as const;
const reconstructionQuestionSchema = { type: "object", properties: { id: { type: "string" }, prompt: { type: "string" }, required: { type: "boolean" }, options: { type: "array", minItems: 2, items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, description: { type: "string" } }, required: ["id", "label"], additionalProperties: false } } }, required: ["id", "prompt", "options"], additionalProperties: false } as const;
const reconstructionWorkflowSchema = { type: "object", properties: { mode: { type: "string", enum: ["floorplan", "photo_simple", "photo_complex"] }, title: { type: "string" }, summary: { type: "string" }, assumptions: { type: "array", items: { type: "string" } }, source_resource_ids: { type: "array", items: { type: "string" } }, questions: { type: "array", items: reconstructionQuestionSchema }, assets: { type: "array", minItems: 1, items: reconstructionAssetSchema } }, required: ["mode", "title", "summary", "assets"], additionalProperties: false } as const;
const designPreviewSchema = { type: "object", properties: { name: { type: "string" }, prompt: { type: "string", description: "中文效果图提示词，必须明确已知事实与假设。" } }, required: ["name", "prompt"], additionalProperties: false } as const;
const extractReferenceObjectSchema = { type: "object", properties: { resource_id: { type: "string", description: "待提取的图片资源 ID。" }, name: { type: "string" }, instruction: { type: "string" } }, required: ["resource_id", "name", "instruction"], additionalProperties: false } as const;
const searchResourcesSchema = { type: "object", properties: { query: { type: "string" }, kinds: { type: "array", items: { type: "string", enum: ["image", "document", "table", "database", "model3d", "text", "archive", "other"] } }, limit: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false } as const;
const viewResourcesSchema = { type: "object", properties: { resource_ids: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } }, library_asset_ids: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" }, description: "search_library_assets 返回的 library_asset_id。" }, purpose: { type: "string" }, query: { type: "string", description: "可选关键字；对可读文档、表格与文本仅返回命中行及相邻上下文。" } }, required: ["purpose"], anyOf: [{ required: ["resource_ids"] }, { required: ["library_asset_ids"] }], additionalProperties: false } as const;
const sendArtifactSchema = { type: "object", properties: { resource_id: { type: "string", description: "待发送会话资源的 ID。" } }, required: ["resource_id"], additionalProperties: false } as const;
const worldPositionSchema = { type: "array", description: "世界坐标 [x,y,z]，单位米；X 向东/右、Y 向上、Z 向南/前。", items: { type: "number" }, minItems: 3, maxItems: 3 } as const;
const footprintMetersSchema = { type: "array", description: "模型落地占地 [宽(X),深(Z)]，单位米。提供后工具会与已有已知占地的物件做碰撞校验。", items: { type: "number", exclusiveMinimum: 0 }, minItems: 2, maxItems: 2 } as const;
const localPlacementSchema = { type: "array", description: "相对 anchor 的 [沿墙偏移, 高度偏移, 额外离墙偏移]，单位米。", items: { type: "number" }, minItems: 3, maxItems: 3 } as const;
const rotationDegreesSchema = { type: "array", description: "欧拉角 [pitch,yaw,roll]，单位度；仅在 facing 和 look_at 都不适用时使用。", items: { type: "number" }, minItems: 3, maxItems: 3 } as const;
const wallAnchorSchema = { type: "object", description: "锚定墙体的室内/室外侧。room_interior（inside 兼容别名）根据房间或楼板轮廓自动确定室内侧，不依赖墙体绘制方向；against_wall 等同 room_interior。distance 是从墙面起算的垂直间距。", properties: { element_id: { type: "string", description: "墙体 element_id，或唯一墙体显示名。" }, side: { type: "string", enum: ["room_interior", "against_wall", "inside", "outside"] }, distance: { type: "number", minimum: 0, description: "垂直离墙面距离，单位米。" } }, required: ["element_id", "side", "distance"], additionalProperties: false } as const;
const assetPlacementProperties = { position: worldPositionSchema, anchor: wallAnchorSchema, local: localPlacementSchema, facing: { type: "string", enum: ["north", "south", "east", "west", "wall_inward", "wall_outward"], description: "资产规范正前方为 +Z；wall_inward/outward 只能与 anchor 一起使用。" }, look_at: { ...worldPositionSchema, description: "使资产正前方看向的世界坐标 [x,y,z]；朝向优先级为 look_at、facing、rotation_degrees。" }, rotation_degrees: rotationDegreesSchema } as const;
const placeLibraryAssetItemSchema = { type: "object", properties: { library_asset_id: { type: "string" }, reference: { type: "string" }, ...assetPlacementProperties, scale: point3Schema, footprint_meters: footprintMetersSchema }, required: ["library_asset_id"], anyOf: [{ required: ["position"] }, { required: ["anchor"] }], additionalProperties: false } as const;
const placeLibraryAssetsSchema = { type: "object", properties: { items: { type: "array", minItems: 1, items: placeLibraryAssetItemSchema } }, required: ["items"], additionalProperties: false } as const;
const previewLibraryAssetPlacementSchema = { type: "object", properties: { items: { type: "array", minItems: 1, items: placeLibraryAssetItemSchema } }, required: ["items"], additionalProperties: false } as const;
const placeLibraryAssetSchema = { type: "object", properties: { expected_revision: { type: "integer", minimum: 0 }, ...placeLibraryAssetItemSchema.properties }, required: ["expected_revision", "library_asset_id"], anyOf: placeLibraryAssetItemSchema.anyOf, additionalProperties: false } as const;
const updateSceneObjectsSchema = { type: "object", properties: { expected_revision: { type: "integer", minimum: 0 }, scene_object_id: { type: "string" }, reference: { type: "string" }, action: { type: "string", enum: ["update", "delete"] }, ...assetPlacementProperties, scale: point3Schema, footprint_meters: footprintMetersSchema }, required: ["expected_revision"], additionalProperties: false } as const;
const architectureElementSchema = { type: "object", properties: { kind: { type: "string", enum: ["wall", "slab", "ceiling", "column", "zone", "stair", "fence", "door", "window"] }, reference: { type: "string" }, properties: { type: "object", additionalProperties: true } }, required: ["kind", "properties"], additionalProperties: false } as const;
const buildArchitectureSchema = { type: "object", properties: { expected_revision: { type: "integer", minimum: 0 }, elements: { type: "array", minItems: 1, items: architectureElementSchema } }, required: ["expected_revision", "elements"], additionalProperties: false } as const;
const createArchitectureElementSchema = { type: "object", properties: { expected_revision: { type: "integer", minimum: 0 }, ...architectureElementSchema.properties }, required: ["expected_revision", "kind", "properties"], additionalProperties: false } as const;
const updateArchitectureSchema = { type: "object", properties: { expected_revision: { type: "integer", minimum: 0 }, element_id: { type: "string" }, reference: { type: "string" }, action: { type: "string", enum: ["update", "delete"] }, changes: { type: "object", additionalProperties: true } }, required: ["expected_revision"], additionalProperties: false } as const;
const updateArchitectureElementSchema = { type: "object", properties: { expected_revision: { type: "integer", minimum: 0 }, kind: architectureElementSchema.properties.kind, element_id: { type: "string" }, reference: { type: "string" }, action: { type: "string", enum: ["update", "delete"] }, changes: { type: "object", additionalProperties: true } }, required: ["expected_revision", "kind"], anyOf: [{ required: ["element_id"] }, { required: ["reference"] }], additionalProperties: false } as const;
const sceneObjectPlacementSchema = { type: "object", properties: { query: { type: "string", description: "待放置物件的中文名称或检索词。" }, reference: { type: "string", description: "可选的唯一场景显示名；未提供时自动编号，例如现代沙发_2。" }, position: point3Schema, rotation: point3Schema, scale: point3Schema }, required: ["query"], additionalProperties: false } as const;
const placeSceneObjectsSchema = { type: "object", properties: { items: { type: "array", minItems: 1, items: sceneObjectPlacementSchema } }, required: ["items"], additionalProperties: false } as const;
const adjustSceneObjectSchema = { type: "object", properties: { expected_revision: { type: "integer", minimum: 0 }, reference: { type: "string" }, position: point3Schema, rotation: point3Schema, scale: point3Schema }, required: ["expected_revision", "reference"], additionalProperties: false } as const;
const componentLibrarySearchSchema = { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 } }, required: ["query"], additionalProperties: false } as const;
const analyzeReferenceSchema = { type: "object", properties: { path: { type: "string" }, profile: { type: "string", enum: ["document", "image", "spatial"] } }, required: ["path", "profile"], additionalProperties: false } as const;
const scenePlanCommandSchema = { type: "object", properties: { operation: { type: "string", enum: ["wall.create", "wall.update", "slab.create", "slab.update", "ceiling.create", "ceiling.update", "column.create", "column.update", "zone.create", "zone.update", "stair.create", "stair.update", "fence.create", "fence.update", "door.create", "door.update", "window.create", "window.update", "asset.update", "node.delete"] }, input: { type: "object", additionalProperties: true } }, required: ["operation", "input"], additionalProperties: false } as const;
const scenePlanSchema = { type: "object", properties: { expected_revision: { type: "integer", minimum: 0 }, commands: { type: "array", minItems: 1, items: scenePlanCommandSchema } }, required: ["expected_revision", "commands"], additionalProperties: false } as const;
const sceneUpdateSchema = { type: "object", properties: { expected_revision: { type: "integer", minimum: 0 }, operation: scenePlanCommandSchema.properties.operation, input: { type: "object", additionalProperties: true } }, required: ["expected_revision", "operation", "input"], additionalProperties: false } as const;
const agentSceneOperationSchema = { type: "string", enum: ["wall.create", "wall.update", "slab.create", "slab.update", "ceiling.create", "ceiling.update", "column.create", "column.update", "zone.create", "zone.update", "stair.create", "stair.update", "fence.create", "fence.update", "door.create", "door.update", "window.create", "window.update", "node.delete"] } as const;
const agentScenePlanCommandSchema = { type: "object", properties: { operation: agentSceneOperationSchema, input: { type: "object", additionalProperties: true } }, required: ["operation", "input"], additionalProperties: false } as const;
const agentScenePlanSchema = { type: "object", properties: { expected_revision: { type: "integer", minimum: 0 }, commands: { type: "array", minItems: 1, items: agentScenePlanCommandSchema } }, required: ["expected_revision", "commands"], additionalProperties: false } as const;
const agentSceneUpdateSchema = { type: "object", properties: { expected_revision: { type: "integer", minimum: 0 }, operation: agentSceneOperationSchema, input: { type: "object", additionalProperties: true } }, required: ["expected_revision", "operation", "input"], additionalProperties: false } as const;
const spatialReferenceSchema = { type: "object", properties: { path: { type: "string" }, task: { type: "string" } }, required: ["path"], additionalProperties: false } as const;
const objectExtractionSchema = { type: "object", properties: { path: { type: "string" }, name: { type: "string" }, instruction: { type: "string" } }, required: ["path", "name", "instruction"], additionalProperties: false } as const;
const cropReferenceSchema = { type: "object", properties: { path: { type: "string" }, regions: { type: "array", minItems: 1, items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, box: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 } }, required: ["id", "name", "box"], additionalProperties: false } } }, required: ["path", "regions"], additionalProperties: false } as const;
const generate3dAssetSchema = { type: "object", properties: { name: { type: "string", description: "一个边界干净、可摆放资产的名称，例如“现代三人位沙发”“站立人物”或“人物坐在单椅上”；不得使用入口标识、重建设计、用途、房间、墙体或松散套装名称。" }, source: { type: "string", enum: ["text", "image"] }, prompt: { type: "string", description: "source=text 时必填：只用中文描述资产的形状、颜色、材质、风格及完整互动；所有组成部分必须完整包含在资产内，不得包含位置、朝向、用途、截断物体、地面、背景、空间、建筑或工作流。" }, resource_id: { type: "string", description: "source=image 时必填：已确认且只包含一个边界完整、可独立摆放资产的资源 ID。" }, category: { type: "string" }, tags: { type: "array", items: { type: "string" }, maxItems: 12 } }, required: ["name", "source"], additionalProperties: false } as const;
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
