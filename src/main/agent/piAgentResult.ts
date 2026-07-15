/** Normalizes final assistant output from Pi Agent stream items. */
import type { StreamItem } from "../../shared/types";

export function resolveAssistantDisplayTextOrThrow(options: {
  finalText?: string;
  assistantContent?: string;
  toolItems?: Map<string, StreamItem>;
  stopReason?: "stop" | "length" | "toolUse" | "error" | "aborted";
  errorMessage?: string;
}): string {
  const suffix = buildRecentToolSuffix(options.toolItems);
  const errorMessage = options.errorMessage?.trim() || "";

  if (options.stopReason === "aborted") {
    throw new Error(`本轮生成已中断${errorMessage ? `：${errorMessage}` : ""}。${suffix}`.trim());
  }

  if (options.stopReason === "error" || errorMessage) {
    throw new Error(`模型返回错误${errorMessage ? `：${errorMessage}` : ""}。${suffix}`.trim());
  }

  const finalText = options.finalText?.trim() || options.assistantContent?.trim() || "";
  if (finalText) return finalText;

  if (options.stopReason === "length") {
    throw new Error(`模型输出达到长度上限，但未返回任何可显示内容。${suffix}`.trim());
  }

  throw new Error(`本轮未返回任何可显示内容，请重试并查看过程记录或模型配置。${suffix}`.trim());
}

function buildRecentToolSuffix(toolItems?: Map<string, StreamItem>): string {
  const toolNames = Array.from(toolItems?.values() ?? [])
    .filter((item): item is Extract<StreamItem, { kind: "tool" }> => item.kind === "tool")
    .map((item) => item.toolName);
  return toolNames.length ? ` 最近工具：${Array.from(new Set(toolNames)).join("、")}。` : "";
}
