import { describe, expect, it, vi } from "vitest";
import { createRendererEventBus } from "../../../src/main/app/rendererEventBus";
import type { RendererEvent, StreamItem } from "../../../src/shared/types";

describe("renderer event bus", () => {
  it("maps stream state to ArchAgent response events", () => {
    const broadcast = vi.fn<(event: RendererEvent) => void>();
    const bus = createRendererEventBus({
      createId: (prefix) => `${prefix}_1`,
      broadcast
    });
    const sessionId = "session_1";
    const message: Extract<StreamItem, { kind: "message" }> = {
      id: "message_1",
      kind: "message",
      role: "assistant",
      content: "正在处理",
      isFinished: false,
      createdAt: "2026-05-23T00:00:00.000Z"
    };
    const failedTool: Extract<StreamItem, { kind: "tool" }> = {
      id: "tool_1",
      kind: "tool",
      toolCallId: "call_1",
      toolName: "read_file",
      status: "failed",
      summary: "读取失败",
      createdAt: "2026-05-23T00:00:01.000Z"
    };

    bus.sendResponseItemCreated(sessionId, message);
    bus.sendResponseItemUpdated(sessionId, { ...message, isFinished: true });
    bus.sendResponseItemUpdated(sessionId, failedTool);
    bus.sendTurnStatus(sessionId, "failed");

    expect(broadcast.mock.calls.map(([event]) => event.type)).toEqual([
      "agent.message.created",
      "agent.message.completed",
      "agent.tool.failed",
      "agent.turn.failed"
    ]);
  });
});
