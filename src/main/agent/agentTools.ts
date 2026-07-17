/** Provides reusable file, document, and formatting primitives for Agent tools. */
import { basename, dirname, extname } from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

export type BuiltinToolName =
  | "time"
  | "remember_project"
  | "read_file"
  | "read_pdf"
  | "read_image"
  | "write_file"
  | "web_search"
  | "exec_bash"
  | "send_file"
  | "get_scene"
  | "create_wall"
  | "update_wall"
  | "create_slab"
  | "update_slab"
  | "create_ceiling"
  | "update_ceiling"
  | "create_column"
  | "update_column"
  | "create_zone"
  | "update_zone"
  | "create_stair"
  | "update_stair"
  | "create_fence"
  | "update_fence"
  | "create_door"
  | "update_door"
  | "create_window"
  | "update_window"
  | "delete_node";

export interface ReadToolResult {
  toolName: BuiltinToolName;
  sourceName: string;
  content: string;
  summary: string;
  charCount: number;
}

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".csv", ".log", ".yaml", ".yml"]);
const IMAGE_MIME_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"]
]);

export interface ImageDataUrlResult {
  sourceName: string;
  mimeType: string;
  size: number;
  dataBase64: string;
  dataUrl: string;
}

export const MAX_VISION_IMAGE_BYTES = 20 * 1024 * 1024;

export function getReadToolName(filePath: string): BuiltinToolName {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".docx") return "read_file";
  if (ext === ".pdf") return "read_pdf";
  if (IMAGE_MIME_TYPES.has(ext)) return "read_image";
  return "read_file";
}

export function getImageMimeType(filePath: string): string | undefined {
  return IMAGE_MIME_TYPES.get(extname(filePath).toLowerCase());
}

export function isSupportedImageFile(filePath: string): boolean {
  return Boolean(getImageMimeType(filePath));
}

export function compactText(text: string, maxChars: number): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}\n\n[内容过长，已截断 ${normalized.length - maxChars} 字符]`;
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim() || "artifact";
}

export function getCurrentTimeText(): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "full",
    timeStyle: "medium"
  }).format(new Date());
}

export async function readDocumentText(filePath: string, maxChars: number): Promise<ReadToolResult> {
  const ext = extname(filePath).toLowerCase();
  const sourceName = basename(filePath);
  const fileStat = await stat(filePath);
  let content = "";

  if (TEXT_EXTENSIONS.has(ext)) {
    content = await readFile(filePath, "utf-8");
  } else if (IMAGE_MIME_TYPES.has(ext)) {
    return {
      toolName: "read_image",
      sourceName,
      content: "",
      summary: `图片文件 ${sourceName} 请使用 read_image 识别`,
      charCount: 0
    };
  } else {
    return {
      toolName: getReadToolName(filePath),
      sourceName,
      content: "",
      summary: `暂不支持解析 ${ext || "未知"} 文件，已保留附件引用`,
      charCount: 0
    };
  }

  const compacted = compactText(content, maxChars);
  return {
    toolName: getReadToolName(filePath),
    sourceName,
    content: compacted,
    summary: `已读取 ${sourceName}，大小 ${formatBytes(fileStat.size)}，抽取 ${compacted.length} 字符`,
    charCount: compacted.length
  };
}

export async function readImageDataUrl(filePath: string, maxBytes: number): Promise<ImageDataUrlResult> {
  const sourceName = basename(filePath);
  const mimeType = getImageMimeType(filePath);
  if (!mimeType) {
    throw new Error(`read_image 暂不支持 ${extname(filePath).toLowerCase() || "未知"} 图片格式`);
  }

  const fileStat = await stat(filePath);
  if (fileStat.size > maxBytes) {
    throw new Error(`read_image 图片过大：${formatBytes(fileStat.size)}，最大支持 ${formatBytes(maxBytes)}`);
  }

  const data = await readFile(filePath);
  const dataBase64 = data.toString("base64");
  return {
    sourceName,
    mimeType,
    size: fileStat.size,
    dataBase64,
    dataUrl: `data:${mimeType};base64,${dataBase64}`
  };
}

export async function writeUtf8File(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
