import { describe, expect, it } from "vitest";
import { resolveAssistantDisplayTextOrThrow } from "../../../src/main/agent/piAgentResult";
import type { StreamItem } from "../../../src/shared/types";

describe("piAgentResult", () => {
  it("returns final assistant text when present", () => {
    expect(
      resolveAssistantDisplayTextOrThrow({
        finalText: "  这是最终回复  ",
        assistantContent: ""
      })
    ).toBe("这是最终回复");
  });

  it("throws an explicit error when no visible content is produced", () => {
    const toolItems = new Map<string, StreamItem>([
      [
        "call_1",
        {
          id: "tool_1",
          kind: "tool",
          toolCallId: "call_1",
          toolName: "hy3_mcp_call_tool",
          status: "success",
          createdAt: "2026-06-03T00:00:00.000Z"
        }
      ]
    ]);

    expect(() =>
      resolveAssistantDisplayTextOrThrow({
        finalText: "",
        assistantContent: "",
        toolItems
      })
    ).toThrow(/本轮未返回任何可显示内容/);
  });

  it("throws the model error message when the turn ends in error", () => {
    expect(() =>
      resolveAssistantDisplayTextOrThrow({
        finalText: "部分输出",
        stopReason: "error",
        errorMessage: "rate limit"
      })
    ).toThrow(/rate limit/);
  });

  it("throws an explicit interrupted error when the turn is aborted", () => {
    expect(() =>
      resolveAssistantDisplayTextOrThrow({
        stopReason: "aborted"
      })
    ).toThrow(/本轮生成已中断/);
  });
});
