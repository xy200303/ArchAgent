/** Generates a reviewable 2D design preview before expensive 3D reconstruction is confirmed. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import type { AppSettings } from "../../shared/types";
import { sanitizeFileName } from "./agentTools";

export async function generateDesignPreview(input: {
  name: string;
  prompt: string;
  outputDir: string;
  settings: AppSettings;
}): Promise<{ path: string }> {
  const apiKey = process.env.HY3_IMAGE_API_KEY?.trim() || process.env.OPENAI_IMAGE_API_KEY?.trim() || process.env.HY3_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  const model = input.settings.openai.imageModel.trim();
  if (!apiKey) throw new Error("未配置图片生成 API Key，无法生成方案效果图。");
  if (!model) throw new Error("未配置图片生成模型，无法生成方案效果图。");
  const client = new OpenAI({
    apiKey,
    baseURL: input.settings.openai.imageBaseUrl.trim() || input.settings.openai.baseUrl.trim(),
    timeout: input.settings.openai.imageRequestTimeoutMs
  });
  const response = await client.images.generate({
    model,
    prompt: input.prompt,
    size: input.settings.openai.imageSize as "1024x1024",
    quality: input.settings.openai.imageQuality as "standard",
    response_format: "b64_json"
  });
  return saveGeneratedImage(response.data?.[0], input.outputDir, input.name, "图片模型未返回可保存的方案效果图。");
}

/** Uses image-to-image editing to isolate a confirmed object from a complex reference photo. */
export async function extractObjectReference(input: {
  sourcePath: string;
  name: string;
  instruction: string;
  outputDir: string;
  settings: AppSettings;
}): Promise<{ path: string }> {
  const apiKey = resolveImageApiKey();
  const model = input.settings.openai.imageModel.trim();
  if (!apiKey) throw new Error("未配置图片生成 API Key，无法提取物件参考图。");
  if (!model) throw new Error("未配置图片生成模型，无法提取物件参考图。");
  const client = createImageClient(apiKey, input.settings);
  const image = await toFile(await readFile(input.sourcePath), basename(input.sourcePath));
  const response = await client.images.edit({
    model,
    image,
    prompt: `${input.instruction}\n仅保留目标物件，完整展示单件物体，干净纯色背景；移除其他物体、人物、文字和环境。不要添加原图不存在的功能结构。`,
    size: input.settings.openai.imageSize as "1024x1024",
    quality: input.settings.openai.imageQuality as "standard",
    response_format: "b64_json"
  });
  return saveGeneratedImage(response.data?.[0], input.outputDir, input.name, "图片模型未返回可保存的物件提取图。");
}

function resolveImageApiKey(): string | undefined {
  return process.env.HY3_IMAGE_API_KEY?.trim() || process.env.OPENAI_IMAGE_API_KEY?.trim() || process.env.HY3_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
}

function createImageClient(apiKey: string, settings: AppSettings): OpenAI {
  return new OpenAI({ apiKey, baseURL: settings.openai.imageBaseUrl.trim() || settings.openai.baseUrl.trim(), timeout: settings.openai.imageRequestTimeoutMs });
}

async function saveGeneratedImage(image: { b64_json?: string | null; url?: string | null } | undefined, outputDir: string, name: string, errorMessage: string): Promise<{ path: string }> {
  const bytes = image?.b64_json ? Buffer.from(image.b64_json, "base64") : await downloadImage(image?.url || undefined);
  if (!bytes?.byteLength) throw new Error(errorMessage);
  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, `${sanitizeFileName(name)}.png`);
  await writeFile(path, bytes);
  return { path };
}

async function downloadImage(url: string | undefined): Promise<Buffer | undefined> {
  if (!url) return undefined;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载方案效果图失败：HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
