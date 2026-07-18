/** Calls Hunyuan 3D's OpenAI-compatible async API and returns the generated GLB. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SUBMIT_URL = "https://tokenhub.tencentmaas.com/v1/api/3d/submit";
const QUERY_URL = "https://tokenhub.tencentmaas.com/v1/api/3d/query";
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 100;
const DEFAULT_HUNYUAN_3D_MODEL = "hy-3d-3.0";
const DEFAULT_FACE_COUNT = 50_000;
const MIN_FACE_COUNT = 3_000;
const MAX_FACE_COUNT = 150_000;

type Hunyuan3dModel = "hy-3d-3.0" | "hy-3d-3.1" | "hy-3d-express";
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

/** Submits exactly one provider job. Persist the returned task ID before polling it. */
export async function submitHunyuan3dJob(input: HunyuanImageTo3dInput): Promise<Hunyuan3dSubmittedJob> {
  const apiKey = process.env.HY3_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 HY3_API_KEY，无法调用混元生3D。");
  const model = input.model ?? resolveHunyuan3dModel();
  const imageBase64 = input.imageBase64?.trim();
  const prompt = input.prompt?.trim();
  // Scene reconstruction can place many assets; use the provider's actual low-poly mode unless a caller explicitly requests a detail budget.
  const requestedGenerateType = input.generateType ?? (input.detailLevel ? "normal" : "low_poly");
  const generateType = toHunyuanGenerateType(requestedGenerateType);
  const faceCount = generateType === "LowPoly" ? undefined : resolveFaceCount(input.faceCount, input.detailLevel);
  if (!imageBase64 && !prompt) throw new Error("文生3D需要 prompt，图生3D需要图片数据。");
  if (prompt && !containsChineseText(prompt)) throw new Error("混元文生3D仅支持中文正向提示词，请使用中文描述模型的形状、材质、颜色和风格。");
  if (imageBase64 && prompt && input.generateType !== "sketch") throw new Error("普通图生3D不能同时提交 prompt 和图片。");

  const job = await postJson(SUBMIT_URL, apiKey, {
    model,
    ...(imageBase64 ? { image_base64: imageBase64 } : { prompt }),
    generate_type: generateType,
    enable_pbr: input.enablePbr ?? true,
    ...(faceCount ? { face_count: faceCount } : {})
  });
  if (job.status === "failed" || job.status === "fail") throw new Error(readJobFailureMessage(job));
  const jobId = typeof job.id === "string" ? job.id.trim() : "";
  if (!jobId) throw new Error("混元生3D未返回任务 ID。");
  return { taskId: jobId, model, generateType: requestedGenerateType, ...(faceCount ? { faceCount } : {}) };
}

/** Polls a previously submitted provider job and publishes its GLB locally without resubmitting. */
export async function collectHunyuanGlb(
  job: Hunyuan3dSubmittedJob,
  asset: Pick<HunyuanImageTo3dInput, "name" | "prompt">,
  outputDir: string
): Promise<{ path: string; previewImageUrl?: string; faceCount?: number }> {
  const apiKey = process.env.HY3_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 HY3_API_KEY，无法查询混元生3D任务。");
  const result = await waitForResult(apiKey, job.taskId, job.model);
  const glb = result.data.find((item) => item.type.toLowerCase() === "glb");
  if (!glb?.url) throw new Error("混元生3D任务完成但未返回 GLB 文件。");

  const response = await fetch(glb.url);
  if (!response.ok) throw new Error(`下载混元 GLB 失败：HTTP ${response.status}`);
  const glbBytes = Buffer.from(await response.arrayBuffer());
  const preview = await downloadHunyuanPreview(glb.preview_image_url);
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
  return { path: destination, previewImageUrl: glb.preview_image_url, faceCount: job.faceCount };
}

/** Resolves the deployment-level model choice before starting an asynchronous generation job. */
function resolveHunyuan3dModel(): Hunyuan3dModel {
  const configuredModel = process.env.HY3_3D_MODEL?.trim();
  if (!configuredModel) return DEFAULT_HUNYUAN_3D_MODEL;
  if (configuredModel === "hy-3d-3.0" || configuredModel === "hy-3d-3.1" || configuredModel === "hy-3d-express") return configuredModel;
  throw new Error("HY3_3D_MODEL 仅支持 hy-3d-3.0、hy-3d-3.1 或 hy-3d-express。");
}

/** Keeps generated library assets within a practical editor rendering budget. */
function resolveFaceCount(explicitFaceCount: number | undefined, detailLevel: Hunyuan3dDetailLevel | undefined): number {
  const requested = explicitFaceCount
    ?? (detailLevel ? FACE_COUNT_BY_DETAIL_LEVEL[detailLevel] : readConfiguredFaceCount());
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

function containsChineseText(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

/** OpenAI-compatible fields use snake case, but Tencent keeps these enum values in PascalCase. */
function toHunyuanGenerateType(value: NonNullable<HunyuanImageTo3dInput["generateType"]>): "Normal" | "LowPoly" | "Geometry" | "Sketch" {
  const types = {
    normal: "Normal",
    low_poly: "LowPoly",
    geometry: "Geometry",
    sketch: "Sketch"
  } as const;
  return types[value];
}

async function waitForResult(apiKey: string, id: string, model: string): Promise<{ data: Array<{ type: string; url: string; preview_image_url?: string }> }> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const result = await postJson(QUERY_URL, apiKey, { model, id });
    if (result.status === "completed" && Array.isArray(result.data)) return result as { data: Array<{ type: string; url: string; preview_image_url?: string }> };
    if (result.status === "failed" || result.status === "fail") throw new Error(readJobFailureMessage(result));
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error("混元生3D任务超时，请稍后在构建库重试。");
}

async function postJson(url: string, apiKey: string, body: Record<string, unknown>): Promise<any> {
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error(readApiError(payload, response.status));
  if (!payload || typeof payload !== "object") throw new Error("混元生3D返回了无效响应。");
  return payload;
}

function readApiError(payload: unknown, status: number): string {
  const details = getApiErrorDetails(payload);
  if (details.message) return `混元生3D请求失败${details.code ? `（${details.code}）` : ""}：${details.message}`;
  return `混元生3D请求失败：HTTP ${status}`;
}

/** Handles both OpenAI-compatible and Tencent Cloud error envelopes without exposing request secrets. */
function getApiErrorDetails(payload: unknown): { code?: string; message?: string } {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as Record<string, unknown>;
  const error = record.error ?? record.Error;
  const errorRecord = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = [
    errorRecord.message,
    errorRecord.Message,
    record.message,
    record.Message,
    record.ErrorMessage,
    record.msg,
    record.Msg,
    typeof error === "string" ? error : undefined
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const code = [errorRecord.code, errorRecord.Code, record.code, record.Code, record.ErrorCode]
    .find((value): value is string | number => typeof value === "string" || typeof value === "number");
  return { ...(code !== undefined ? { code: String(code) } : {}), ...(message ? { message } : {}) };
}

function readJobFailureMessage(payload: unknown): string {
  return getApiErrorDetails(payload).message ?? "混元生3D任务失败。";
}

/** Downloads the provider thumbnail before publishing a Hunyuan asset to the local project. */
async function downloadHunyuanPreview(previewUrl: string | undefined): Promise<{ bytes: Buffer; extension: "png" | "jpg" | "webp" }> {
  if (!previewUrl) throw new Error("混元生3D任务未返回 preview_image_url，无法生成可预览资产。");
  const response = await fetch(previewUrl);
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
function delay(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
