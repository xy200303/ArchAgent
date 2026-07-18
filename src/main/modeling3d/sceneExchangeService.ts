/** Owns scene file dialogs and safe project-local mesh asset storage. */
import electron from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { SceneAssetPayload, SceneCommandInput, SceneCommandResult, SceneExchangeFormat, SceneExportTarget, SceneImportResult, SceneSnapshot } from "../../shared/modeling3d/sceneContracts";

const { dialog } = electron;
const MESH_FORMATS = ["glb", "gltf", "obj", "stl"] as const;

export function createSceneExchangeService(options: {
  createId: (prefix: string) => string;
  getActiveProjectPath: () => string | undefined;
  getSnapshot: () => SceneSnapshot;
  replaceSnapshot: (snapshot: SceneSnapshot) => SceneSnapshot;
  executeSceneCommand: (command: Extract<SceneCommandInput, { type: "asset.create" }>) => SceneCommandResult;
}) {
  async function importFromDialog(): Promise<SceneImportResult | undefined> {
    const projectPath = requireProjectPath(options.getActiveProjectPath());
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "ArchAgent 场景", extensions: ["json"] },
        { name: "三维模型", extensions: [...MESH_FORMATS] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) return undefined;
    const sourcePath = result.filePaths[0];
    const extension = extname(sourcePath).slice(1).toLowerCase();
    if (extension === "json") {
      const snapshot = readSceneSnapshot(sourcePath);
      return { kind: "scene", name: basename(sourcePath), snapshot: options.replaceSnapshot(snapshot) };
    }
    if (!isMeshFormat(extension)) throw new Error("仅支持导入 GLB、GLTF、OBJ、STL 或 ArchAgent 场景 JSON 文件。");

    const assetId = `asset_${options.createId("mesh")}`;
    const assetsDir = join(projectPath, ".agent", "assets");
    if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
    const destinationName = `${assetId}.${extension}`;
    copyFileSync(sourcePath, join(assetsDir, destinationName));
    const parentId = findDefaultLevelId(options.getSnapshot());
    const command = options.executeSceneCommand({ type: "asset.create", id: assetId, parentId, name: basename(sourcePath, extname(sourcePath)), format: extension, sourcePath: join("assets", destinationName) });
    if (!command.accepted) throw new Error(command.message ?? "导入模型失败。");
    return { kind: "asset", name: basename(sourcePath), snapshot: command.snapshot };
  }

  async function selectExportTarget(): Promise<SceneExportTarget | undefined> {
    const projectPath = requireProjectPath(options.getActiveProjectPath());
    const result = await dialog.showSaveDialog({
      defaultPath: join(projectPath, "output", "architecture.glb"),
      filters: [
        { name: "GLB 二进制 glTF", extensions: ["glb"] },
        { name: "glTF", extensions: ["gltf"] },
        { name: "Wavefront OBJ", extensions: ["obj"] },
        { name: "STL", extensions: ["stl"] },
        { name: "ArchAgent 场景", extensions: ["json"] }
      ]
    });
    if (result.canceled || !result.filePath) return undefined;
    const extension = extname(result.filePath).slice(1).toLowerCase();
    if (extension === "json") return { format: "scene-json", path: result.filePath };
    if (!isMeshFormat(extension)) throw new Error("请选择 GLB、GLTF、OBJ、STL 或 JSON 文件扩展名。");
    return { format: extension, path: result.filePath };
  }

  function saveExport(target: SceneExportTarget, dataBase64?: string): string {
    if (target.format === "scene-json") {
      writeFileSync(target.path, JSON.stringify(options.getSnapshot(), null, 2), "utf8");
      return target.path;
    }
    if (!dataBase64) throw new Error("三维模型导出数据为空。");
    writeFileSync(target.path, Buffer.from(dataBase64, "base64"));
    return target.path;
  }

  function loadAsset(assetId: string): SceneAssetPayload {
    const projectPath = requireProjectPath(options.getActiveProjectPath());
    const asset = options.getSnapshot().nodes[assetId];
    if (!asset || asset.type !== "asset") throw new Error("未找到参考模型。");
    const filePath = resolve(projectPath, ".agent", asset.sourcePath);
    const assetsPath = resolve(projectPath, ".agent", "assets");
    if (!filePath.startsWith(`${assetsPath}\\`) && filePath !== assetsPath) throw new Error("参考模型路径无效。");
    if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new Error("参考模型文件不存在。");
    return { id: asset.id, format: asset.format, dataBase64: readFileSync(filePath).toString("base64") };
  }
  /** Copies one library asset into the active project and creates its scene node atomically. */
  function placeGlobalComponent(
    component: { name: string; file: string },
    placement: Partial<Pick<Extract<SceneCommandInput, { type: "asset.create" }>, "parentId" | "position" | "rotation" | "scale">> = {}
  ): SceneCommandResult {
    const projectPath = requireProjectPath(options.getActiveProjectPath());
    if (!existsSync(component.file)) throw new Error("全局构件模型文件不存在。");
    const id = `asset_${options.createId("library")}`;
    const format = getMeshFormat(component.file);
    const assetsDir = join(projectPath, ".agent", "assets");
    if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
    const destinationName = `${id}.${format}`;
    copyFileSync(component.file, join(assetsDir, destinationName));
    return options.executeSceneCommand({
      type: "asset.create",
      id,
      parentId: placement.parentId ?? findDefaultLevelId(options.getSnapshot()),
      name: component.name,
      format,
      sourcePath: join("assets", destinationName),
      ...(placement.position ? { position: placement.position } : {}),
      ...(placement.rotation ? { rotation: placement.rotation } : {}),
      ...(placement.scale ? { scale: placement.scale } : {})
    });
  }

  return { importFromDialog, selectExportTarget, saveExport, loadAsset, placeGlobalComponent };
}

function requireProjectPath(projectPath: string | undefined): string {
  if (!projectPath) throw new Error("请先打开或创建项目，再导入或导出三维场景。");
  return projectPath;
}

function isMeshFormat(value: string): value is typeof MESH_FORMATS[number] {
  return MESH_FORMATS.includes(value as typeof MESH_FORMATS[number]);
}

function getMeshFormat(filePath: string): typeof MESH_FORMATS[number] {
  const extension = extname(filePath).slice(1).toLowerCase();
  if (!isMeshFormat(extension)) throw new Error("构件库模型格式无效。");
  return extension;
}

function findDefaultLevelId(snapshot: SceneSnapshot): string {
  const level = Object.values(snapshot.nodes).find((node) => node.type === "level");
  if (!level) throw new Error("当前场景没有可用于放置参考模型的楼层。");
  return level.id;
}

function readSceneSnapshot(path: string): SceneSnapshot {
  let value: unknown;
  try { value = JSON.parse(readFileSync(path, "utf8")); } catch { throw new Error("场景 JSON 无法解析。"); }
  if (!isSceneSnapshot(value)) throw new Error("该 JSON 不是有效的 ArchAgent 场景文件。");
  return value;
}

function isSceneSnapshot(value: unknown): value is SceneSnapshot {
  if (!value || typeof value !== "object") return false;
  const scene = value as Partial<SceneSnapshot>;
  return Number.isInteger(scene.revision) && Array.isArray(scene.rootNodeIds) && Boolean(scene.nodes) && typeof scene.nodes === "object";
}
