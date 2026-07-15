/** Loads and persists user settings while maintaining Hy3/OpenAI environment compatibility. */
import { existsSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
import {
  IMAGE_GENERATION_REQUEST_TIMEOUT_DEFAULT_MS,
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
      ["HY3_REQUEST_TIMEOUT_MS", "OPENAI_REQUEST_TIMEOUT_MS"],
      ["HY3_CONTEXT_WINDOW_TOKENS", "OPENAI_CONTEXT_WINDOW_TOKENS"],
      ["HY3_MAX_OUTPUT_TOKENS", "OPENAI_MAX_OUTPUT_TOKENS"],
      ["HY3_IMAGE_BASE_URL", "OPENAI_IMAGE_BASE_URL"],
      ["HY3_VISION_BASE_URL", "OPENAI_VISION_BASE_URL"],
      ["HY3_IMAGE_API_KEY", "OPENAI_IMAGE_API_KEY"],
      ["HY3_VISION_API_KEY", "OPENAI_VISION_API_KEY"],
      ["HY3_IMAGE_MODEL", "OPENAI_IMAGE_MODEL"],
      ["HY3_VISION_MODEL", "OPENAI_VISION_MODEL"],
      ["HY3_IMAGE_SIZE", "OPENAI_IMAGE_SIZE"],
      ["HY3_IMAGE_QUALITY", "OPENAI_IMAGE_QUALITY"],
      ["HY3_AUTO_IMAGE_GENERATION", "OPENAI_AUTO_IMAGE_GENERATION"],
      ["HY3_IMAGE_REQUEST_TIMEOUT_MS", "OPENAI_IMAGE_REQUEST_TIMEOUT_MS"]
    ] as const;
    for (const [primaryKey, legacyKey] of mappings) mirrorEnv(primaryKey, legacyKey);
  }

  function parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined) return fallback;
    return /^(1|true|yes|on)$/i.test(value.trim());
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
        imageBaseUrl: readEnvValue("HY3_IMAGE_BASE_URL", "OPENAI_IMAGE_BASE_URL", ""),
        visionBaseUrl: readEnvValue("HY3_VISION_BASE_URL", "OPENAI_VISION_BASE_URL", ""),
        chatModel: readEnvValue("HY3_CHAT_MODEL", "OPENAI_CHAT_MODEL", "hy3-preview"),
        chatImageInputEnabled: parseBoolean(readEnvValue("HY3_CHAT_IMAGE_INPUT_ENABLED", "OPENAI_CHAT_IMAGE_INPUT_ENABLED", ""), false),
        imageModel: readEnvValue("HY3_IMAGE_MODEL", "OPENAI_IMAGE_MODEL", ""),
        visionModel: readEnvValue("HY3_VISION_MODEL", "OPENAI_VISION_MODEL", ""),
        imageSize: readEnvValue("HY3_IMAGE_SIZE", "OPENAI_IMAGE_SIZE", "1536x1024"),
        imageQuality: readEnvValue("HY3_IMAGE_QUALITY", "OPENAI_IMAGE_QUALITY", "high"),
        autoImageGeneration: parseBoolean(readEnvValue("HY3_AUTO_IMAGE_GENERATION", "OPENAI_AUTO_IMAGE_GENERATION", ""), false),
        thinkingEnabled: parseBoolean(readEnvValue("HY3_THINKING_ENABLED", "OPENAI_THINKING_ENABLED", ""), false),
        reasoningEffort: readEnvValue("HY3_REASONING_EFFORT", "OPENAI_REASONING_EFFORT", ""),
        requestTimeoutMs: Number(readEnvValue("HY3_REQUEST_TIMEOUT_MS", "OPENAI_REQUEST_TIMEOUT_MS", "120000")),
        imageRequestTimeoutMs: Number(readEnvValue("HY3_IMAGE_REQUEST_TIMEOUT_MS", "OPENAI_IMAGE_REQUEST_TIMEOUT_MS", String(IMAGE_GENERATION_REQUEST_TIMEOUT_DEFAULT_MS))),
        contextWindowTokens: clampContextWindowTokens(readEnvValue("HY3_CONTEXT_WINDOW_TOKENS", "OPENAI_CONTEXT_WINDOW_TOKENS", "")),
        maxOutputTokens: Number(readEnvValue("HY3_MAX_OUTPUT_TOKENS", "OPENAI_MAX_OUTPUT_TOKENS", "16000")),
        apiKeyConfigured: Boolean(readEnvValue("HY3_API_KEY", "OPENAI_API_KEY", "")),
        imageApiKeyConfigured: Boolean(readEnvValue("HY3_IMAGE_API_KEY", "OPENAI_IMAGE_API_KEY", "")),
        visionApiKeyConfigured: Boolean(readEnvValue("HY3_VISION_API_KEY", "OPENAI_VISION_API_KEY", ""))
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
    const currentImageKey = readEnvValue("HY3_IMAGE_API_KEY", "OPENAI_IMAGE_API_KEY", "");
    const currentVisionKey = readEnvValue("HY3_VISION_API_KEY", "OPENAI_VISION_API_KEY", "");
    const content = serializeEnvFile([
      { key: "HY3_API_KEY", value: input.openai.apiKey ?? currentKey },
      { key: "HY3_BASE_URL", value: input.openai.baseUrl },
      { key: "HY3_CHAT_MODEL", value: input.openai.chatModel },
      { key: "HY3_CHAT_IMAGE_INPUT_ENABLED", value: input.openai.chatImageInputEnabled },
      { key: "HY3_THINKING_ENABLED", value: input.openai.thinkingEnabled },
      { key: "HY3_REASONING_EFFORT", value: input.openai.reasoningEffort },
      { key: "HY3_REQUEST_TIMEOUT_MS", value: input.openai.requestTimeoutMs },
      { key: "HY3_CONTEXT_WINDOW_TOKENS", value: clampContextWindowTokens(input.openai.contextWindowTokens) },
      { key: "HY3_MAX_OUTPUT_TOKENS", value: input.openai.maxOutputTokens },
      { key: "HY3_IMAGE_BASE_URL", value: input.openai.imageBaseUrl },
      { key: "HY3_VISION_BASE_URL", value: input.openai.visionBaseUrl },
      { key: "HY3_IMAGE_API_KEY", value: input.openai.imageApiKey ?? currentImageKey },
      { key: "HY3_VISION_API_KEY", value: input.openai.visionApiKey ?? currentVisionKey },
      { key: "HY3_IMAGE_MODEL", value: input.openai.imageModel },
      { key: "HY3_VISION_MODEL", value: input.openai.visionModel },
      { key: "HY3_IMAGE_SIZE", value: input.openai.imageSize },
      { key: "HY3_IMAGE_QUALITY", value: input.openai.imageQuality },
      { key: "HY3_AUTO_IMAGE_GENERATION", value: input.openai.autoImageGeneration },
      { key: "HY3_IMAGE_REQUEST_TIMEOUT_MS", value: input.openai.imageRequestTimeoutMs },
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
