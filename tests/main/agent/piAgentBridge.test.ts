import { Compile } from "typebox/compile";
import { describe, expect, it } from "vitest";
import { buildAgentChatTools } from "../../../src/main/agent/agentToolRegistry";
import { buildArchAgentPiToolSchemaSignature, convertJsonSchemaToTypeBoxSchema } from "../../../src/main/agent/piAgentBridge";
import type { AppSettings } from "../../../src/shared/types";

describe("piAgentBridge tool schemas", () => {
  it("converts every OpenAI tool schema into a TypeBox-compilable schema", () => {
    const tools = buildAgentChatTools({ includeExecBash: true, includeArtifactTools: true });

    for (const tool of tools) {
      if (tool.type !== "function") continue;

      expect(() => Compile(convertJsonSchemaToTypeBoxSchema(tool.function.parameters))).not.toThrow();
    }
  });

  it("validates read_file arguments through the Pi TypeBox path", () => {
    const tool = buildAgentChatTools({ includeExecBash: false, includeArtifactTools: true }).find(
      (item) => item.type === "function" && item.function.name === "read_file"
    );
    if (tool?.type !== "function") throw new Error("read_file tool not found");

    const schema = convertJsonSchemaToTypeBoxSchema(tool.function.parameters);
    const validator = Compile(schema);
    const args = {
      path: "data/output/notes.txt"
    };

    expect(validator.Check(args)).toBe(true);
    expect([...validator.Errors(args)]).toEqual([]);
    expect(validator.Check({ path: 123 })).toBe(false);
  });

  it("includes the enabled Pi tool set in the schema signature", () => {
    const safeSettings = createSettings();
    const bashSettings = createSettings();
    bashSettings.agent.execBashEnabled = true;
    const visionChatSettings = createSettings();
    visionChatSettings.openai.chatImageInputEnabled = true;
    const largerContextSettings = createSettings();
    largerContextSettings.openai.contextWindowTokens = 512000;

    const safeSignature = buildArchAgentPiToolSchemaSignature(safeSettings);
    const bashSignature = buildArchAgentPiToolSchemaSignature(bashSettings);
    const visionChatSignature = buildArchAgentPiToolSchemaSignature(visionChatSettings);
    const largerContextSignature = buildArchAgentPiToolSchemaSignature(largerContextSettings);
    const safeToolNames = (JSON.parse(safeSignature) as { tools?: Array<{ name: string }> }).tools?.map((tool) => tool.name) ?? [];

    expect(safeToolNames).toContain("remember_project");
    expect(safeToolNames).toContain("read_file");
    expect(safeToolNames).toContain("read_pdf");
    expect(safeToolNames).toContain("read_image");
    expect(safeToolNames).toContain("write_file");
    expect(safeToolNames).toContain("send_file");
    expect(safeToolNames).toContain("web_search");
    expect(safeToolNames).not.toContain("load_csv");
    expect(safeToolNames).not.toContain("load_excel");
    expect(safeToolNames).not.toContain("load_json");
    expect(safeToolNames).not.toContain("extract_text");
    expect(safeToolNames).not.toContain("extract_pdf");
    expect(safeToolNames).not.toContain("extract_docx");
    expect(safeToolNames).not.toContain("describe");
    expect(safeToolNames).not.toContain("render_chart");
    expect(safeToolNames).not.toContain("generate_report");
    expect(safeToolNames).not.toContain("hy3_mcp_status");
    expect(safeToolNames).not.toContain("hy3_mcp_list_tools");
    expect(safeToolNames).not.toContain("hy3_mcp_call_tool");
    expect(safeToolNames).not.toContain("build_document_config");
    expect(safeToolNames).not.toContain("draft_document_sections");
    expect(safeToolNames).not.toContain("write_document_word");
    expect(safeToolNames).not.toContain("validate_word_output");
    expect(safeToolNames).not.toContain("read_word");
    expect(safeSignature).not.toContain("exec_bash");
    expect(bashSignature).toContain("exec_bash");
    expect(bashSignature).not.toBe(safeSignature);
    expect(visionChatSignature).toBe(safeSignature);
    expect(largerContextSignature).toBe(safeSignature);
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
      imageBaseUrl: "",
      visionBaseUrl: "",
      chatModel: "gpt-5.5",
      chatImageInputEnabled: false,
      imageModel: "gpt-image-2",
      visionModel: "",
      imageSize: "1536x1024",
      imageQuality: "high",
      autoImageGeneration: true,
      thinkingEnabled: true,
      reasoningEffort: "",
      requestTimeoutMs: 120000,
      imageRequestTimeoutMs: 300000,
      contextWindowTokens: 256000,
      maxOutputTokens: 16000,
      apiKeyConfigured: false,
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
