import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeHost, MessageStreamItem } from "../../../src/main/agent/agentRuntime";
import { createAgentRuntime } from "../../../src/main/agent/agentRuntime";
import type { AppSettings, ChatSession, StreamItem } from "../../../src/shared/types";

vi.mock("../../../src/main/agent/piAgentBridge", () => ({
  createPiAgentBridge: (host: AgentRuntimeHost) => ({
    async runTurn(input: {
      sessionId: string;
      userPrompt: string;
      onAssistantCreated: (assistantItem: MessageStreamItem) => void;
    }) {
      const item = host.createAssistantMessage(input.sessionId);
      input.onAssistantCreated(item);
      item.content = `internal pi-agent handled: ${input.userPrompt}`;
      host.updateItem(input.sessionId, item);
      return item;
    },
    disposeSession: () => {},
    dispose: () => {}
  })
}));

describe("agentRuntime", () => {
  it("delegates turns to the built-in Pi Agent runtime without plugin configuration", async () => {
    const items: StreamItem[] = [];
    const runtime = createAgentRuntime(createHost(items));

    const assistant = await runtime.runTurn({
      sessionId: "session_1",
      userPrompt: "生成分析报告",
      controller: new AbortController(),
      onAssistantCreated: () => {}
    });

    expect(assistant.content).toBe("internal pi-agent handled: 生成分析报告");
    expect(items.some((item) => item.kind === "tool" && item.toolName === "pi-agent.runtime")).toBe(false);
    expect(items.some((item) => item.kind === "message" && item.role === "assistant")).toBe(true);
  });
});

function createHost(items: StreamItem[], settings: AppSettings = createSettings()): AgentRuntimeHost {
  const session: ChatSession = {
    id: "session_1",
    title: "测试会话",
    status: "running",
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    items
  };

  return {
    rootDir: process.cwd(),
    docsDir: process.cwd(),
    inputDir: process.cwd(),
    outputDir: process.cwd(),
    getSessionInputDir: () => process.cwd(),
    getSessionOutputDir: () => process.cwd(),
    loadSettings: () => settings,
    getSession: () => session,
    buildMessages: () => [],
    createAssistantMessage: () => {
      const message: MessageStreamItem = {
        id: `msg_${items.length}`,
        kind: "message",
        role: "assistant",
        content: "",
        isFinished: false,
        createdAt: "2026-05-23T00:00:01.000Z"
      };
      items.push(message);
      return message;
    },
    updateItem: (_sessionId, item) => {
      const index = items.findIndex((existing) => existing.id === item.id);
      if (index >= 0) items[index] = item;
    },
    startToolCall: (_sessionId, toolName, summary) => {
      const tool: StreamItem = {
        id: `tool_${items.length}`,
        kind: "tool",
        toolCallId: `toolcall_${items.length}`,
        toolName,
        status: "running",
        summary,
        createdAt: "2026-05-23T00:00:01.000Z"
      };
      items.push(tool);
      return tool;
    },
    finishToolCall: (_sessionId, item, status, summary) => {
      if (item.kind !== "tool") return;
      item.status = status;
      item.summary = summary;
    },
    addStage: (sessionId, title, detail) => {
      items.push({
        id: `stage_${items.length}`,
        kind: "stage",
        title: `${sessionId}:${title}`,
        detail,
        createdAt: "2026-05-23T00:00:01.000Z"
      });
    },
    appendSessionMemory: () => {},
    formatSessionMemory: () => "",
    getSessionReadableFiles: () => [],
    getSessionAttachments: () => [],
    getSessionArtifacts: () => [],
    getBundledPythonRuntime: () => undefined,
    placeComponentLibraryItem: () => ({
      accepted: false,
      code: "unsupported_node",
      message: "测试未实现"
    }),
    createArtifact: () => ({ id: "artifact_1", name: "output.png", kind: "png", path: "C:/tmp/output.png", createdAt: "2026-07-18T00:00:00.000Z" })
  };
}

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
