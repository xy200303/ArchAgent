/** Loads and persists user settings while maintaining Hy3/OpenAI environment compatibility. */
import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  reset(): AppSettings;
}

export function createSettingsService(options: {
  envLocalPath: string;
  envPath: string;
  projectRootDir: string;
  resourcesDir?: string;
  initializeDefaultEnv?: boolean;
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
      ["HY3_THINKING_ENABLED", "OPENAI_THINKING_ENABLED"],
      ["HY3_REASONING_EFFORT", "OPENAI_REASONING_EFFORT"],
      ["HY3_REQUEST_TIMEOUT_S", "OPENAI_REQUEST_TIMEOUT_S"],
      ["HY3_CONTEXT_WINDOW_TOKENS", "OPENAI_CONTEXT_WINDOW_TOKENS"],
      ["HY3_MAX_OUTPUT_TOKENS", "OPENAI_MAX_OUTPUT_TOKENS"],
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

  function readPositiveInteger(key: string, fallback: number, min: number, max: number): number {
    const value = Number(process.env[key]);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(value)));
  }

  function writeDefaultEnv(): void {
    const templatePath = options.initializeDefaultEnv
      ? options.envPath
      : join(options.projectRootDir, ".env.example");
    if (existsSync(templatePath)) {
      copyFileSync(templatePath, options.envLocalPath);
      return;
    }
    writeFileSync(options.envLocalPath, serializeEnvFile([
      { key: "ARCH_AGENT_THEME", value: "dark" },
      { key: "HY3_API_KEY", value: "" },
      { key: "HY3_BASE_URL", value: "https://tokenhub.tencentmaas.com/v1" },
      { key: "HY3_CHAT_MODEL", value: "hy3" },
      { key: "HY3_THINKING_ENABLED", value: false },
      { key: "HY3_REASONING_EFFORT", value: "high" },
      { key: "HY3_REQUEST_TIMEOUT_S", value: 120 },
      { key: "HY3_CONTEXT_WINDOW_TOKENS", value: 256000 },
      { key: "HY3_MAX_OUTPUT_TOKENS", value: 16000 },
      { key: "HY3_IMAGE_ENDPOINT", value: "https://tokenhub.tencentmaas.com/v1/api/image/lite" },
      { key: "HY3_IMAGE_MODEL", value: "hy-image-v3.0" },
      { key: "HY3_IMAGE_REQUEST_TIMEOUT_S", value: 300 },
      { key: "HY3_3D_SUBMIT_ENDPOINT", value: "https://tokenhub.tencentmaas.com/v1/api/3d/submit" },
      { key: "HY3_3D_QUERY_ENDPOINT", value: "https://tokenhub.tencentmaas.com/v1/api/3d/query" },
      { key: "HY3_3D_MODEL", value: "hy-3d-3.0" },
      { key: "HY3_3D_FACE_COUNT", value: 50000 },
      { key: "HY3_3D_SUBMIT_TIMEOUT_S", value: 120 },
      { key: "HY3_3D_POLL_INTERVAL_S", value: 3 },
      { key: "HY3_3D_JOB_TIMEOUT_S", value: 900 },
      { key: "AGENT_EXEC_BASH_ENABLED", value: false },
      { key: "AGENT_SCRIPT_TIMEOUT_S", value: 60 },
      { key: "AGENT_AUTO_PDF_EXPORT", value: false },
      { key: "LIBREOFFICE_PATH", value: "" }
    ]), "utf-8");
  }

  function initializeDefaultEnv(): void {
    if (!options.initializeDefaultEnv || existsSync(options.envLocalPath)) return;
    writeDefaultEnv();
  }

  function load(): AppSettings {
    initializeDefaultEnv();
    const envFilePath = existsSync(options.envLocalPath)
      ? options.envLocalPath
      : existsSync(options.envPath)
        ? options.envPath
        : "";
    if (envFilePath) dotenv.config({ path: envFilePath, override: true });
    hydrateCompatibleEnv();

    return {
      theme: (process.env.ARCH_AGENT_THEME as "light" | "dark") || "dark",
      runtime: {
        envFilePath,
        configSource: existsSync(options.envLocalPath) ? ".env.local" : existsSync(options.envPath) ? ".env" : "process",
        bundledPython: getBundledPythonRuntimeStatus(options)
      },
      openai: {
        baseUrl: readEnvValue("HY3_BASE_URL", "OPENAI_BASE_URL", "https://tokenhub.tencentmaas.com/v1"),
        chatModel: readEnvValue("HY3_CHAT_MODEL", "OPENAI_CHAT_MODEL", "hy3-preview"),
        thinkingEnabled: parseBoolean(readEnvValue("HY3_THINKING_ENABLED", "OPENAI_THINKING_ENABLED", ""), false),
        reasoningEffort: readEnvValue("HY3_REASONING_EFFORT", "OPENAI_REASONING_EFFORT", "high"),
        requestTimeoutSeconds: readTimeoutSeconds("HY3_REQUEST_TIMEOUT_S", "OPENAI_REQUEST_TIMEOUT_S", 120),
        contextWindowTokens: clampContextWindowTokens(readEnvValue("HY3_CONTEXT_WINDOW_TOKENS", "OPENAI_CONTEXT_WINDOW_TOKENS", "")),
        maxOutputTokens: Number(readEnvValue("HY3_MAX_OUTPUT_TOKENS", "OPENAI_MAX_OUTPUT_TOKENS", "16000")),
        apiKeyConfigured: Boolean(readEnvValue("HY3_API_KEY", "OPENAI_API_KEY", "")),
      },
      tokenHubImage: {
        endpoint: process.env.HY3_IMAGE_ENDPOINT?.trim() || "https://tokenhub.tencentmaas.com/v1/api/image/lite",
        model: process.env.HY3_IMAGE_MODEL?.trim() || "hy-image-v3.0",
        requestTimeoutSeconds: readTimeoutSeconds("HY3_IMAGE_REQUEST_TIMEOUT_S", "HY3_IMAGE_REQUEST_TIMEOUT_S", 300)
      },
      tokenHub3d: {
        submitEndpoint: process.env.HY3_3D_SUBMIT_ENDPOINT?.trim() || "https://tokenhub.tencentmaas.com/v1/api/3d/submit",
        queryEndpoint: process.env.HY3_3D_QUERY_ENDPOINT?.trim() || "https://tokenhub.tencentmaas.com/v1/api/3d/query",
        model: process.env.HY3_3D_MODEL?.trim() || "hy-3d-3.0",
        faceCount: readPositiveInteger("HY3_3D_FACE_COUNT", 50000, 3000, 150000),
        submitTimeoutSeconds: readPositiveInteger("HY3_3D_SUBMIT_TIMEOUT_S", 120, 1, 3600),
        pollIntervalSeconds: readPositiveInteger("HY3_3D_POLL_INTERVAL_S", 3, 1, 300),
        jobTimeoutSeconds: readPositiveInteger("HY3_3D_JOB_TIMEOUT_S", 900, 1, 21600)
      },
      output: {
        autoPdfExport: parseBoolean(process.env.AGENT_AUTO_PDF_EXPORT, false),
        libreOfficePath: process.env.LIBREOFFICE_PATH || ""
      },
      agent: {
        execBashEnabled: parseBoolean(process.env.AGENT_EXEC_BASH_ENABLED, false),
        scriptTimeoutSeconds: readPositiveInteger("AGENT_SCRIPT_TIMEOUT_S", 60, 1, 600)
      }
    };
  }

  function save(input: UpdateAppSettingsInput): AppSettings {
    const currentKey = readEnvValue("HY3_API_KEY", "OPENAI_API_KEY", "");
    const content = serializeEnvFile([
      { key: "ARCH_AGENT_THEME", value: input.theme },
      { key: "HY3_API_KEY", value: input.openai.apiKey ?? currentKey },
      { key: "HY3_BASE_URL", value: input.openai.baseUrl },
      { key: "HY3_CHAT_MODEL", value: input.openai.chatModel },
      { key: "HY3_3D_MODEL", value: input.tokenHub3d.model },
      { key: "HY3_3D_SUBMIT_ENDPOINT", value: input.tokenHub3d.submitEndpoint },
      { key: "HY3_3D_QUERY_ENDPOINT", value: input.tokenHub3d.queryEndpoint },
      { key: "HY3_3D_FACE_COUNT", value: input.tokenHub3d.faceCount },
      { key: "HY3_3D_SUBMIT_TIMEOUT_S", value: input.tokenHub3d.submitTimeoutSeconds },
      { key: "HY3_3D_POLL_INTERVAL_S", value: input.tokenHub3d.pollIntervalSeconds },
      { key: "HY3_3D_JOB_TIMEOUT_S", value: input.tokenHub3d.jobTimeoutSeconds },
      { key: "HY3_THINKING_ENABLED", value: input.openai.thinkingEnabled },
      { key: "HY3_REASONING_EFFORT", value: input.openai.reasoningEffort },
      { key: "HY3_REQUEST_TIMEOUT_S", value: input.openai.requestTimeoutSeconds },
      { key: "HY3_CONTEXT_WINDOW_TOKENS", value: clampContextWindowTokens(input.openai.contextWindowTokens) },
      { key: "HY3_MAX_OUTPUT_TOKENS", value: input.openai.maxOutputTokens },
      { key: "HY3_IMAGE_ENDPOINT", value: input.tokenHubImage.endpoint },
      { key: "HY3_IMAGE_MODEL", value: input.tokenHubImage.model },
      { key: "HY3_IMAGE_REQUEST_TIMEOUT_S", value: input.tokenHubImage.requestTimeoutSeconds },
      { key: "AGENT_EXEC_BASH_ENABLED", value: input.agent.execBashEnabled },
      { key: "AGENT_SCRIPT_TIMEOUT_S", value: input.agent.scriptTimeoutSeconds },
      { key: "AGENT_AUTO_PDF_EXPORT", value: input.output.autoPdfExport },
      { key: "LIBREOFFICE_PATH", value: input.output.libreOfficePath }
    ]);
    writeFileSync(options.envLocalPath, content, "utf-8");
    dotenv.config({ path: options.envLocalPath, override: true });
    return load();
  }

  function reset(): AppSettings {
    writeDefaultEnv();
    dotenv.config({ path: options.envLocalPath, override: true });
    return load();
  }

  return { load, save, reset };
}
