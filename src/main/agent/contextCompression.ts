/** Calculates context budgets and performs deterministic local message compaction. */
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AppSettings } from "../../shared/types";
import { clampContextWindowTokens } from "../../shared/types";

const MIN_COMPACTION_RESERVE_TOKENS = 4096;
const MAX_COMPACTION_RESERVE_RATIO = 0.45;
const MAX_KEEP_RECENT_TOKENS = 20_000;
const MIN_KEEP_RECENT_TOKENS = 4096;
const MESSAGE_OVERHEAD_TOKENS = 8;
const IMAGE_INPUT_ESTIMATE_TOKENS = 1200;

export interface ContextCompressionSettings {
  contextWindowTokens: number;
  reserveTokens: number;
  keepRecentTokens: number;
  triggerTokens: number;
}

export interface ContextUsageEstimate {
  estimatedTokens: number;
  triggerTokens: number;
  shouldCompact: boolean;
}

export function resolveContextCompressionSettings(settings: AppSettings): ContextCompressionSettings {
  const contextWindowTokens = clampContextWindowTokens(settings.openai.contextWindowTokens);
  const requestedReserve = Math.max(
    MIN_COMPACTION_RESERVE_TOKENS,
    Math.trunc(settings.openai.maxOutputTokens) + 2048,
    Math.trunc(contextWindowTokens * 0.2)
  );
  const reserveTokens = Math.min(requestedReserve, Math.trunc(contextWindowTokens * MAX_COMPACTION_RESERVE_RATIO));
  const triggerTokens = Math.max(MIN_KEEP_RECENT_TOKENS, contextWindowTokens - reserveTokens);
  const keepRecentTokens = Math.min(
    MAX_KEEP_RECENT_TOKENS,
    Math.max(MIN_KEEP_RECENT_TOKENS, Math.trunc(triggerTokens * 0.45))
  );

  return {
    contextWindowTokens,
    reserveTokens,
    keepRecentTokens,
    triggerTokens
  };
}

export function estimateContextUsage(input: {
  messages: AgentMessage[];
  systemPrompt?: string;
  pendingPrompt?: string;
  imageCount?: number;
  additionalTokens?: number;
  settings: ContextCompressionSettings;
}): ContextUsageEstimate {
  const estimatedTokens =
    estimateTextTokens(input.systemPrompt || "") +
    estimateTextTokens(input.pendingPrompt || "") +
    (input.imageCount || 0) * IMAGE_INPUT_ESTIMATE_TOKENS +
    Math.max(0, input.additionalTokens || 0) +
    input.messages.reduce((sum, message) => sum + estimateAgentMessageTokens(message), 0);

  return {
    estimatedTokens,
    triggerTokens: input.settings.triggerTokens,
    shouldCompact: estimatedTokens >= input.settings.triggerTokens
  };
}

export function compactAgentMessagesLocally(
  messages: AgentMessage[],
  settings: Pick<ContextCompressionSettings, "keepRecentTokens" | "reserveTokens">
): AgentMessage[] {
  if (messages.length <= 2) return messages;

  let recentTokens = 0;
  let firstRecentIndex = messages.length;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const messageTokens = estimateAgentMessageTokens(messages[index]);
    if (firstRecentIndex < messages.length && recentTokens + messageTokens > settings.keepRecentTokens) break;
    recentTokens += messageTokens;
    firstRecentIndex = index;
  }

  firstRecentIndex = adjustRecentHistoryStart(messages, firstRecentIndex);
  if (firstRecentIndex <= 0) return messages;

  const olderMessages = messages.slice(0, firstRecentIndex);
  const recentMessages = messages.slice(firstRecentIndex);
  const summary = buildExtractiveHistorySummary(
    olderMessages,
    Math.max(1200, Math.min(settings.reserveTokens * 2, 12_000))
  );
  if (!summary) return recentMessages;

  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            "以下是系统对较早会话的自动压缩摘要，只用于延续上下文。",
            "摘要中的待确认事项仍然是待确认事项，不得推断为已完成事实。",
            "",
            summary
          ].join("\n")
        }
      ],
      timestamp: Date.now()
    },
    ...recentMessages
  ];
}

export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  let cjkChars = 0;
  let otherChars = 0;
  for (const char of text) {
    if (isCjkCharacter(char)) {
      cjkChars += 1;
    } else {
      otherChars += 1;
    }
  }
  return cjkChars + Math.ceil(otherChars / 4);
}

function estimateAgentMessageTokens(message: AgentMessage): number {
  return estimateTextTokens(agentMessageToText(message)) + MESSAGE_OVERHEAD_TOKENS;
}

function adjustRecentHistoryStart(messages: AgentMessage[], startIndex: number): number {
  let adjusted = startIndex;
  while (adjusted < messages.length && messages[adjusted]?.role === "toolResult") {
    adjusted += 1;
  }
  if (adjusted >= messages.length) return startIndex;

  for (let index = adjusted; index >= Math.max(0, adjusted - 3); index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return adjusted;
}

function buildExtractiveHistorySummary(messages: AgentMessage[], maxChars: number): string {
  const entries = messages
    .map((message) => {
      const text = normalizeSummaryText(agentMessageToText(message));
      if (!text) return "";
      const role = message.role === "user" ? "用户" : message.role === "assistant" ? "助手" : "工具";
      const perEntryLimit = message.role === "user" ? 900 : 600;
      return `${role}：${truncateMiddle(text, perEntryLimit)}`;
    })
    .filter(Boolean);
  if (!entries.length) return "";

  const joined = entries.join("\n");
  return truncateMiddle(joined, maxChars);
}

function agentMessageToText(message: AgentMessage): string {
  if (message.role === "user") {
    return contentToText(message.content);
  }
  if (message.role === "assistant") {
    return message.content
      .map((block) => {
        if (block.type === "text") return block.text;
        if (block.type === "thinking") return block.thinking;
        if (block.type === "toolCall") {
          return `调用工具 ${block.name}：${JSON.stringify(block.arguments ?? {})}`;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (message.role === "toolResult") {
    return `${message.toolName}：${contentToText(message.content)}`;
  }

  const record = message as unknown as Record<string, unknown>;
  if (typeof record.summary === "string") return record.summary;
  if (typeof record.content === "string") return record.content;
  return "";
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const record = block as Record<string, unknown>;
      return record.type === "text" && typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeSummaryText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const headChars = Math.max(1, Math.trunc(maxChars * 0.58));
  const tailChars = Math.max(1, maxChars - headChars - 18);
  return `${text.slice(0, headChars)}\n...[已压缩]...\n${text.slice(-tailChars)}`;
}

function isCjkCharacter(char: string): boolean {
  const codePoint = char.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0x2e80 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af)
  );
}
