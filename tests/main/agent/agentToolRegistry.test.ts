import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import { buildAgentChatTools, executeAgentToolCall, type AgentToolExecutionContext } from "../../../src/main/agent/agentToolRegistry";
import type { AppSettings } from "../../../src/shared/types";

describe("agentToolRegistry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes the supported core tools", () => {
    const tools = buildAgentChatTools({ includeExecBash: false, includeArtifactTools: true });
    const names = tools.map((tool) => tool.function.name);

    expect(names).toContain("remember_project");
    expect(names).toContain("read_file");
    expect(names).toContain("read_pdf");
    expect(names).toContain("read_image");
    expect(names).toContain("write_file");
    expect(names).toContain("send_file");
    expect(names).toContain("web_search");
    expect(names).not.toContain("load_csv");
    expect(names).not.toContain("load_excel");
    expect(names).not.toContain("load_json");
    expect(names).not.toContain("extract_text");
    expect(names).not.toContain("extract_pdf");
    expect(names).not.toContain("extract_docx");
    expect(names).not.toContain("describe");
    expect(names).not.toContain("render_chart");
    expect(names).not.toContain("generate_report");
    expect(names).not.toContain("exec_bash");
  });

  it("keeps exec_bash opt-in for local diagnostics", () => {
    const disabledNames = buildAgentChatTools({ includeExecBash: false }).map((tool) => tool.function.name);
    const enabledNames = buildAgentChatTools({ includeExecBash: true }).map((tool) => tool.function.name);

    expect(disabledNames).not.toContain("exec_bash");
    expect(enabledNames).toContain("exec_bash");
  });

  it("returns failed exec_bash output as a tool result", async () => {
    const result = await executeAgentToolCall(
      createToolCall("exec_bash", {
        command: `${quoteShellArg(process.execPath)} -e "process.stderr.write('命令失败'); process.exit(2)"`
      }),
      createContext({ execBashEnabled: true })
    );

    expect(result.toolName).toBe("exec_bash");
    expect(result.summary).toContain("命令执行失败");
    expect(result.content).toContain("命令失败");
    expect(result.content).toContain("exit code: 2");
  });

  const itWindows = process.platform === "win32" ? it : it.skip;

  itWindows("decodes Windows command output when stderr is emitted in GBK", async () => {
    const result = await executeAgentToolCall(
      createToolCall("exec_bash", {
        command: `${quoteShellArg(process.execPath)} -e "process.stderr.write(Buffer.from([0xc3,0xfc,0xc1,0xee,0xca,0xa7,0xb0,0xdc])); process.exit(2)"`
      }),
      createContext({ execBashEnabled: true })
    );

    expect(result.summary).toContain("命令执行失败");
    expect(result.content).toContain("命令失败");
    expect(result.content).not.toContain("����");
  });
});

function createToolCall(name: string, args: Record<string, unknown>): ChatCompletionMessageToolCall {
  return {
    id: `call_${name}`,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args)
    }
  };
}

function createContext(overrides: Partial<AgentToolExecutionContext> = {}): AgentToolExecutionContext {
  return {
    rootDir: process.cwd(),
    docsDir: process.cwd(),
    outputDir: "C:/tmp/arch-agent/session-output",
    globalOutputDir: "C:/tmp/arch-agent/output",
    sessionTitle: "空间设计任务",
    memory: "",
    settings: createSettings(),
    allowedReadDirs: [process.cwd()],
    execBashEnabled: false,
    ...overrides
  };
}

function quoteShellArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function createSettings(): AppSettings {
  return {
    runtime: {
      envFilePath: "",
      configSource: "process",
      bundledPython: {
        available: false,
        source: "missing"
      }
    },
    openai: {
      baseUrl: "https://tokenhub.tencentmaas.com/v1",
      imageBaseUrl: "",
      visionBaseUrl: "",
      chatModel: "hy3-preview",
      chatImageInputEnabled: true,
      imageModel: "hy3-preview",
      visionModel: "",
      imageSize: "1024x1024",
      imageQuality: "standard",
      autoImageGeneration: true,
      thinkingEnabled: true,
      reasoningEffort: "",
      requestTimeoutMs: 60000,
      imageRequestTimeoutMs: 60000,
      contextWindowTokens: 256000,
      maxOutputTokens: 16000,
      apiKeyConfigured: true,
      imageApiKeyConfigured: false,
      visionApiKeyConfigured: false
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
