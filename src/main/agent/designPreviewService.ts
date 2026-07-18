/** Generates design previews and object references through Tencent Hunyuan Image 3.0. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { aiart } from "tencentcloud-sdk-nodejs";
import type { AppSettings } from "../../shared/types";
import { sanitizeFileName } from "./agentTools";

const HUNYUAN_IMAGE_HOST = "aiart.tencentcloudapi.com";
let imageGenerationQueue: Promise<void> = Promise.resolve();

export async function generateDesignPreview(input: {
  name: string;
  prompt: string;
  outputDir: string;
  settings: AppSettings;
}): Promise<{ path: string }> {
  return runSerially(() => generateHunyuanImage({ name: input.name, prompt: input.prompt, outputDir: input.outputDir, settings: input.settings }));
}

/** Uses Hunyuan Image's reference-image capability instead of an OpenAI image-edit endpoint. */
export async function extractObjectReference(input: {
  sourcePath: string;
  name: string;
  instruction: string;
  outputDir: string;
  settings: AppSettings;
}): Promise<{ path: string }> {
  const referenceBytes = await readFile(input.sourcePath);
  if (referenceBytes.byteLength > 4_500_000) throw new Error("混元生图参考图过大，请使用小于 4.5 MB 的图片。");
  const referenceImage = referenceBytes.toString("base64");
  return runSerially(() => generateHunyuanImage({
    name: input.name,
    prompt: `${input.instruction}\n仅保留目标物件，完整展示单件物体，干净纯色背景；移除其他物体、人物、文字和环境。不要添加原图不存在的功能结构。`,
    referenceImages: [referenceImage],
    outputDir: input.outputDir,
    settings: input.settings
  }));
}

async function generateHunyuanImage(input: {
  name: string;
  prompt: string;
  referenceImages?: string[];
  outputDir: string;
  settings: AppSettings;
}): Promise<{ path: string }> {
  const credentials = resolveCredentials();
  const settings = input.settings.hunyuanImage;
  if (!credentials) throw new Error("未配置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY，无法调用混元生图 3.0。");
  const client = createHunyuanImageClient(credentials, settings.region, settings.requestTimeoutSeconds);
  const submitted = await client.SubmitTextToImageJob({
    Prompt: input.prompt,
    ...(input.referenceImages?.length ? { Images: input.referenceImages } : {}),
    Resolution: normalizeResolution(settings.resolution),
    LogoAdd: settings.logoAdd ? 1 : 0,
    Revise: settings.revise ? 1 : 0
  });
  const jobId = readString(submitted.JobId);
  if (!jobId) throw new Error("混元生图未返回 JobId。");
  const imageUrl = await waitForHunyuanImage(jobId, client, settings);
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(toMilliseconds(settings.requestTimeoutSeconds)) });
  if (!response.ok) throw new Error(`下载混元生图结果失败：HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error("下载混元生图结果失败：响应为空。");
  await mkdir(input.outputDir, { recursive: true });
  const path = join(input.outputDir, `${sanitizeFileName(input.name)}.png`);
  await writeFile(path, bytes);
  return { path };
}

async function waitForHunyuanImage(
  jobId: string,
  client: InstanceType<typeof aiart.v20221229.Client>,
  settings: AppSettings["hunyuanImage"]
): Promise<string> {
  const deadline = Date.now() + toMilliseconds(settings.jobTimeoutSeconds);
  while (Date.now() < deadline) {
    const result = await client.QueryTextToImageJob({ JobId: jobId });
    if (result.JobStatusCode === "5") {
      const imageUrl = result.ResultImage?.find((value) => value.trim().length > 0);
      if (!imageUrl) throw new Error("混元生图任务已完成但未返回结果图片。");
      return imageUrl;
    }
    if (result.JobStatusCode === "4") throw new Error(result.JobErrorMsg?.trim() || result.JobStatusMsg?.trim() || "混元生图任务失败。");
    await delay(settings.pollIntervalSeconds);
  }
  throw new Error("混元生图任务超时，请稍后重试。");
}

interface HunyuanImageCredentials {
  secretId: string;
  secretKey: string;
}

function resolveCredentials(): HunyuanImageCredentials | undefined {
  const secretId = process.env.TENCENT_SECRET_ID?.trim();
  const secretKey = process.env.TENCENT_SECRET_KEY?.trim();
  return secretId && secretKey ? { secretId, secretKey } : undefined;
}

function createHunyuanImageClient(
  credentials: HunyuanImageCredentials,
  region: string,
  timeoutSeconds: number
): InstanceType<typeof aiart.v20221229.Client> {
  return new aiart.v20221229.Client({
    credential: credentials,
    region,
    profile: { httpProfile: { endpoint: HUNYUAN_IMAGE_HOST, reqTimeout: timeoutSeconds } }
  });
}

function runSerially<T>(operation: () => Promise<T>): Promise<T> {
  const result = imageGenerationQueue.then(operation, operation);
  imageGenerationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function normalizeResolution(value: string): string {
  const match = /^(\d{3,4})\s*[:x]\s*(\d{3,4})$/i.exec(value.trim());
  if (!match) throw new Error("HY3_IMAGE_RESOLUTION 必须是“宽:高”格式，例如 1024:1024。");
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 512 || width > 2048 || height < 512 || height > 2048 || width * height > 1024 * 1024) {
    throw new Error("混元生图分辨率宽高必须在 512-2048 px，且总像素不超过 1024×1024。");
  }
  return `${width}:${height}`;
}

function readString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function delay(seconds: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, toMilliseconds(seconds))); }
function toMilliseconds(seconds: number): number { return Math.max(1, Math.trunc(seconds)) * 1_000; }
