import { describe, expect, it } from "vitest";
import { groupStreamItemsForDisplay, orderStreamItemsForDisplay } from "../../../../src/renderer/src/features/chat/streamOrdering";
import type { StreamItem } from "../../../../src/shared/types";

describe("streamOrdering", () => {
  it("keeps tool outputs above the assistant reply within a turn", () => {
    const items: StreamItem[] = [
      message("user_1", "user", "生成分析报告"),
      tool("tool_1", "time"),
      message("assistant_1", "assistant", "正在生成回复"),
      tool("tool_2", "send_file"),
      file("file_1")
    ];

    expect(orderStreamItemsForDisplay(items).map((item) => item.id)).toEqual([
      "user_1",
      "tool_1",
      "tool_2",
      "file_1",
      "assistant_1"
    ]);
  });

  it("does not move tool outputs across user turns", () => {
    const items: StreamItem[] = [
      message("user_1", "user", "你好"),
      tool("tool_1", "time"),
      message("assistant_1", "assistant", "你好"),
      message("user_2", "user", "生成分析报告"),
      message("assistant_2", "assistant", "报告正文"),
      tool("tool_2", "send_file")
    ];

    expect(orderStreamItemsForDisplay(items).map((item) => item.id)).toEqual([
      "user_1",
      "tool_1",
      "assistant_1",
      "user_2",
      "tool_2",
      "assistant_2"
    ]);
  });

  it("hides internal OpenAI tool planning rows from the chat transcript", () => {
    const items: StreamItem[] = [
      message("user_1", "user", "文件发送给我啊"),
      tool("planner_1", "openai.chat.tools"),
      tool("tool_1", "send_file"),
      message("assistant_1", "assistant", "文件已发送")
    ];

    expect(orderStreamItemsForDisplay(items).map((item) => item.id)).toEqual(["user_1", "tool_1", "assistant_1"]);
  });

  it("groups process items into a card before the final assistant reply", () => {
    const items: StreamItem[] = [
      message("user_1", "user", "生成分析报告"),
      tool("tool_1", "send_file"),
      stage("stage_1", "图表已生成"),
      file("file_1"),
      message("assistant_1", "assistant", "阶段性文件已发送")
    ];

    expect(groupStreamItemsForDisplay(items)).toMatchObject([
      { kind: "message", id: "user_1" },
      { kind: "process", id: "process_tool_1", items: [{ id: "tool_1" }, { id: "stage_1" }, { id: "file_1" }] },
      { kind: "message", id: "assistant_1" }
    ]);
  });

  it("keeps intermediate assistant notes inside the process card", () => {
    const items: StreamItem[] = [
      message("user_1", "user", "生成分析报告"),
      message("assistant_note", "assistant", "我先读取数据并规划图表。"),
      tool("tool_1", "read_file"),
      stage("stage_1", "图表批次已规划"),
      message("assistant_final", "assistant", "阶段性文件已发送")
    ];

    expect(groupStreamItemsForDisplay(items)).toMatchObject([
      { kind: "message", id: "user_1" },
      {
        kind: "process",
        id: "process_assistant_note",
        items: [{ id: "assistant_note" }, { id: "tool_1" }, { id: "stage_1" }]
      },
      { kind: "message", id: "assistant_final" }
    ]);
  });

  it("does not promote an assistant note when a later tool has no final reply", () => {
    const items: StreamItem[] = [
      message("user_1", "user", "生成分析报告"),
      message("assistant_note", "assistant", "我先读取数据。"),
      tool("tool_1", "read_file")
    ];

    expect(groupStreamItemsForDisplay(items)).toMatchObject([
      { kind: "message", id: "user_1" },
      { kind: "process", id: "process_assistant_note", items: [{ id: "assistant_note" }, { id: "tool_1" }] }
    ]);
  });

  it("does not render hidden planning or empty assistant blocks", () => {
    const items: StreamItem[] = [
      message("user_1", "user", "继续"),
      tool("planner_1", "openai.chat.tools"),
      emptyAssistant("assistant_empty"),
      tool("tool_1", "send_file")
    ];

    expect(groupStreamItemsForDisplay(items).map((block) => block.id)).toEqual(["user_1", "process_tool_1"]);
  });
});

function message(id: string, role: "user" | "assistant", content: string): StreamItem {
  return {
    id,
    kind: "message",
    role,
    content,
    isFinished: true,
    createdAt: "2026-05-23T00:00:00.000Z"
  };
}

function tool(id: string, toolName: string): StreamItem {
  return {
    id,
    kind: "tool",
    toolCallId: `${id}_call`,
    toolName,
    status: "success",
    summary: "完成",
    createdAt: "2026-05-23T00:00:00.000Z"
  };
}

function file(id: string): StreamItem {
  return {
    id,
    kind: "file",
    artifactId: `${id}_artifact`,
    name: "分析报告.md",
    fileKind: "md",
    createdAt: "2026-05-23T00:00:00.000Z"
  };
}

function stage(id: string, title: string): StreamItem {
  return {
    id,
    kind: "stage",
    title,
    createdAt: "2026-05-23T00:00:00.000Z"
  };
}

function emptyAssistant(id: string): StreamItem {
  return {
    id,
    kind: "message",
    role: "assistant",
    content: "",
    isFinished: true,
    createdAt: "2026-05-23T00:00:00.000Z"
  };
}
