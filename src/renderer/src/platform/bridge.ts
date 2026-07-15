/** Resolves the isolated preload API and formats unknown renderer errors. */
import type { ArchAgentApi } from "../../../shared/types";

export interface BridgeResolution {
  api?: ArchAgentApi;
  error?: string;
}

const REQUIRED_BRIDGE_METHODS = [
  "app.getMetadata",
  "session.list",
  "session.create",
  "chat.prompt",
  "attachment.pick",
  "artifact.list",
  "settings.get",
  "scene.getSnapshot",
  "events.subscribe"
] as const;

export function resolveArchAgentApi(source: unknown): BridgeResolution {
  if (!isRecord(source)) {
    return {
      error: "Electron 预加载桥未注入。请通过 Electron 应用启动，不要直接在浏览器打开页面。"
    };
  }

  const missing = REQUIRED_BRIDGE_METHODS.filter((path) => !isFunctionAtPath(source, path));
  if (missing.length) {
    return {
      error: `Electron 预加载桥不完整，缺少接口：${missing.join("、")}。请重启开发服务或重新打包应用。`
    };
  }

  return { api: source as unknown as ArchAgentApi };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "操作失败，请稍后重试。";
}

function isFunctionAtPath(source: Record<string, unknown>, path: string): boolean {
  let current: unknown = source;
  for (const segment of path.split(".")) {
    if (!isRecord(current)) return false;
    current = current[segment];
  }
  return typeof current === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
