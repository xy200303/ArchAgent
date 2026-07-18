/** Generates design previews and object references through TokenHub's Hunyuan Image gateway. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppSettings } from "../../shared/types";
import { sanitizeFileName } from "./agentTools";

export async function generateDesignPreview(input: {
  name: string;
  prompt: string;
  outputDir: string;
  settings: AppSettings;
}): Promise<{ path: string }> {
  return saveTokenHubImage(await generateTokenHubImage({ prompt: input.prompt, settings: input.settings }), input.outputDir, input.name);
}

/** Uses TokenHub Hunyuan Image reference images to create a clean single-object reference. */
export async function extractObjectReference(input: {
  sourcePath: string;
  name: string;
  instruction: string;
  outputDir: string;
  settings: AppSettings;
}): Promise<{ path: string }> {
  const referenceBytes = await readFile(input.sourcePath);
  if (referenceBytes.byteLength > 4_500_000) throw new Error("混元生图参考图过大，请使用小于 4.5 MB 的图片。");
  const image = await generateTokenHubImage({
    prompt: `${input.instruction}\n仅保留目标物件，完整展示单件物体，干净纯色背景；移除其他物体、人物、文字和环境。不要添加原图不存在的功能结构。`,
    referenceImages: [referenceBytes.toString("base64")],
    settings: input.settings
  });
  return saveTokenHubImage(image, input.outputDir, input.name);
}

async function generateTokenHubImage(input: {
  prompt: string;
  referenceImages?: string[];
  settings: AppSettings;
}): Promise<{ url?: string; base64?: string }> {
  const apiKey = process.env.HY3_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 HY3_API_KEY，无法调用 TokenHub 混元生图。");
  const { endpoint, model, requestTimeoutSeconds } = input.settings.tokenHubImage;
  if (!endpoint.trim()) throw new Error("未配置 HY3_IMAGE_ENDPOINT，无法调用 TokenHub 混元生图。");
  if (!model.trim()) throw new Error("未配置 HY3_IMAGE_MODEL，无法调用 TokenHub 混元生图。");
  const response = await fetch(endpoint.trim(), {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.trim(),
      prompt: input.prompt,
      rsp_img_type: "url",
      ...(input.referenceImages?.length ? { images: input.referenceImages } : {})
    }),
    signal: AbortSignal.timeout(toMilliseconds(requestTimeoutSeconds))
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(readTokenHubError(payload, response.status));
  const image = extractGeneratedImage(payload);
  if (!image.url && !image.base64) throw new Error("TokenHub 混元生图未返回可下载的图片。");
  return image;
}

async function saveTokenHubImage(image: { url?: string; base64?: string }, outputDir: string, name: string): Promise<{ path: string }> {
  const bytes = image.base64 ? Buffer.from(image.base64, "base64") : await downloadImage(image.url);
  if (!bytes?.byteLength) throw new Error("TokenHub 混元生图未返回可保存的图片。");
  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, `${sanitizeFileName(name)}.png`);
  await writeFile(path, bytes);
  return { path };
}

function extractGeneratedImage(payload: unknown): { url?: string; base64?: string } {
  const record = asRecord(payload);
  const candidates = [
    record,
    asRecord(record?.data),
    asRecord(record?.result),
    asRecord(record?.output),
    Array.isArray(record?.data) ? asRecord(record.data[0]) : undefined,
    Array.isArray(record?.images) ? asRecord(record.images[0]) : undefined
  ];
  for (const candidate of candidates) {
    const url = readString(candidate?.url) ?? readString(candidate?.image_url);
    const base64 = readString(candidate?.b64_json) ?? readString(candidate?.image_base64);
    if (url || base64) return { url, base64 };
  }
  return {};
}

function readTokenHubError(payload: unknown, status: number): string {
  const record = asRecord(payload);
  const error = asRecord(record?.error) ?? record;
  const message = readString(error?.message) ?? readString(error?.Message) ?? readString(error?.msg);
  return message ? `TokenHub 混元生图请求失败：${message}` : `TokenHub 混元生图请求失败：HTTP ${status}`;
}

async function downloadImage(url: string | undefined): Promise<Buffer | undefined> {
  if (!url) return undefined;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载 TokenHub 生图结果失败：HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function asRecord(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function readString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function toMilliseconds(seconds: number): number { return Math.max(1, Math.trunc(seconds)) * 1_000; }
