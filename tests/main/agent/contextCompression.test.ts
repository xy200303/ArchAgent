import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  compactAgentMessagesLocally,
  estimateContextUsage,
  estimateTextTokens,
  resolveContextCompressionSettings
} from "../../../src/main/agent/contextCompression";
import type { AppSettings } from "../../../src/shared/types";

describe("contextCompression", () => {
  it("uses a 256k context window and reserves output capacity before compression", () => {
    const compression = resolveContextCompressionSettings(createSettings());

    expect(compression.contextWindowTokens).toBe(256000);
    expect(compression.reserveTokens).toBe(51200);
    expect(compression.triggerTokens).toBe(204800);
    expect(compression.keepRecentTokens).toBe(20000);
  });

  it("estimates Chinese text conservatively and triggers before the configured window is full", () => {
    const settings = resolveContextCompressionSettings(createSettings());
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: "场景建模事实".repeat(40000),
        timestamp: Date.now()
      }
    ];
    const usage = estimateContextUsage({
      messages,
      systemPrompt: "系统提示".repeat(1000),
      pendingPrompt: "继续",
      additionalTokens: 5000,
      settings
    });

    expect(estimateTextTokens("场景建模报告")).toBe(6);
    expect(usage.shouldCompact).toBe(true);
    expect(usage.estimatedTokens).toBeGreaterThan(usage.triggerTokens);
  });

  it("falls back to an extractive summary while preserving the newest turn", () => {
    const messages: AgentMessage[] = Array.from({ length: 12 }, (_, index) => ({
      role: "user" as const,
      content: `第${index + 1}轮事实：${"已确认内容".repeat(500)}`,
      timestamp: Date.now() + index
    }));
    const compacted = compactAgentMessagesLocally(messages, {
      keepRecentTokens: 3500,
      reserveTokens: 4096
    });
    const firstContent = compacted[0]?.role === "user" ? compacted[0].content : "";
    const lastContent = compacted.at(-1)?.role === "user" ? compacted.at(-1)?.content : "";

    expect(compacted.length).toBeLessThan(messages.length);
    expect(JSON.stringify(firstContent)).toContain("自动压缩摘要");
    expect(JSON.stringify(lastContent)).toContain("第12轮事实");
  });
});

function createSettings(): AppSettings {
  return {
    runtime: {
      envFilePath: "",
      configSource: "process",
      bundledPython: {
        available: false
      }
    },
    openai: {
      baseUrl: "https://api.openai.com/v1",
      chatModel: "gpt-5.5",
      thinkingEnabled: true,
      reasoningEffort: "",
      requestTimeoutSeconds: 120,
      contextWindowTokens: 256000,
      maxOutputTokens: 16000,
      apiKeyConfigured: false
    },
    tokenHubImage: {
      endpoint: "https://tokenhub.tencentmaas.com/v1/api/image/lite",
      model: "hy-image-v3.0",
      requestTimeoutSeconds: 300
    },
    output: {
      autoPdfExport: false,
      libreOfficePath: ""
    },
    agent: {
      execBashEnabled: false
    }
  };
}
