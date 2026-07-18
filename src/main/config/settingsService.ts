/** Loads and persists user settings while maintaining Hy3/OpenAI environment compatibility. */
import { existsSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
import {
  clampContextWindowTokens,
  type AppSettings,
  type UpdateAppSettingsInput
} from "../../shared/types";
import { getBundledPythonRuntimeStatus } from "../runtime/runtimeDiagnostics";
import { serializeEnvFile } from "./envFile";

export interface SettingsService {
  load(): AppSettings;
  save(input: UpdateAppSettingsInput): AppSettings;
}

export function createSettingsService(options: {
  envLocalPath: string;
  envPath: string;
  projectRootDir: string;
  resourcesDir?: string;
}): SettingsService {
  function readEnvValue(primaryKey: string, legacyKey: string, fallback: string): string {
    const primary = process.env[primaryKey];
    if (primary !== undefined) return primary;
    const legacy = process.env[legacyKey];
    return legacy !== undefined ? legacy : fallback;
  }

  function mirrorEnv(primaryKey: string, legacyKey: string): void {
    if (Object.prototype.hasOwnProperty.call(process.env, primaryKey)) {
      process.env[legacyKey] = process.env[primaryKey] ?? "";
    }
  }

  function hydrateCompatibleEnv(): void {
    const mappings = [
      ["HY3_API_KEY", "OPENAI_API_KEY"],
      ["HY3_BASE_URL", "OPENAI_BASE_URL"],
      ["HY3_CHAT_MODEL", "OPENAI_CHAT_MODEL"],
      ["HY3_CHAT_IMAGE_INPUT_ENABLED", "OPENAI_CHAT_IMAGE_INPUT_ENABLED"],
      ["HY3_THINKING_ENABLED", "OPENAI_THINKING_ENABLED"],
      ["HY3_REASONING_EFFORT", "OPENAI_REASONING_EFFORT"],
      ["HY3_REQUEST_TIMEOUT_S", "OPENAI_REQUEST_TIMEOUT_S"],
      ["HY3_CONTEXT_WINDOW_TOKENS", "OPENAI_CONTEXT_WINDOW_TOKENS"],
      ["HY3_MAX_OUTPUT_TOKENS", "OPENAI_MAX_OUTPUT_TOKENS"],
      ["HY3_VISION_BASE_URL", "OPENAI_VISION_BASE_URL"],
      ["HY3_VISION_API_KEY", "OPENAI_VISION_API_KEY"],
      ["HY3_VISION_MODEL", "OPENAI_VISION_MODEL"]
    ] as const;
    for (const [primaryKey, legacyKey] of mappings) mirrorEnv(primaryKey, legacyKey);
  }

  function parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    return /^(1|true|yes|on)$/i.test(value.trim());
  }

  function readTimeoutSeconds(primaryKey: string, legacyKey: string, fallback: number): number {
    const value = Number(readEnvValue(primaryKey, legacyKey, String(fallback)));
    return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
  }

  function load(): AppSettings {
    const envFilePath = existsSync(options.envLocalPath)
      ? options.envLocalPath
      : existsSync(options.envPath)
        ? options.envPath
        : "";
    if (envFilePath) dotenv.config({ path: envFilePath, override: true });
    hydrateCompatibleEnv();

    return {
      theme: (process.env.ARCH_AGENT_THEME as "light" | "dark") || "light",
      runtime: {
        envFilePath,
        configSource: existsSync(options.envLocalPath) ? ".env.local" : existsSync(options.envPath) ? ".env" : "process",
        bundledPython: getBundledPythonRuntimeStatus(options)
      },
      openai: {
        baseUrl: readEnvValue("HY3_BASE_URL", "OPENAI_BASE_URL", "https://tokenhub.tencentmaas.com/v1"),
        visionBaseUrl: readEnvValue("HY3_VISION_BASE_URL", "OPENAI_VISION_BASE_URL", ""),
        chatModel: readEnvValue("HY3_CHAT_MODEL", "OPENAI_CHAT_MODEL", "hy3-preview"),
        chatImageInputEnabled: parseBoolean(readEnvValue("HY3_CHAT_IMAGE_INPUT_ENABLED", "OPENAI_CHAT_IMAGE_INPUT_ENABLED", ""), false),
        visionModel: readEnvValue("HY3_VISION_MODEL", "OPENAI_VISION_MODEL", ""),
        thinkingEnabled: parseBoolean(readEnvValue("HY3_THINKING_ENABLED", "OPENAI_THINKING_ENABLED", ""), false),
        reasoningEffort: readEnvValue("HY3_REASONING_EFFORT", "OPENAI_REASONING_EFFORT", ""),
        requestTimeoutSeconds: readTimeoutSeconds("HY3_REQUEST_TIMEOUT_S", "OPENAI_REQUEST_TIMEOUT_S", 120),
        contextWindowTokens: clampContextWindowTokens(readEnvValue("HY3_CONTEXT_WINDOW_TOKENS", "OPENAI_CONTEXT_WINDOW_TOKENS", "")),
        maxOutputTokens: Number(readEnvValue("HY3_MAX_OUTPUT_TOKENS", "OPENAI_MAX_OUTPUT_TOKENS", "16000")),
        apiKeyConfigured: Boolean(readEnvValue("HY3_API_KEY", "OPENAI_API_KEY", "")),
        visionApiKeyConfigured: Boolean(readEnvValue("HY3_VISION_API_KEY", "OPENAI_VISION_API_KEY", ""))
      },
      hunyuanImage: {
        region: process.env.HY3_IMAGE_REGION?.trim() || "ap-guangzhou",
        resolution: process.env.HY3_IMAGE_RESOLUTION?.trim() || "1024:1024",
        revise: parseBoolean(process.env.HY3_IMAGE_REVISE, true),
        logoAdd: parseBoolean(process.env.HY3_IMAGE_LOGO_ADD, true),
        requestTimeoutSeconds: readTimeoutSeconds("HY3_IMAGE_REQUEST_TIMEOUT_S", "HY3_IMAGE_REQUEST_TIMEOUT_S", 120),
        pollIntervalSeconds: readTimeoutSeconds("HY3_IMAGE_POLL_INTERVAL_S", "HY3_IMAGE_POLL_INTERVAL_S", 3),
        jobTimeoutSeconds: readTimeoutSeconds("HY3_IMAGE_JOB_TIMEOUT_S", "HY3_IMAGE_JOB_TIMEOUT_S", 900),
        secretIdConfigured: Boolean(process.env.TENCENT_SECRET_ID?.trim()),
        secretKeyConfigured: Boolean(process.env.TENCENT_SECRET_KEY?.trim())
      },
      output: {
        autoPdfExport: parseBoolean(process.env.AGENT_AUTO_PDF_EXPORT, false),
        libreOfficePath: process.env.LIBREOFFICE_PATH || ""
      },
      agent: {
        execBashEnabled: parseBoolean(process.env.AGENT_EXEC_BASH_ENABLED, true)
      }
    };
  }

  function save(input: UpdateAppSettingsInput): AppSettings {
    const currentKey = readEnvValue("HY3_API_KEY", "OPENAI_API_KEY", "");
    const currentVisionKey = readEnvValue("HY3_VISION_API_KEY", "OPENAI_VISION_API_KEY", "");
    const currentImageSecretId = process.env.TENCENT_SECRET_ID ?? "";
    const currentImageSecretKey = process.env.TENCENT_SECRET_KEY ?? "";
    const current3dModelVersion = process.env.HY3_3D_MODEL_VERSION?.trim() || "3.0";
    const current3dRegion = process.env.HY3_3D_REGION?.trim() || "ap-guangzhou";
    const current3dFaceCount = process.env.HY3_3D_FACE_COUNT?.trim() || "50000";
    const current3dSubmitTimeout = process.env.HY3_3D_SUBMIT_TIMEOUT_S?.trim() || "120";
    const current3dPollInterval = process.env.HY3_3D_POLL_INTERVAL_S?.trim() || "3";
    const current3dJobTimeout = process.env.HY3_3D_JOB_TIMEOUT_S?.trim() || "900";
    const content = serializeEnvFile([
      { key: "HY3_API_KEY", value: input.openai.apiKey ?? currentKey },
      { key: "HY3_BASE_URL", value: input.openai.baseUrl },
      { key: "HY3_CHAT_MODEL", value: input.openai.chatModel },
      { key: "HY3_3D_MODEL_VERSION", value: current3dModelVersion },
      { key: "HY3_3D_REGION", value: current3dRegion },
      { key: "HY3_3D_FACE_COUNT", value: current3dFaceCount },
      { key: "HY3_3D_SUBMIT_TIMEOUT_S", value: current3dSubmitTimeout },
      { key: "HY3_3D_POLL_INTERVAL_S", value: current3dPollInterval },
      { key: "HY3_3D_JOB_TIMEOUT_S", value: current3dJobTimeout },
      { key: "HY3_CHAT_IMAGE_INPUT_ENABLED", value: input.openai.chatImageInputEnabled },
      { key: "HY3_THINKING_ENABLED", value: input.openai.thinkingEnabled },
      { key: "HY3_REASONING_EFFORT", value: input.openai.reasoningEffort },
      { key: "HY3_REQUEST_TIMEOUT_S", value: input.openai.requestTimeoutSeconds },
      { key: "HY3_CONTEXT_WINDOW_TOKENS", value: clampContextWindowTokens(input.openai.contextWindowTokens) },
      { key: "HY3_MAX_OUTPUT_TOKENS", value: input.openai.maxOutputTokens },
      { key: "HY3_VISION_BASE_URL", value: input.openai.visionBaseUrl },
      { key: "HY3_VISION_API_KEY", value: input.openai.visionApiKey ?? currentVisionKey },
      { key: "HY3_VISION_MODEL", value: input.openai.visionModel },
      { key: "TENCENT_SECRET_ID", value: input.hunyuanImage.secretId ?? currentImageSecretId },
      { key: "TENCENT_SECRET_KEY", value: input.hunyuanImage.secretKey ?? currentImageSecretKey },
      { key: "HY3_IMAGE_REGION", value: input.hunyuanImage.region },
      { key: "HY3_IMAGE_RESOLUTION", value: input.hunyuanImage.resolution },
      { key: "HY3_IMAGE_REVISE", value: input.hunyuanImage.revise },
      { key: "HY3_IMAGE_LOGO_ADD", value: input.hunyuanImage.logoAdd },
      { key: "HY3_IMAGE_REQUEST_TIMEOUT_S", value: input.hunyuanImage.requestTimeoutSeconds },
      { key: "HY3_IMAGE_POLL_INTERVAL_S", value: input.hunyuanImage.pollIntervalSeconds },
      { key: "HY3_IMAGE_JOB_TIMEOUT_S", value: input.hunyuanImage.jobTimeoutSeconds },
      { key: "AGENT_EXEC_BASH_ENABLED", value: input.agent.execBashEnabled },
      { key: "AGENT_AUTO_PDF_EXPORT", value: input.output.autoPdfExport },
      { key: "LIBREOFFICE_PATH", value: input.output.libreOfficePath }
    ]);
    writeFileSync(options.envLocalPath, content, "utf-8");
    dotenv.config({ path: options.envLocalPath, override: true });
    return load();
  }

  return { load, save };
}
