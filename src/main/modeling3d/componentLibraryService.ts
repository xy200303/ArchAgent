/** Reads the global user component library without exposing arbitrary filesystem paths. */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import type { GlobalComponentSummary } from "../../shared/types";
import type { SceneAssetPayload, SceneAssetNode } from "../../shared/modeling3d/sceneContracts";

export interface GlobalComponentRecord extends GlobalComponentSummary {
  id: string;
  name: string;
  file: string;
  source: "hunyuan-3d" | "external";
  model: string;
  prompt?: string;
  previewFile?: string;
  createdAt: string;
}

export interface ImportComponentInput {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  placementRule?: string;
}

export function findGlobalComponent(rootDir: string, id: string): GlobalComponentRecord | undefined {
  return listGlobalComponents(rootDir).find((component) => component.id === id);
}

export function updateGlobalComponent(rootDir: string, id: string, input: Pick<GlobalComponentSummary, "name" | "description" | "category" | "tags" | "placementRule">): GlobalComponentRecord {
  const component = findGlobalComponent(rootDir, id);
  if (!component) throw new Error("未找到全局构件。");
  const next = { ...component, ...input, tags: input.tags.map((tag) => tag.trim()).filter(Boolean) };
  writeFileSync(`${component.file}.semantic.json`, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Removes one registered personal-library asset and its owned metadata files. */
export function deleteGlobalComponent(rootDir: string, id: string): void {
  const component = findGlobalComponent(rootDir, id);
  if (!component) throw new Error("未找到全局构件。");

  const directory = getComponentLibraryDirectory(rootDir);
  const files = new Set([
    component.file,
    `${component.file}.semantic.json`,
    component.previewFile,
    getDefaultPreviewFile(component.file)
  ].filter((file): file is string => Boolean(file)));

  for (const file of files) {
    if (!isWithinDirectory(file, directory)) throw new Error("构件文件不在个人构建库目录中。");
    if (existsSync(file)) unlinkSync(file);
  }
}

/** Copies a project-local mesh into the global personal library with stable semantic metadata. */
export function importGlobalComponent(rootDir: string, sourcePath: string, input: ImportComponentInput = {}): GlobalComponentRecord {
  const sourceFile = resolve(sourcePath);
  const extension = extname(sourceFile).toLowerCase();
  if (!SUPPORTED_COMPONENT_EXTENSIONS.has(extension)) {
    throw new Error("构建库仅支持导入 GLB、GLTF、OBJ 或 STL 模型。");
  }
  if (!existsSync(sourceFile) || !statSync(sourceFile).isFile()) {
    throw new Error("待导入的模型文件不存在。");
  }

  const sourceMetadata = readComponentRecord(`${sourceFile}.semantic.json`)[0];
  const directory = getComponentLibraryDirectory(rootDir);
  mkdirSync(directory, { recursive: true });
  const destination = getAvailableComponentPath(directory, basename(sourceFile));
  copyFileSync(sourceFile, destination);
  const previewFile = copyPreviewFile(sourceMetadata?.previewFile, destination);

  const name = input.name?.trim() || sourceMetadata?.name || basename(sourceFile, extension);
  const record: GlobalComponentRecord = {
    id: destination,
    name,
    file: destination,
    source: sourceMetadata?.source ?? "external",
    model: sourceMetadata?.model ?? "external",
    prompt: sourceMetadata?.prompt,
    previewFile,
    description: input.description?.trim() || sourceMetadata?.description,
    category: input.category?.trim() || sourceMetadata?.category || "未分类",
    tags: input.tags?.map((tag) => tag.trim()).filter(Boolean) ?? sourceMetadata?.tags ?? [],
    placementRule: input.placementRule?.trim() || sourceMetadata?.placementRule,
    previewAvailable: Boolean(previewFile),
    createdAt: new Date().toISOString()
  };
  writeFileSync(`${destination}.semantic.json`, JSON.stringify(record, null, 2), "utf8");
  return record;
}

/** Returns model bytes only for an asset already registered in the personal library. */
export function loadGlobalComponentAsset(rootDir: string, id: string): SceneAssetPayload {
  const component = findGlobalComponent(rootDir, id);
  if (!component || !existsSync(component.file)) throw new Error("未找到构建库模型文件。");
  const format = getComponentFormat(component.file);
  return { id: component.id, format, dataBase64: readFileSync(component.file).toString("base64") };
}

/** Reads a cached preview only for a component registered in the personal library. */
export function loadGlobalComponentPreview(rootDir: string, id: string): string | undefined {
  const component = findGlobalComponent(rootDir, id);
  const previewFile = component && resolvePreviewFile(component);
  if (!previewFile) return undefined;
  return `data:${getPreviewMimeType(previewFile)};base64,${readFileSync(previewFile).toString("base64")}`;
}

/** Stores renderer-generated PNG previews alongside the global component model. */
export function saveGlobalComponentPreview(rootDir: string, id: string, dataBase64: string): void {
  const component = findGlobalComponent(rootDir, id);
  if (!component) throw new Error("未找到全局构件。");
  const image = Buffer.from(dataBase64, "base64");
  if (!isPng(image) || image.byteLength > 2 * 1024 * 1024) throw new Error("构件预览图必须是 2MB 以内的 PNG 图片。");
  writeFileSync(getDefaultPreviewFile(component.file), image);
}

export function listGlobalComponents(rootDir: string, legacyProjectPath?: string): GlobalComponentRecord[] {
  const directory = getComponentLibraryDirectory(rootDir);
  migrateLegacyProjectComponents(directory, legacyProjectPath);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".semantic.json"))
    .flatMap((name) => readComponentRecord(join(directory, name)))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function getComponentLibraryDirectory(rootDir: string): string {
  return join(rootDir, "data", "component-library", "assets");
}

function isWithinDirectory(filePath: string, directory: string): boolean {
  const relativePath = relative(resolve(directory), resolve(filePath));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

const SUPPORTED_COMPONENT_EXTENSIONS = new Set([".glb", ".gltf", ".obj", ".stl"]);

function getComponentFormat(filePath: string): SceneAssetNode["format"] {
  const extension = extname(filePath).slice(1).toLowerCase();
  if (extension === "glb" || extension === "gltf" || extension === "obj" || extension === "stl") return extension;
  throw new Error("构建库模型格式无效。");
}

function getAvailableComponentPath(directory: string, sourceName: string): string {
  const extension = extname(sourceName);
  const stem = basename(sourceName, extension) || "imported-model";
  let sequence = 1;
  let candidate = join(directory, sourceName);
  while (existsSync(candidate) || existsSync(`${candidate}.semantic.json`)) {
    sequence += 1;
    candidate = join(directory, `${stem}-${sequence}${extension}`);
  }
  return candidate;
}

/**
 * Imports assets created before the library was made application-global.
 * Source files stay in the project so existing chat artifacts remain valid.
 */
function migrateLegacyProjectComponents(globalDirectory: string, legacyProjectPath?: string): void {
  if (!legacyProjectPath) return;
  const legacyDirectory = getComponentLibraryDirectory(legacyProjectPath);
  if (resolve(legacyDirectory) === resolve(globalDirectory) || !existsSync(legacyDirectory)) return;

  for (const manifestName of readdirSync(legacyDirectory).filter((name) => name.endsWith(".semantic.json"))) {
    try {
      const sourceManifestPath = join(legacyDirectory, manifestName);
      const source = readComponentRecord(sourceManifestPath)[0];
      if (!source || !existsSync(source.file)) continue;

      const targetFile = join(globalDirectory, basename(source.file));
      const targetManifestPath = `${targetFile}.semantic.json`;
      if (existsSync(targetFile) || existsSync(targetManifestPath)) continue;

      mkdirSync(globalDirectory, { recursive: true });
      copyFileSync(source.file, targetFile);
      const previewFile = copyPreviewFile(source.previewFile, targetFile);
      writeFileSync(targetManifestPath, JSON.stringify({ ...source, file: targetFile, previewFile, previewAvailable: Boolean(previewFile) }, null, 2), "utf8");
    } catch {
      // A malformed legacy record must not make the personal library unavailable.
    }
  }
}

function readComponentRecord(path: string): GlobalComponentRecord[] {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!value || typeof value !== "object") return [];
    const record = value as Partial<GlobalComponentRecord>;
    if (typeof record.name !== "string" || typeof record.file !== "string" || typeof record.model !== "string" || typeof record.createdAt !== "string") return [];
    const declaredPreview = typeof record.previewFile === "string" ? record.previewFile : undefined;
    const previewFile = declaredPreview && existsSync(declaredPreview)
      ? declaredPreview
      : existsSync(getDefaultPreviewFile(record.file)) ? getDefaultPreviewFile(record.file) : undefined;
    return [{ id: record.file, name: record.name, file: record.file, source: record.source === "external" ? "external" : "hunyuan-3d", model: record.model, prompt: typeof record.prompt === "string" ? record.prompt : undefined, description: typeof record.description === "string" ? record.description : undefined, category: typeof record.category === "string" ? record.category : undefined, tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string") : [], placementRule: typeof record.placementRule === "string" ? record.placementRule : undefined, previewFile, previewAvailable: Boolean(previewFile), createdAt: record.createdAt }];
  } catch { return []; }
}

function getDefaultPreviewFile(componentFile: string): string {
  return `${componentFile}.preview.png`;
}

function resolvePreviewFile(component: GlobalComponentRecord): string | undefined {
  const previewFile = component.previewFile ?? getDefaultPreviewFile(component.file);
  return existsSync(previewFile) ? previewFile : undefined;
}

function copyPreviewFile(sourcePreviewFile: string | undefined, destinationModelFile: string): string | undefined {
  if (!sourcePreviewFile || !existsSync(sourcePreviewFile)) return undefined;
  const extension = extname(sourcePreviewFile).toLowerCase();
  const destinationPreviewFile = `${destinationModelFile}.preview${extension || ".png"}`;
  copyFileSync(sourcePreviewFile, destinationPreviewFile);
  return destinationPreviewFile;
}

function getPreviewMimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

function isPng(value: Buffer): boolean {
  return value.byteLength >= 8 && value.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}
