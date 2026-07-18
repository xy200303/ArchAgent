import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import { buildAgentChatTools, executeAgentToolCall, type AgentToolExecutionContext } from "../../../src/main/agent/agentToolRegistry";
import { buildAgentModelingSystemPrompt } from "../../../src/main/agent/conversationService";
import { createSceneService } from "../../../src/main/modeling3d/sceneService";
import type { AppSettings } from "../../../src/shared/types";

describe("agentToolRegistry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes the supported core tools", () => {
    const tools = buildAgentChatTools({ includeExecBash: false, includeArtifactTools: true });
    const names = tools.map((tool) => tool.function.name);

    expect(names).toContain("analyze_reference");
    expect(names).toContain("isolate_reference_object");
    expect(names).toContain("search_assets");
    expect(names).toContain("preview_design");
    expect(names).toContain("propose_reconstruction");
    expect(names).toContain("deliver_file");
    expect(names).toContain("get_scene");
    expect(names).toContain("apply_scene_plan");
    expect(names).toContain("update_scene");
    expect(names).toContain("place_asset");
    expect(names).not.toContain("load_csv");
    expect(names).not.toContain("load_excel");
    expect(names).not.toContain("load_json");
    expect(names).not.toContain("extract_text");
    expect(names).not.toContain("extract_pdf");
    expect(names).not.toContain("extract_docx");
    expect(names).not.toContain("describe");
    expect(names).not.toContain("render_chart");
    expect(names).not.toContain("generate_report");
    expect(names).not.toContain("exec_external_script");
  });

  it("prioritizes reusing library furniture before generating a new asset", () => {
    const prompt = buildAgentModelingSystemPrompt();
    const workflowTool = buildAgentChatTools({ includeExecBash: false }).find((tool) => tool.function.name === "propose_reconstruction");

    expect(prompt).toContain("资产：先用 search_assets");
    expect(prompt).toContain("place_asset");
    expect(prompt).toContain("propose_reconstruction");
    expect(prompt).toContain("propose_reconstruction");
    expect(workflowTool?.function.description).toContain("必答问题");
  });

  it("keeps exec_bash opt-in for local diagnostics", () => {
    const disabledNames = buildAgentChatTools({ includeExecBash: false }).map((tool) => tool.function.name);
    const enabledNames = buildAgentChatTools({ includeExecBash: true }).map((tool) => tool.function.name);

    expect(disabledNames).not.toContain("exec_external_script");
    expect(enabledNames).toContain("exec_external_script");
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

  it("routes create_wall through the injected scene command executor", async () => {
    const executeSceneCommand = vi.fn(() => ({
      accepted: true as const,
      command: {
        type: "wall.create" as const,
        id: "wall_agent",
        parentId: "level_default",
        name: "Agent 墙体",
        start: [0, 0] as [number, number],
        end: [2, 0] as [number, number],
        height: 2.8,
        thickness: 0.2,
        materialPreset: "plaster" as const
      },
      snapshot: { revision: 1, rootNodeIds: ["site_default"], nodes: {} }
    }));
    const result = await executeAgentToolCall(
      createToolCall("create_wall", { parent_id: "level_default", start: [0, 0], end: [2, 0] }),
      createContext({ executeSceneCommand })
    );

    expect(executeSceneCommand).toHaveBeenCalledWith(expect.objectContaining({ type: "wall.create", parentId: "level_default" }));
    expect(result.summary).toContain("wall_agent");
  });

  it("returns the authoritative scene summary before an Agent edits walls", async () => {
    const result = await executeAgentToolCall(
      createToolCall("get_scene", {}),
      createContext({
        getSceneSnapshot: () => ({
          revision: 3,
          rootNodeIds: ["site_default"],
          nodes: {
            level_default: { id: "level_default", type: "level", name: "一层", parentId: "building_default", level: 0 },
            wall_north: {
              id: "wall_north",
              type: "wall",
              name: "北墙",
              parentId: "level_default",
              start: [0, 0],
              end: [5, 0],
              height: 2.8,
              thickness: 0.2,
              materialPreset: "plaster"
            }
          }
        })
      })
    );

    expect(result.summary).toBe("已读取当前建筑场景");
    expect(result.content).toContain("场景版本：3");
    expect(result.content).toContain("wall_north");
  });

  it("includes door and window IDs so the Agent can edit created openings", async () => {
    const result = await executeAgentToolCall(
      createToolCall("get_scene", {}),
      createContext({
        getSceneSnapshot: () => ({
          revision: 3,
          rootNodeIds: ["site_default"],
          nodes: {
            level_default: { id: "level_default", type: "level", name: "一层", parentId: "building_default", level: 0 },
            wall_north: { id: "wall_north", type: "wall", name: "北墙", parentId: "level_default", start: [0, 0], end: [5, 0], height: 2.8, thickness: 0.2, materialPreset: "plaster" },
            door_entry: { id: "door_entry", type: "door", name: "入口门", parentId: "wall_north", wallId: "wall_north", offset: 1, width: 0.9, height: 2.1, sillHeight: 0, materialPreset: "wood" },
            window_north: { id: "window_north", type: "window", name: "北窗", parentId: "wall_north", wallId: "wall_north", offset: 3, width: 1.2, height: 1.2, sillHeight: 0.9, materialPreset: "glass" }
          }
        })
      })
    );

    expect(result.content).toContain("door_entry");
    expect(result.content).toContain("window_north");
  });

  it("includes all current component-library node IDs in the Agent scene summary", async () => {
    const result = await executeAgentToolCall(
      createToolCall("get_scene", {}),
      createContext({
        getSceneSnapshot: () => ({
          revision: 4,
          rootNodeIds: ["site_default"],
          nodes: {
            level_default: { id: "level_default", type: "level", name: "一层", parentId: "building_default", level: 0 },
            column_lobby: { id: "column_lobby", type: "column", name: "大厅柱", parentId: "level_default", position: [1, 0, 1], crossSection: "square", height: 2.8, width: 0.3, depth: 0.3, materialPreset: "concrete" },
            zone_lobby: { id: "zone_lobby", type: "zone", name: "大厅", parentId: "level_default", polygon: [[0, 0], [3, 0], [3, 2], [0, 2]], color: "#0f6cbd" },
            stair_lobby: { id: "stair_lobby", type: "stair", name: "大厅楼梯", parentId: "level_default", position: [2, 0, 2], rotation: 0, width: 1.2, totalRise: 2.8, stepCount: 16, thickness: 0.16, railingMode: "both", materialPreset: "concrete" },
            fence_terrace: { id: "fence_terrace", type: "fence", name: "露台围栏", parentId: "level_default", start: [0, 4], end: [4, 4], height: 1.1, thickness: 0.08, style: "rail", materialPreset: "metal" }
          }
        })
      })
    );

    expect(result.content).toContain("column_lobby");
    expect(result.content).toContain("zone_lobby");
    expect(result.content).toContain("stair_lobby");
    expect(result.content).toContain("fence_terrace");
  });

  it("updates the SceneService snapshot when an Agent creates a wall", async () => {
    const sceneService = createSceneService({
      createId: () => "agent",
      broadcast: vi.fn()
    });
    const context = createContext({
      getSceneSnapshot: sceneService.getSnapshot,
      executeSceneCommand: sceneService.execute
    });

    await executeAgentToolCall(createToolCall("get_scene", {}), context);
    const result = await executeAgentToolCall(
      createToolCall("create_wall", { parent_id: "level_default", name: "Agent 新墙", start: [1, 1], end: [3, 1] }),
      context
    );

    expect(result.summary).toContain("wall_agent");
    expect(sceneService.getSnapshot()).toMatchObject({ revision: 1, nodes: { wall_agent: { name: "Agent 新墙" } } });
  });

  it("creates and updates a stair through the Agent command boundary", async () => {
    const sceneService = createSceneService({
      createId: () => "agent",
      broadcast: vi.fn()
    });
    const context = createContext({
      getSceneSnapshot: sceneService.getSnapshot,
      executeSceneCommand: sceneService.execute
    });

    const created = await executeAgentToolCall(
      createToolCall("create_stair", {
        parent_id: "level_default",
        position: [1, 0, 1],
        width: 1.2,
        total_rise: 3,
        step_count: 18,
        railing_mode: "left"
      }),
      context
    );
    const updated = await executeAgentToolCall(
      createToolCall("update_stair", { id: "stair_agent", width: 1.4, railing_mode: "both" }),
      context
    );

    expect(created.summary).toContain("已创建楼梯");
    expect(updated.summary).toContain("已更新楼梯");
    expect(sceneService.getSnapshot().nodes.stair_agent).toMatchObject({ width: 1.4, railingMode: "both" });
  });

  it("creates a fence through the Agent command boundary", async () => {
    const sceneService = createSceneService({ createId: () => "agent", broadcast: vi.fn() });
    const context = createContext({ getSceneSnapshot: sceneService.getSnapshot, executeSceneCommand: sceneService.execute });

    const result = await executeAgentToolCall(
      createToolCall("create_fence", {
        parent_id: "level_default",
        start: [0, 4],
        end: [4, 4],
        height: 1.2,
        style: "rail"
      }),
      context
    );

    expect(result.summary).toContain("已创建围栏");
    expect(sceneService.getSnapshot().nodes.fence_agent).toMatchObject({ type: "fence", style: "rail" });
  });

  it("moves imported reference meshes through the Agent command boundary", async () => {
    const sceneService = createSceneService({ createId: () => "agent", broadcast: vi.fn() });
    sceneService.execute({ type: "asset.create", id: "asset_sofa", parentId: "level_default", name: "沙发", format: "glb", sourcePath: "assets/asset_sofa.glb" });
    const context = createContext({ getSceneSnapshot: sceneService.getSnapshot, executeSceneCommand: sceneService.execute });

    const result = await executeAgentToolCall(
      createToolCall("update_asset", { id: "asset_sofa", position: [2, 0, 1], rotation: [0, 1.57, 0], scale: [1.2, 1.2, 1.2] }),
      context
    );

    expect(result.summary).toContain("已更新参考模型");
    expect(sceneService.getSnapshot().nodes.asset_sofa).toMatchObject({ position: [2, 0, 1], scale: [1.2, 1.2, 1.2] });
  });

  it("hides direct asset generation tools while a reconstruction workflow is awaiting confirmation", () => {
    const names = buildAgentChatTools({
      includeExecBash: false,
      layers: ["foundation", "reference", "workflow", "scene", "delivery"]
    }).map((tool) => tool.function.name);

    expect(names).toContain("propose_reconstruction");
    expect(names).toContain("deliver_file");
    expect(names).not.toContain("generate_3d_asset");
  });

  it("places a library component before updating its generated scene asset ID", async () => {
    const placeComponentLibraryItem = vi.fn(() => ({
      accepted: true as const,
      command: {
        type: "asset.create" as const,
        id: "asset_library_sofa",
        parentId: "level_default",
        name: "现代沙发",
        format: "glb" as const,
        sourcePath: "assets/asset_library_sofa.glb",
        position: [2, 0, 1] as [number, number, number],
        rotation: [0, 1.57, 0] as [number, number, number],
        scale: [1, 1, 1] as [number, number, number]
      },
      snapshot: { revision: 5, rootNodeIds: ["site_default"], nodes: {} }
    }));

    const result = await executeAgentToolCall(
      createToolCall("place_component_asset", {
        component_id: "C:/library/modern-sofa.glb",
        position: [2, 0, 1],
        rotation: [0, 1.57, 0]
      }),
      createContext({ placeComponentLibraryItem })
    );

    expect(placeComponentLibraryItem).toHaveBeenCalledWith({
      componentId: "C:/library/modern-sofa.glb",
      position: [2, 0, 1],
      rotation: [0, 1.57, 0]
    });
    expect(result.summary).toContain("现代沙发");
    expect(result.content).toContain("asset_library_sofa");
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
      visionBaseUrl: "",
      chatModel: "hy3-preview",
      chatImageInputEnabled: true,
      visionModel: "",
      thinkingEnabled: true,
      reasoningEffort: "",
      requestTimeoutSeconds: 60,
      contextWindowTokens: 256000,
      maxOutputTokens: 16000,
      apiKeyConfigured: true,
      visionApiKeyConfigured: false
    },
    hunyuanImage: {
      region: "ap-guangzhou", resolution: "1024:1024", revise: true, logoAdd: true,
      requestTimeoutSeconds: 60, pollIntervalSeconds: 1, jobTimeoutSeconds: 60,
      secretIdConfigured: false, secretKeyConfigured: false
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
