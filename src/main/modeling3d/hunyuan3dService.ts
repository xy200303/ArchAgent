/** Calls TokenHub's Hunyuan 3D async gateway and returns the generated GLB. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_SUBMIT_URL = "https://tokenhub.tencentmaas.com/v1/api/3d/submit";
const DEFAULT_QUERY_URL = "https://tokenhub.tencentmaas.com/v1/api/3d/query";
const DEFAULT_SUBMIT_TIMEOUT_SECONDS = 120;
const DEFAULT_POLL_INTERVAL_SECONDS = 3;
const DEFAULT_JOB_TIMEOUT_SECONDS = 900;
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
  signal?: AbortSignal;
}

export interface Hunyuan3dSubmittedJob {
  taskId: string;
  model: Hunyuan3dModel;
  generateType: NonNullable<HunyuanImageTo3dInput["generateType"]>;
  faceCount?: number;
}

export async function generateHunyuanGlb(input: HunyuanImageTo3dInput, outputDir: string): Promise<{ path: string; previewImageUrl?: string; faceCount?: number }> {
  throwIfAborted(input.signal);
  const submitted = await submitHunyuan3dJob(input);
  return collectHunyuanGlb(submitted, { name: input.name, prompt: input.prompt }, outputDir, input.signal);
}

export async function submitHunyuan3dJob(input: HunyuanImageTo3dInput): Promise<Hunyuan3dSubmittedJob> {
  throwIfAborted(input.signal);
  const model = input.model ?? resolveHunyuan3dModel();
  const imageBase64 = input.imageBase64?.trim();
  const prompt = input.prompt?.trim();
  const requestedGenerateType = input.generateType ?? (input.detailLevel ? "normal" : "low_poly");
  const generateType = toHunyuanGenerateType(requestedGenerateType);
  const faceCount = generateType === "LowPoly" ? undefined : resolveFaceCount(input.faceCount, input.detailLevel);
  if (!imageBase64 && !prompt) throw new Error("文生3D需要 prompt，图生3D需要图片数据。");
  if (prompt && !containsChineseText(prompt)) throw new Error("混元文生3D仅支持中文正向提示词，请使用中文描述模型的形状、材质、颜色和风格。");
  if (imageBase64 && prompt && input.generateType !== "sketch") throw new Error("普通图生3D不能同时提交 prompt 和图片。");
  assertSingleEntityAsset(input.name, prompt);
  const singleEntityPrompt = prompt ? buildSingleEntityPrompt(input.name, prompt) : undefined;

  const apiKey = requireTokenHubApiKey();
  const job = await postJson(resolveSubmitUrl(), apiKey, {
    model,
    ...(imageBase64 ? { image_base64: imageBase64 } : { prompt: singleEntityPrompt }),
    generate_type: generateType,
    enable_pbr: input.enablePbr ?? true,
    ...(faceCount ? { face_count: faceCount } : {})
  }, readTimeoutSeconds("HY3_3D_SUBMIT_TIMEOUT_S", DEFAULT_SUBMIT_TIMEOUT_SECONDS), input.signal);
  if (job.status === "failed" || job.status === "fail") throw new Error(readJobFailureMessage(job));
  const taskId = readString(job.id);
  if (!taskId) throw new Error("TokenHub 混元生3D未返回任务 ID。");
  return { taskId, model, generateType: requestedGenerateType, ...(faceCount ? { faceCount } : {}) };
}

export async function collectHunyuanGlb(
  job: Hunyuan3dSubmittedJob,
  asset: Pick<HunyuanImageTo3dInput, "name" | "prompt">,
  outputDir: string,
  signal?: AbortSignal
): Promise<{ path: string; previewImageUrl?: string; faceCount?: number }> {
  const result = await waitForResult(requireTokenHubApiKey(), job.taskId, job.model, signal);
  const glb = result.data.find((item) => item.type.toLowerCase() === "glb");
  if (!glb?.url) throw new Error("TokenHub 混元生3D任务完成但未返回 GLB 文件。");
  const timeoutSeconds = readTimeoutSeconds("HY3_3D_SUBMIT_TIMEOUT_S", DEFAULT_SUBMIT_TIMEOUT_SECONDS);
  const response = await fetchWithTimeout(glb.url, timeoutSeconds, signal);
  if (!response.ok) throw new Error(`下载 TokenHub GLB 失败：HTTP ${response.status}`);
  const glbBytes = Buffer.from(await response.arrayBuffer());
  const preview = await downloadHunyuanPreview(glb.preview_image_url, timeoutSeconds, signal);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const destination = join(outputDir, `${safeName(asset.name)}.glb`);
  const previewFile = `${destination}.preview.${preview.extension}`;
  writeFileSync(previewFile, preview.bytes);
  writeFileSync(destination, glbBytes);
  writeFileSync(`${destination}.semantic.json`, JSON.stringify({
    name: asset.name, source: "hunyuan-3d", model: job.model, generateType: job.generateType,
    faceCount: job.faceCount, prompt: asset.prompt, description: asset.prompt, category: "未分类", tags: [],
    file: destination, previewFile, createdAt: new Date().toISOString()
  }, null, 2), "utf8");
  return { path: destination, previewImageUrl: glb.preview_image_url, faceCount: job.faceCount };
}

function requireTokenHubApiKey(): string {
  const apiKey = process.env.HY3_API_KEY?.trim();
  if (!apiKey) throw new Error("未配置 HY3_API_KEY，无法调用 TokenHub 混元生3D。");
  return apiKey;
}

function resolveSubmitUrl(): string { return process.env.HY3_3D_SUBMIT_ENDPOINT?.trim() || DEFAULT_SUBMIT_URL; }
function resolveQueryUrl(): string { return process.env.HY3_3D_QUERY_ENDPOINT?.trim() || DEFAULT_QUERY_URL; }

function resolveHunyuan3dModel(): Hunyuan3dModel {
  const model = process.env.HY3_3D_MODEL?.trim() || DEFAULT_HUNYUAN_3D_MODEL;
  if (model === "hy-3d-3.0" || model === "hy-3d-3.1" || model === "hy-3d-express") return model;
  throw new Error("HY3_3D_MODEL 仅支持 hy-3d-3.0、hy-3d-3.1 或 hy-3d-express。");
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

export function assertSingleEntityAsset(name: string, _prompt?: string): void {
  if (!name.trim()) throw new Error("生3D需要资产名称。");
}

export function buildSingleEntityPrompt(name: string, prompt: string): string {
  return [
    "任务：生成一个边界干净、可独立移动和摆放的完整 3D 资产。",
    `目标资产：${name}。`,
    "可包含人物、动物、工具或多个物件之间明确且完整的互动，只要它们共同构成一个自包含资产；所有组成部分必须完整可见，不能截断、悬挂或延伸到资产边界之外。",
    "独立展示，纯白或透明背景，无地面、无背景、无建筑环境、无无关物件、无文字、无图标、无重复主体。",
    "如提示词包含环境、用途或摆放语境，仅将其作为目标资产的外观和比例参考；输出始终聚焦目标资产本体。",
    `外观细节：${prompt}`
  ].join("\n");
}
function toHunyuanGenerateType(value: NonNullable<HunyuanImageTo3dInput["generateType"]>): "Normal" | "LowPoly" | "Geometry" | "Sketch" {
  const generateTypes = { normal: "Normal", low_poly: "LowPoly", geometry: "Geometry", sketch: "Sketch" } as const;
  return generateTypes[value];
}

async function waitForResult(apiKey: string, id: string, model: string, signal?: AbortSignal): Promise<{ data: Array<{ type: string; url: string; preview_image_url?: string }> }> {
  const deadline = Date.now() + toMilliseconds(readTimeoutSeconds("HY3_3D_JOB_TIMEOUT_S", DEFAULT_JOB_TIMEOUT_SECONDS, 30, 3_600));
  const intervalSeconds = readTimeoutSeconds("HY3_3D_POLL_INTERVAL_S", DEFAULT_POLL_INTERVAL_SECONDS, 1, 60);
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    const result = await postJson(resolveQueryUrl(), apiKey, { model, id }, readTimeoutSeconds("HY3_3D_SUBMIT_TIMEOUT_S", DEFAULT_SUBMIT_TIMEOUT_SECONDS), signal);
    if (result.status === "completed" && Array.isArray(result.data)) return result as { data: Array<{ type: string; url: string; preview_image_url?: string }> };
    if (result.status === "failed" || result.status === "fail") throw new Error(readJobFailureMessage(result));
    await delay(intervalSeconds, signal);
  }
  throw new Error("TokenHub 混元生3D任务超时，请稍后在构件库重试。");
}

async function postJson(url: string, apiKey: string, body: Record<string, unknown>, timeoutSeconds: number, signal?: AbortSignal): Promise<Record<string, any>> {
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: createRequestSignal(timeoutSeconds, signal) });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw createHunyuanApiError(payload, response.status, response.headers.get("retry-after"));
  if (!payload || typeof payload !== "object") throw new Error("TokenHub 混元生3D返回了无效响应。");
  return payload as Record<string, any>;
}

function readApiError(payload: unknown, status: number): string {
  const details = getApiErrorDetails(payload);
  return details.message ? `TokenHub 混元生3D请求失败${details.code ? `（${details.code}）` : ""}：${details.message}` : `TokenHub 混元生3D请求失败：HTTP ${status}`;
}

function createHunyuanApiError(payload: unknown, status: number, retryAfter: string | null): Error {
  const details = getApiErrorDetails(payload);
  const error = Object.assign(new Error(readApiError(payload, status)), {
    status,
    ...(details.code ? { code: details.code } : {}),
    ...(retryAfter && Number.isFinite(Number(retryAfter)) ? { retryAfterSeconds: Math.ceil(Number(retryAfter)) } : {})
  });
  return error;
}

function getApiErrorDetails(payload: unknown): { code?: string; message?: string } {
  if (!payload || typeof payload !== "object") return {};
  const record = payload as Record<string, unknown>;
  const error = record.error ?? record.Error;
  const errorRecord = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = [errorRecord.message, errorRecord.Message, record.message, record.Message, record.ErrorMessage, record.msg, record.Msg, typeof error === "string" ? error : undefined].find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const code = [errorRecord.code, errorRecord.Code, record.code, record.Code, record.ErrorCode].find((value): value is string | number => typeof value === "string" || typeof value === "number");
  return { ...(code !== undefined ? { code: String(code) } : {}), ...(message ? { message } : {}) };
}

function readJobFailureMessage(payload: unknown): string { return getApiErrorDetails(payload).message ?? "TokenHub 混元生3D任务失败。"; }

async function downloadHunyuanPreview(previewUrl: string | undefined, timeoutSeconds: number, signal?: AbortSignal): Promise<{ bytes: Buffer; extension: "png" | "jpg" | "webp" }> {
  if (!previewUrl) throw new Error("TokenHub 混元生3D任务未返回 preview_image_url，无法生成可预览资产。");
  const response = await fetchWithTimeout(previewUrl, timeoutSeconds, signal);
  if (!response.ok) throw new Error(`下载 TokenHub 预览图失败：HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.byteLength) throw new Error("下载 TokenHub 预览图失败：响应为空。");
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
function readString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function readTimeoutSeconds(key: string, fallback: number, minimum = 1, maximum = 600): number { const value = Number(process.env[key]?.trim()); return Math.min(Math.max(Number.isFinite(value) ? Math.trunc(value) : fallback, minimum), maximum); }
function delay(seconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, toMilliseconds(seconds));
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(createAbortError());
    }, { once: true });
  });
}
function toMilliseconds(seconds: number): number { return Math.max(1, Math.trunc(seconds)) * 1_000; }
function fetchWithTimeout(url: string, timeoutSeconds: number, signal?: AbortSignal): Promise<Response> { return fetch(url, { signal: createRequestSignal(timeoutSeconds, signal) }); }
function createRequestSignal(timeoutSeconds: number, signal?: AbortSignal): AbortSignal { return signal ? AbortSignal.any([signal, AbortSignal.timeout(toMilliseconds(timeoutSeconds))]) : AbortSignal.timeout(toMilliseconds(timeoutSeconds)); }
function throwIfAborted(signal?: AbortSignal): void { if (signal?.aborted) throw createAbortError(); }
function createAbortError(): Error { return Object.assign(new Error("生成已取消。"), { name: "AbortError" }); }
