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
        chatModel: readEnvValue("HY3_CHAT_MODEL", "OPENAI_CHAT_MODEL", "hy3-preview"),
        thinkingEnabled: parseBoolean(readEnvValue("HY3_THINKING_ENABLED", "OPENAI_THINKING_ENABLED", ""), false),
        reasoningEffort: readEnvValue("HY3_REASONING_EFFORT", "OPENAI_REASONING_EFFORT", ""),
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
    const current3dModel = process.env.HY3_3D_MODEL?.trim() || "hy-3d-3.0";
    const current3dSubmitEndpoint = process.env.HY3_3D_SUBMIT_ENDPOINT?.trim() || "https://tokenhub.tencentmaas.com/v1/api/3d/submit";
    const current3dQueryEndpoint = process.env.HY3_3D_QUERY_ENDPOINT?.trim() || "https://tokenhub.tencentmaas.com/v1/api/3d/query";
    const current3dFaceCount = process.env.HY3_3D_FACE_COUNT?.trim() || "50000";
    const current3dSubmitTimeout = process.env.HY3_3D_SUBMIT_TIMEOUT_S?.trim() || "120";
    const current3dPollInterval = process.env.HY3_3D_POLL_INTERVAL_S?.trim() || "3";
    const current3dJobTimeout = process.env.HY3_3D_JOB_TIMEOUT_S?.trim() || "900";
    const content = serializeEnvFile([
      { key: "HY3_API_KEY", value: input.openai.apiKey ?? currentKey },
      { key: "HY3_BASE_URL", value: input.openai.baseUrl },
      { key: "HY3_CHAT_MODEL", value: input.openai.chatModel },
      { key: "HY3_3D_MODEL", value: current3dModel },
      { key: "HY3_3D_SUBMIT_ENDPOINT", value: current3dSubmitEndpoint },
      { key: "HY3_3D_QUERY_ENDPOINT", value: current3dQueryEndpoint },
      { key: "HY3_3D_FACE_COUNT", value: current3dFaceCount },
      { key: "HY3_3D_SUBMIT_TIMEOUT_S", value: current3dSubmitTimeout },
      { key: "HY3_3D_POLL_INTERVAL_S", value: current3dPollInterval },
      { key: "HY3_3D_JOB_TIMEOUT_S", value: current3dJobTimeout },
      { key: "HY3_THINKING_ENABLED", value: input.openai.thinkingEnabled },
      { key: "HY3_REASONING_EFFORT", value: input.openai.reasoningEffort },
      { key: "HY3_REQUEST_TIMEOUT_S", value: input.openai.requestTimeoutSeconds },
      { key: "HY3_CONTEXT_WINDOW_TOKENS", value: clampContextWindowTokens(input.openai.contextWindowTokens) },
      { key: "HY3_MAX_OUTPUT_TOKENS", value: input.openai.maxOutputTokens },
      { key: "HY3_IMAGE_ENDPOINT", value: input.tokenHubImage.endpoint },
      { key: "HY3_IMAGE_MODEL", value: input.tokenHubImage.model },
      { key: "HY3_IMAGE_REQUEST_TIMEOUT_S", value: input.tokenHubImage.requestTimeoutSeconds },
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
