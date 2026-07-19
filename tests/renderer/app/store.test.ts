import { beforeEach, describe, expect, it } from "vitest";
import {
  addAttachments,
  applyRendererEvent,
  clearComposer,
  setArtifacts,
  setComposer,
  setCurrentProject,
  setCurrentSession,
  setSessions,
  store
} from "../../../src/renderer/src/app/store";
import type { ChatSession, ProjectInfo, RendererEvent } from "../../../src/shared/types";

const TEST_PROJECT: ProjectInfo = { path: "C:/projects/test", name: "test" };

describe("renderer store", () => {
  beforeEach(() => {
    store.dispatch(setSessions([]));
    store.dispatch(setArtifacts([]));
    store.dispatch(setCurrentProject(TEST_PROJECT));
  });

  it("selects the first available session when the current session disappears", () => {
    const first = makeSession("session_a", "A");
    const second = makeSession("session_b", "B");

    store.dispatch(setSessions([first, second]));
    store.dispatch(setCurrentSession(second.id));
    store.dispatch(setSessions([first]));

    expect(store.getState().chat.currentSessionId).toBe(first.id);
  });

  it("applies session.deleted events and keeps the sidebar selection valid", () => {
    const first = makeSession("session_a", "A");
    const second = {
      ...makeSession("session_b", "B"),
      items: [
        {
          id: "file_1",
          kind: "file",
          artifactId: "artifact_1",
          name: "分析报告.md",
          fileKind: "md",
          createdAt: "2026-05-23T00:01:00.000Z"
        } as const
      ]
    };
    const event: RendererEvent = {
      id: "event_1",
      type: "session.deleted",
      sessionId: second.id
    };

    store.dispatch(setSessions([first, second]));
    store.dispatch(
      setArtifacts([
        {
          id: "artifact_1",
          name: "分析报告.md",
          kind: "md",
          path: "C:/tmp/分析报告.md",
          size: 2048,
          createdAt: "2026-05-23T00:01:00.000Z"
        }
      ])
    );
    store.dispatch(setCurrentSession(second.id));
    store.dispatch(applyRendererEvent(event));

    expect(store.getState().chat.sessions.map((session) => session.id)).toEqual([first.id]);
    expect(store.getState().chat.artifacts).toEqual([]);
    expect(store.getState().chat.currentSessionId).toBe(first.id);
  });

  it("records created artifacts with their owning session", () => {
    const session = makeSession("session_a", "A");
    const event: RendererEvent = {
      id: "event_2",
      type: "artifact.created",
      sessionId: "session_a",
      payload: {
        id: "artifact_1",
        name: "分析报告.md",
        kind: "md",
        path: "C:/tmp/分析报告.md",
        size: 2048,
        createdAt: "2026-05-23T00:01:00.000Z"
      }
    };

    store.dispatch(setSessions([session]));
    store.dispatch(applyRendererEvent(event));

    expect(store.getState().chat.artifacts).toEqual([{ ...event.payload, sessionId: "session_a" }]);
    expect(store.getState().chat.sessions[0]?.items).toEqual([
      {
        id: "file_artifact_1",
        kind: "file",
        artifactId: "artifact_1",
        name: "分析报告.md",
        fileKind: "md",
        createdAt: "2026-05-23T00:01:00.000Z"
      }
    ]);
  });

  it("deduplicates file stream items when artifact and stream events arrive out of order", () => {
    const session = makeSession("session_a", "A");
    const artifactEvent: RendererEvent = {
      id: "event_2",
      type: "artifact.created",
      sessionId: session.id,
      payload: {
        id: "artifact_1",
        name: "分析报告.md",
        kind: "md",
        path: "C:/tmp/分析报告.md",
        size: 2048,
        createdAt: "2026-05-23T00:01:00.000Z"
      }
    };
    const streamEvent: RendererEvent = {
      id: "event_3",
      type: "agent.file.created",
      sessionId: session.id,
      payload: {
        id: "file_1",
        kind: "file",
        artifactId: "artifact_1",
        name: "分析报告.md",
        fileKind: "md",
        createdAt: "2026-05-23T00:01:01.000Z"
      }
    };

    store.dispatch(setSessions([session]));
    store.dispatch(applyRendererEvent(artifactEvent));
    store.dispatch(applyRendererEvent(streamEvent));

    expect(store.getState().chat.sessions[0]?.items.filter((item) => item.kind === "file")).toHaveLength(1);
  });

  it("keeps file cards when a later session update is missing them", () => {
    const session = makeSession("session_a", "A");
    const artifactEvent: RendererEvent = {
      id: "event_2",
      type: "artifact.created",
      sessionId: session.id,
      payload: {
        id: "artifact_1",
        name: "分析报告.md",
        kind: "md",
        path: "C:/tmp/分析报告.md",
        size: 2048,
        createdAt: "2026-05-23T00:01:00.000Z"
      }
    };
    const staleSessionUpdate: RendererEvent = {
      id: "event_4",
      type: "session.updated",
      payload: {
        ...session,
        items: [
          {
            id: "tool_1",
            kind: "tool",
            toolCallId: "call_1",
            toolName: "send_file",
            status: "success",
            summary: "已发送 分析报告.md",
            createdAt: "2026-05-23T00:00:59.000Z"
          }
        ]
      }
    };

    store.dispatch(setSessions([session]));
    store.dispatch(applyRendererEvent(artifactEvent));
    store.dispatch(applyRendererEvent(staleSessionUpdate));

    expect(store.getState().chat.sessions[0]?.items).toEqual([
      staleSessionUpdate.payload.items[0],
      {
        id: "file_artifact_1",
        kind: "file",
        artifactId: "artifact_1",
        name: "分析报告.md",
        fileKind: "md",
        createdAt: "2026-05-23T00:01:00.000Z"
      }
    ]);
  });

  it("moves a refreshed file card to the latest session position", () => {
    const session = {
      ...makeSession("session_a", "A"),
      items: [
        {
          id: "file_1",
          kind: "file",
          artifactId: "artifact_1",
          name: "旧分析报告.md",
          fileKind: "md",
          createdAt: "2026-05-23T00:01:00.000Z"
        },
        {
          id: "tool_1",
          kind: "tool",
          toolCallId: "call_1",
          toolName: "send_file",
          status: "success",
          summary: "已生成旧分析报告.md",
          createdAt: "2026-05-23T00:01:01.000Z"
        }
      ] satisfies ChatSession["items"]
    };
    const refreshedFile = {
      id: "file_1",
      kind: "file",
      artifactId: "artifact_1",
      name: "新分析报告.md",
      fileKind: "md",
      createdAt: "2026-05-23T00:02:01.000Z"
    } satisfies ChatSession["items"][number];
    const sendTool = {
      id: "tool_2",
      kind: "tool",
      toolCallId: "call_2",
      toolName: "send_file",
      status: "success",
      summary: "已发送 新分析报告.md",
      createdAt: "2026-05-23T00:02:00.000Z"
    } satisfies ChatSession["items"][number];

    store.dispatch(setSessions([session]));
    store.dispatch(
      applyRendererEvent({
        id: "event_5",
        type: "session.updated",
        payload: {
          ...session,
          items: [session.items[1], sendTool, refreshedFile]
        }
      })
    );

    expect(store.getState().chat.sessions[0]?.items.map((item) => item.id)).toEqual(["tool_1", "tool_2", "file_1"]);
    expect(store.getState().chat.sessions[0]?.items.at(-1)).toMatchObject({
      kind: "file",
      name: "新分析报告.md"
    });
  });

  it("keeps composer drafts isolated per session", () => {
    const first = makeSession("session_a", "A");
    const second = makeSession("session_b", "B");

    store.dispatch(setSessions([first, second]));
    store.dispatch(setCurrentSession(first.id));
    store.dispatch(setComposer("第一段草稿"));
    store.dispatch(
      addAttachments({
        attachments: [
          {
            id: "attachment_1",
            sessionId: first.id,
            name: "A.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: 128,
            path: "C:/tmp/A.docx",
            source: "picker",
            createdAt: "2026-05-23T00:01:00.000Z"
          }
        ]
      })
    );

    store.dispatch(setCurrentSession(second.id));
    expect(store.getState().chat.composer).toBe("");
    expect(store.getState().chat.pendingAttachments).toEqual([]);

    store.dispatch(setComposer("第二段草稿"));
    store.dispatch(setCurrentSession(first.id));

    expect(store.getState().chat.composer).toBe("第一段草稿");
    expect(store.getState().chat.pendingAttachments.map((attachment) => attachment.name)).toEqual(["A.docx"]);
  });

  it("clears only the draft of the completed session", () => {
    const first = makeSession("session_a", "A");
    const second = makeSession("session_b", "B");

    store.dispatch(setSessions([first, second]));
    store.dispatch(setCurrentSession(first.id));
    store.dispatch(setComposer("会话 A 草稿"));
    store.dispatch(setCurrentSession(second.id));
    store.dispatch(setComposer("会话 B 草稿"));

    store.dispatch(clearComposer(first.id));

    expect(store.getState().chat.currentSessionId).toBe(second.id);
    expect(store.getState().chat.composer).toBe("会话 B 草稿");

    store.dispatch(setCurrentSession(first.id));
    expect(store.getState().chat.composer).toBe("");
  });

  it("preserves tool detail previews from stream events", () => {
    const session = makeSession("session_a", "A");
    const event: RendererEvent = {
      id: "event_3",
      type: "agent.tool.completed",
      sessionId: session.id,
      payload: {
        id: "tool_1",
        kind: "tool",
        toolCallId: "call_1",
        toolName: "read_file",
        status: "success",
        summary: "已读取数据说明",
        inputPreview: "{\"path\":\"data/input/sales.csv\"}",
        outputPreview: "数据字段摘要",
        createdAt: "2026-05-23T00:01:00.000Z"
      }
    };

    store.dispatch(setSessions([session]));
    store.dispatch(applyRendererEvent(event));

    expect(store.getState().chat.sessions[0]?.items[0]).toMatchObject({
      kind: "tool",
      inputPreview: "{\"path\":\"data/input/sales.csv\"}",
      outputPreview: "数据字段摘要"
    });
  });

  it("updates the session and message from structured agent failure events", () => {
    const session = makeSession("session_a", "A");
    const failureEvent: RendererEvent = {
      id: "event_failure",
      type: "agent.message.failed",
      sessionId: session.id,
      payload: {
        id: "message_1",
        kind: "message",
        role: "assistant",
        content: "已完成部分分析。",
        failure: { code: "401002", message: "API key rejected" },
        isFinished: true,
        createdAt: "2026-05-23T00:01:00.000Z"
      },
      error: { code: "401002", message: "API key rejected" }
    };

    store.dispatch(setSessions([session]));
    store.dispatch(applyRendererEvent(failureEvent));
    store.dispatch(applyRendererEvent({ id: "event_turn", type: "agent.turn.failed", sessionId: session.id }));

    expect(store.getState().chat.sessions[0]).toMatchObject({
      status: "failed",
      items: [{ id: "message_1", failure: { code: "401002" } }]
    });
  });
});

function makeSession(id: string, title: string): ChatSession {
  return {
    id,
    title,
    status: "idle",
    projectPath: TEST_PROJECT.path,
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    items: []
  };
}
