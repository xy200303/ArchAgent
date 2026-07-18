/** Calls Tencent Hunyuan 3D Pro through the official Tencent Cloud SDK. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ai3d } from "tencentcloud-sdk-nodejs";

const HUNYUAN_3D_HOST = "ai3d.tencentcloudapi.com";
const DEFAULT_SUBMIT_TIMEOUT_SECONDS = 120;
const DEFAULT_POLL_INTERVAL_SECONDS = 3;
const DEFAULT_JOB_TIMEOUT_SECONDS = 900;
const DEFAULT_HUNYUAN_3D_MODEL = "3.0";
const DEFAULT_FACE_COUNT = 50_000;
const MIN_FACE_COUNT = 3_000;
const MAX_FACE_COUNT = 1_500_000;

type Hunyuan3dModel = "3.0" | "3.1";
export type Hunyuan3dDetailLevel = "draft" | "standard" | "high";

const FACE_COUNT_BY_DETAIL_LEVEL: Record<Hunyuan3dDetailLevel, number> = {
  draft: 20_000,
  standard: DEFAULT_FACE_COUNT,
  high: 120_000
};

export interface HunyuanImageTo3dInput {
  imageBase64?: string;
  prompt?: string;
  name: string;
  model?: Hunyuan3dModel;
  generateType?: "normal" | "low_poly" | "geometry" | "sketch";
  enablePbr?: boolean;
  detailLevel?: Hunyuan3dDetailLevel;
  faceCount?: number;
}

/** Provider task metadata that is safe to persist and resume after an app restart. */
export interface Hunyuan3dSubmittedJob {
  taskId: string;
  model: Hunyuan3dModel;
  generateType: NonNullable<HunyuanImageTo3dInput["generateType"]>;
  faceCount?: number;
}

export async function generateHunyuanGlb(input: HunyuanImageTo3dInput, outputDir: string): Promise<{ path: string; previewImageUrl?: string; faceCount?: number }> {
  const submitted = await submitHunyuan3dJob(input);
  return collectHunyuanGlb(submitted, { name: input.name, prompt: input.prompt }, outputDir);
}

/** Submits exactly one provider job. Persist the returned JobId before polling it. */
export async function submitHunyuan3dJob(input: HunyuanImageTo3dInput): Promise<Hunyuan3dSubmittedJob> {
  const model = input.model ?? resolveHunyuan3dModel();
  const imageBase64 = input.imageBase64?.trim();
  const prompt = input.prompt?.trim();
  const requestedGenerateType = input.generateType ?? (input.detailLevel ? "normal" : "low_poly");
  const generateType = toHunyuanGenerateType(requestedGenerateType);
  const faceCount = generateType === "LowPoly" ? undefined : resolveFaceCount(input.faceCount, input.detailLevel);
  if (!imageBase64 && !prompt) throw new Error("文生3D需要 prompt，图生3D需要图片数据。");
  if (prompt && !containsChineseText(prompt)) throw new Error("混元文生3D仅支持中文正向提示词，请使用中文描述模型的形状、材质、颜色和风格。");
  if (imageBase64 && prompt && input.generateType !== "sketch") throw new Error("普通图生3D不能同时提交 prompt 和图片。");
  if (model === "3.1" && generateType === "LowPoly") throw new Error("混元生3D 3.1 不支持 LowPoly，请使用 3.0 或选择其他生成类型。");

  const client = createHunyuan3dClient();
  const submitted = await client.SubmitHunyuanTo3DProJob({
    Model: model,
    ...(imageBase64 ? { ImageBase64: imageBase64 } : { Prompt: prompt }),
    GenerateType: generateType,
    EnablePBR: input.enablePbr ?? true,
    ...(faceCount ? { FaceCount: faceCount } : {})
  });
  const taskId = submitted.JobId?.trim();
  if (!taskId) throw new Error("混元生3D未返回 JobId。");
  return { taskId, model, generateType: requestedGenerateType, ...(faceCount ? { faceCount } : {}) };
}

/** Polls a previously submitted provider job and publishes its GLB locally without resubmitting. */
export async function collectHunyuanGlb(
  job: Hunyuan3dSubmittedJob,
  asset: Pick<HunyuanImageTo3dInput, "name" | "prompt">,
  outputDir: string
): Promise<{ path: string; previewImageUrl?: string; faceCount?: number }> {
  const result = await waitForResult(job.taskId);
  const glb = result.find((item) => item.Type?.toLowerCase() === "glb" && item.Url?.trim());
  if (!glb?.Url) throw new Error("混元生3D任务完成但未返回 GLB 文件。");

  const timeoutSeconds = readTimeoutSeconds("HY3_3D_SUBMIT_TIMEOUT_S", DEFAULT_SUBMIT_TIMEOUT_SECONDS);
  const response = await fetchWithTimeout(glb.Url, timeoutSeconds);
  if (!response.ok) throw new Error(`下载混元 GLB 失败：HTTP ${response.status}`);
  const glbBytes = Buffer.from(await response.arrayBuffer());
  const preview = await downloadHunyuanPreview(glb.PreviewImageUrl, timeoutSeconds);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const destination = join(outputDir, `${safeName(asset.name)}.glb`);
  const previewFile = `${destination}.preview.${preview.extension}`;
  writeFileSync(previewFile, preview.bytes);
  writeFileSync(destination, glbBytes);
  writeFileSync(`${destination}.semantic.json`, JSON.stringify({
    name: asset.name,
    source: "hunyuan-3d",
    model: job.model,
    generateType: job.generateType,
    faceCount: job.faceCount,
    prompt: asset.prompt,
    description: asset.prompt,
    category: "未分类",
    tags: [],
    file: destination,
    previewFile,
    createdAt: new Date().toISOString()
  }, null, 2), "utf8");
  return { path: destination, previewImageUrl: glb.PreviewImageUrl, faceCount: job.faceCount };
}

function createHunyuan3dClient(): InstanceType<typeof ai3d.v20250513.Client> {
  const secretId = process.env.TENCENT_SECRET_ID?.trim();
  const secretKey = process.env.TENCENT_SECRET_KEY?.trim();
  if (!secretId || !secretKey) throw new Error("未配置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY，无法调用混元生3D。");
  return new ai3d.v20250513.Client({
    credential: { secretId, secretKey },
    region: process.env.HY3_3D_REGION?.trim() || "ap-guangzhou",
    profile: {
      httpProfile: {
        endpoint: HUNYUAN_3D_HOST,
        reqTimeout: readTimeoutSeconds("HY3_3D_SUBMIT_TIMEOUT_S", DEFAULT_SUBMIT_TIMEOUT_SECONDS)
      }
    }
  });
}

function resolveHunyuan3dModel(): Hunyuan3dModel {
  const model = process.env.HY3_3D_MODEL_VERSION?.trim() || DEFAULT_HUNYUAN_3D_MODEL;
  if (model === "3.0" || model === "3.1") return model;
  throw new Error("HY3_3D_MODEL_VERSION 仅支持 3.0 或 3.1。");
}

function resolveFaceCount(explicitFaceCount: number | undefined, detailLevel: Hunyuan3dDetailLevel | undefined): number {
  const requested = explicitFaceCount ?? (detailLevel ? FACE_COUNT_BY_DETAIL_LEVEL[detailLevel] : readConfiguredFaceCount());
  if (!Number.isInteger(requested) || requested < MIN_FACE_COUNT || requested > MAX_FACE_COUNT) {
    throw new Error(`混元生3D面数必须是 ${MIN_FACE_COUNT.toLocaleString("en-US")} 到 ${MAX_FACE_COUNT.toLocaleString("en-US")} 的整数。`);
  }
  return requested;
}

function readConfiguredFaceCount(): number {
  const configured = process.env.HY3_3D_FACE_COUNT?.trim();
  if (!configured) return DEFAULT_FACE_COUNT;
  const value = Number(configured);
  if (!Number.isInteger(value)) throw new Error("HY3_3D_FACE_COUNT 必须是整数。");
  return value;
}

function containsChineseText(value: string): boolean { return /[\u3400-\u9fff]/.test(value); }

function toHunyuanGenerateType(value: NonNullable<HunyuanImageTo3dInput["generateType"]>): "Normal" | "LowPoly" | "Geometry" | "Sketch" {
  const generateTypes = { normal: "Normal", low_poly: "LowPoly", geometry: "Geometry", sketch: "Sketch" } as const;
  return generateTypes[value];
}

async function waitForResult(taskId: string): Promise<Array<{ Type?: string; Url?: string; PreviewImageUrl?: string }>> {
  const client = createHunyuan3dClient();
  const deadline = Date.now() + toMilliseconds(readTimeoutSeconds("HY3_3D_JOB_TIMEOUT_S", DEFAULT_JOB_TIMEOUT_SECONDS, 30, 3_600));
  const intervalSeconds = readTimeoutSeconds("HY3_3D_POLL_INTERVAL_S", DEFAULT_POLL_INTERVAL_SECONDS, 1, 60);
  while (Date.now() < deadline) {
    const result = await client.QueryHunyuanTo3DProJob({ JobId: taskId });
    if (result.Status === "DONE") return result.ResultFile3Ds ?? [];
    if (result.Status === "FAIL") throw new Error(result.ErrorMessage?.trim() || result.ErrorCode?.trim() || "混元生3D任务失败。");
    await delay(intervalSeconds);
  }
  throw new Error("混元生3D任务超时，请稍后在构件库重试。");
}

async function downloadHunyuanPreview(previewUrl: string | undefined, timeoutSeconds: number): Promise<{ bytes: Buffer; extension: "png" | "jpg" | "webp" }> {
  if (!previewUrl) throw new Error("混元生3D任务未返回 PreviewImageUrl，无法生成可预览资产。");
  const response = await fetchWithTimeout(previewUrl, timeoutSeconds);
  if (!response.ok) throw new Error(`下载混元预览图失败：HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error("下载混元预览图失败：响应为空。");
  return { bytes, extension: getImageExtension(response.headers.get("content-type"), bytes) };
}

function getImageExtension(contentType: string | null, bytes: Buffer): "png" | "jpg" | "webp" {
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "jpg";
  if (bytes.subarray(0, 4).equals(Buffer.from("RIFF")) && bytes.subarray(8, 12).equals(Buffer.from("WEBP"))) return "webp";
  return "png";
}

function safeName(value: string): string { return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "hunyuan-model"; }
function readTimeoutSeconds(key: string, fallback: number, minimum = 1, maximum = 600): number {
  const value = Number(process.env[key]?.trim());
  return Math.min(Math.max(Number.isFinite(value) ? Math.trunc(value) : fallback, minimum), maximum);
}
function delay(seconds: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, toMilliseconds(seconds))); }
function toMilliseconds(seconds: number): number { return Math.max(1, Math.trunc(seconds)) * 1_000; }
function fetchWithTimeout(url: string, timeoutSeconds: number): Promise<Response> { return fetch(url, { signal: AbortSignal.timeout(toMilliseconds(timeoutSeconds)) }); }
