/** Builds safe renderer previews for artifacts without leaking unrestricted file access. */
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { compactText } from "../agent/agentTools";
import type { ArtifactPreview, ArtifactSummary } from "../../shared/types";

const TEXT_EXTENSIONS = new Set([".md", ".txt", ".json", ".log", ".csv", ".yaml", ".yml"]);
const IMAGE_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

export async function buildArtifactPreview(
  artifact: ArtifactSummary,
  options: { maxTextChars?: number; maxDataBytes?: number } = {}
): Promise<ArtifactPreview> {
  const maxTextChars = options.maxTextChars ?? 60000;
  const maxDataBytes = options.maxDataBytes ?? 12 * 1024 * 1024;
  const extension = extname(artifact.path).toLowerCase();
  const fileStat = await stat(artifact.path);

  if (IMAGE_MIME_TYPES[extension]) {
    return buildImagePreview(artifact, IMAGE_MIME_TYPES[extension], fileStat.size, maxDataBytes);
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    const text = await readFile(artifact.path, "utf-8");
    return {
      artifactId: artifact.id,
      name: artifact.name,
      kind: artifact.kind,
      mode: "text",
      size: fileStat.size,
      text: compactText(text, maxTextChars),
      path: artifact.path
    };
  }

  return {
    artifactId: artifact.id,
    name: artifact.name,
    kind: artifact.kind,
    mode: "unsupported",
    size: fileStat.size,
    summary: "该文件类型暂不支持内置编辑，请使用“打开”在系统中查看。",
    path: artifact.path
  };
}

async function buildImagePreview(
  artifact: ArtifactSummary,
  mimeType: string,
  size: number,
  maxDataBytes: number
): Promise<ArtifactPreview> {
  if (size > maxDataBytes) {
    return {
      artifactId: artifact.id,
      name: artifact.name,
      kind: artifact.kind,
      mode: "unsupported",
      size,
      summary: "图片文件较大，暂不支持内置预览，请使用“打开”。",
      path: artifact.path
    };
  }

  const data = await readFile(artifact.path);
  return {
    artifactId: artifact.id,
    name: artifact.name,
    kind: artifact.kind,
    mode: "image",
    size,
    mimeType,
    dataUrl: `data:${mimeType};base64,${data.toString("base64")}`,
    path: artifact.path
  };
}
