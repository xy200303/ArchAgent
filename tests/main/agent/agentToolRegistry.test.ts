import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

    expect(names).toContain("view_resources");
    expect(names).toContain("search_resources");
    expect(names).toContain("extract_reference_object");
    expect(names).toContain("generate_3d_asset");
    expect(names).toContain("edit_library_asset");
    expect(names).toContain("search_library_assets");
    expect(names).toContain("place_library_asset");
    expect(names).toContain("place_library_assets");
    expect(names).toContain("preview_library_asset_placement");
    expect(names).toContain("inspect_scene");
    expect(names).toContain("update_scene_object");
    expect(names).toContain("create_architecture_element");
    expect(names).toContain("create_architecture_elements");
    expect(names).toContain("update_architecture_element");
    expect(names).toContain("update_architecture_elements");
    expect(names).toContain("create_reconstruction_plan");
    expect(names).toContain("generate_design_preview");
    expect(names).toContain("send_file");
    expect(names).not.toContain("analyze_reference");
    expect(names).not.toContain("place_scene_objects");
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
    const workflowTool = buildAgentChatTools({ includeExecBash: false }).find((tool) => tool.function.name === "create_reconstruction_plan");

    expect(prompt).toContain("search_library_assets");
    expect(prompt).toContain("place_library_assets");
    expect(prompt).toContain("preview_library_asset_placement");
    expect(prompt).toContain("library_asset_id");
    expect(prompt).toContain("严禁复用失败参数");
    expect(prompt).toContain("create_reconstruction_plan");
    expect(prompt).toContain("绝不将摆放位置、朝向、用途、标签、分类、工作流或场景描述写进生成 prompt");
    expect(workflowTool?.function.description).toContain("必答问题");
  });

  it("defines 3D generation as one smallest physical entity", () => {
    const tool = buildAgentChatTools({ includeExecBash: false }).find((item) => item.function.name === "generate_3d_asset");

    expect(tool?.function.description).toContain("最小单实体");
    expect(JSON.stringify(tool?.function.parameters)).toContain("入口标识");
    expect(JSON.stringify(tool?.function.parameters)).toContain("位置、朝向、用途");
    expect(JSON.stringify(tool?.function.parameters)).toContain("target_dimensions_meters");
  });

  it("defines asset editing as a non-destructive derived generation", () => {
    const tool = buildAgentChatTools({ includeExecBash: false }).find((item) => item.function.name === "edit_library_asset");

    expect(tool?.function.description).toContain("原资产及已放置实例保持不变");
    expect(JSON.stringify(tool?.function.parameters)).toContain("regenerate");
    expect(JSON.stringify(tool?.function.parameters)).toContain("edit_prompt");
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

  it.skip("routes create_wall through the injected scene command executor", async () => {
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

  it.skip("returns the authoritative scene summary before an Agent edits walls", async () => {
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

  it.skip("includes door and window IDs so the Agent can edit created openings", async () => {
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

  it.skip("includes all current component-library node IDs in the Agent scene summary", async () => {
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

  it.skip("updates the SceneService snapshot when an Agent creates a wall", async () => {
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

  it.skip("creates and updates a stair through the Agent command boundary", async () => {
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

  it.skip("creates a fence through the Agent command boundary", async () => {
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

  it.skip("moves imported reference meshes through the Agent command boundary", async () => {
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

  it("returns selected image resources as multimodal tool output paths", async () => {
    const result = await executeAgentToolCall(
      createToolCall("view_resources", { resource_ids: ["resource_sofa"], purpose: "核对沙发造型" }),
      createContext({
        resources: [{
          id: "resource_sofa",
          sessionId: "session_1",
          name: "沙发参考图.png",
          kind: "image",
          mimeType: "image/png",
          size: 12,
          path: "C:/tmp/sofa.png",
          source: "user_upload",
          parentResourceIds: [],
          metadata: {},
          status: "ready",
          confirmed: true,
          pinned: false,
          createdAt: "2026-01-01T00:00:00.000Z"
        }]
      })
    );

    expect(result.toolName).toBe("view_resources");
    expect(result.imagePaths).toEqual(["C:/tmp/sofa.png"]);
    expect(result.content).toContain("resource_sofa");
  });

  it("returns a cached 3D resource preview as an image path", async () => {
    const result = await executeAgentToolCall(
      createToolCall("view_resources", { resource_ids: ["resource_model"], purpose: "核对模型外观" }),
      createContext({
        resources: [{
          id: "resource_model",
          sessionId: "session_1",
          name: "现代沙发.glb",
          kind: "model3d",
          mimeType: "model/gltf-binary",
          size: 100,
          path: "C:/tmp/sofa.glb",
          source: "generated",
          parentResourceIds: [],
          metadata: { preview_path: "C:/tmp/sofa.glb.preview.png" },
          status: "ready",
          confirmed: true,
          pinned: false,
          createdAt: "2026-01-01T00:00:00.000Z"
        }]
      })
    );

    expect(result.imagePaths).toEqual(["C:/tmp/sofa.glb.preview.png"]);
    expect(result.content).toContain("已附带缓存预览图");
  });

  it("returns only matching text context when view_resources receives a query", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "arch-agent-resource-query-"));
    const filePath = join(sandbox, "requirements.txt");
    writeFileSync(filePath, "客厅采用木地板\n木地板选择浅橡木\n预算待确认\n卧室采用蓝色墙纸\n");
    try {
      const result = await executeAgentToolCall(
        createToolCall("view_resources", { resource_ids: ["resource_requirements"], purpose: "查找地板方案", query: "木地板" }),
        createContext({
          allowedReadDirs: [sandbox],
          resources: [{ id: "resource_requirements", sessionId: "session_1", name: "requirements.txt", kind: "text", mimeType: "text/plain", size: 20, path: filePath, source: "user_upload", parentResourceIds: [], metadata: {}, status: "ready", confirmed: false, pinned: false, createdAt: "2026-01-01T00:00:00.000Z" }]
        })
      );

      expect(result.content).toContain("与“木地板”相关的文本");
      expect(result.content).toContain("客厅采用木地板");
      expect(result.content).not.toContain("卧室采用蓝色墙纸");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("keeps single-asset generation available as an Agent-controlled capability", () => {
    const names = buildAgentChatTools({
      includeExecBash: false,
      layers: ["foundation", "reference", "workflow", "scene", "delivery"]
    }).map((tool) => tool.function.name);

    expect(names).toContain("create_reconstruction_plan");
    expect(names).toContain("send_file");
    expect(names).toContain("generate_3d_asset");
  });

  it("returns the current WebGL preview as an Agent-visible image resource", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "arch-agent-scene-preview-"));
    const captureScenePreview = vi.fn(async () => Buffer.from("preview-png").toString("base64"));
    try {
      const result = await executeAgentToolCall(
        createToolCall("view_scene_preview", { view: "top" }),
        createContext({ outputDir, captureScenePreview })
      );

      expect(result.toolName).toBe("view_scene_preview");
      expect(captureScenePreview).toHaveBeenCalledWith("top");
      expect(result.summary).toContain("top");
      expect(result.artifactPath).toMatch(/scene-preview-\d+\.png$/);
      expect(readFileSync(result.artifactPath!).toString()).toBe("preview-png");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("prepares an existing session resource for explicit user delivery", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "arch-agent-send-file-"));
    const previewPath = join(outputDir, "scene-preview.png");
    writeFileSync(previewPath, "preview-png");
    try {
      const result = await executeAgentToolCall(
        createToolCall("send_file", { resource_id: "resource_preview" }),
        createContext({
          resources: [{
            id: "resource_preview",
            sessionId: "session_1",
            name: "scene-preview.png",
            kind: "image",
            mimeType: "image/png",
            size: 11,
            path: previewPath,
            source: "generated",
            parentResourceIds: [],
            metadata: {},
            status: "ready",
            confirmed: false,
            pinned: false,
            createdAt: "2026-07-19T00:00:00.000Z"
          }]
        })
      );

      expect(result.toolName).toBe("send_file");
      expect(result.sendResourceId).toBe("resource_preview");
      expect(result.artifactPath).toBeUndefined();
      expect(result.content).toContain("send_file prepared");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it.skip("places a library component before updating its generated scene asset ID", async () => {
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
    expect(result.content).toContain("asset_id");
  });

  it("searches public library IDs then instances the selected asset", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "arch-agent-library-"));
    const libraryDir = join(sandbox, "data", "component-library", "assets");
    const componentFile = join(libraryDir, "modern-sofa.glb");
    mkdirSync(libraryDir, { recursive: true });
    writeFileSync(componentFile, "glb");
    writeFileSync(`${componentFile}.semantic.json`, JSON.stringify({
      id: componentFile, name: "现代沙发", file: componentFile, source: "external", model: "external", category: "家具", tags: ["沙发"], previewAvailable: false, createdAt: "2026-01-01T00:00:00.000Z"
    }));
    const placeLibraryAssets = buildAgentChatTools({ includeExecBash: false }).find((tool) => tool.function.name === "place_library_assets");
    const placeComponentLibraryItem = vi.fn(() => ({
      accepted: true as const,
      command: {
        type: "asset.create" as const,
        id: "asset_library_sofa",
        parentId: "level_default",
        name: "现代沙发",
        format: "glb" as const,
        sourcePath: "assets/asset_library_sofa.glb"
      },
      snapshot: { revision: 5, rootNodeIds: ["site_default"], nodes: {} }
    }));

    try {
      const context = createContext({ componentLibraryRootDir: sandbox, getSceneSnapshot: () => ({ revision: 5, rootNodeIds: ["site_default"], nodes: {} }), placeComponentLibraryItem });
      const search = await executeAgentToolCall(createToolCall("search_library_assets", { query: "现代沙发" }), context);
      const libraryAssetId = search.content.match(/library_asset_id: ([^\n]+)/)?.[1];
      const result = await executeAgentToolCall(createToolCall("place_library_assets", { items: [{ library_asset_id: libraryAssetId, position: [1, 0, 1] }] }), context);

      expect(placeLibraryAssets?.function.description).toContain("library_asset_id");
      expect(search.content).toContain("library_asset_id: lib_");
      expect(result.toolName).toBe("place_library_assets");
      expect(result.content).toContain("现代沙发_1");
      expect(result.content).toContain("scene_object_id: asset_library_sofa");
      expect(placeComponentLibraryItem).toHaveBeenCalledWith({ componentId: libraryAssetId, name: "现代沙发_1", position: [1, 0, 1] });
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("returns an existing library preview through view_resources", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "arch-agent-library-preview-"));
    const libraryDir = join(sandbox, "data", "component-library", "assets");
    const componentFile = join(libraryDir, "chair.glb");
    const previewFile = `${componentFile}.preview.png`;
    mkdirSync(libraryDir, { recursive: true });
    writeFileSync(componentFile, "glb");
    writeFileSync(previewFile, "preview");
    writeFileSync(`${componentFile}.semantic.json`, JSON.stringify({ id: "lib_chair", name: "单椅", file: componentFile, source: "external", model: "external", category: "家具", tags: ["单椅"], previewAvailable: true, createdAt: "2026-01-01T00:00:00.000Z" }));
    try {
      const result = await executeAgentToolCall(
        createToolCall("view_resources", { library_asset_ids: ["lib_chair"], purpose: "核对单椅外观" }),
        createContext({ componentLibraryRootDir: sandbox })
      );

      expect(result.imagePaths).toEqual([previewFile]);
      expect(result.content).toContain("library_asset_id: lib_chair");
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("updates an existing library asset's metadata without replacing its model", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "arch-agent-library-edit-"));
    const libraryDir = join(sandbox, "data", "component-library", "assets");
    const componentFile = join(libraryDir, "chair.glb");
    mkdirSync(libraryDir, { recursive: true });
    writeFileSync(componentFile, "original-glb");
    writeFileSync(`${componentFile}.semantic.json`, JSON.stringify({ id: "lib_chair", name: "单椅", file: componentFile, source: "hunyuan-3d", model: "hy-3d-3.0", prompt: "浅木色单椅", description: "浅木色单椅", category: "家具", tags: ["单椅"], previewAvailable: false, createdAt: "2026-01-01T00:00:00.000Z" }));
    try {
      const result = await executeAgentToolCall(
        createToolCall("edit_library_asset", { library_asset_id: "lib_chair", mode: "metadata", name: "浅木单椅", tags: ["单椅", "木质"], target_dimensions_meters: [0.5, 0.8, 0.55] }),
        createContext({ componentLibraryRootDir: sandbox })
      );
      const record = JSON.parse(readFileSync(`${componentFile}.semantic.json`, "utf8")) as Record<string, unknown>;

      expect(result.toolName).toBe("edit_library_asset");
      expect(result.content).toContain("GLB 未改变");
      expect(readFileSync(componentFile, "utf8")).toBe("original-glb");
      expect(record.name).toBe("浅木单椅");
      expect(record.tags).toEqual(["单椅", "木质"]);
      expect(record.targetDimensions).toEqual([0.5, 0.8, 0.55]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it.skip("adjusts a scene object by its display reference without exposing its node ID", async () => {
    const sceneService = createSceneService({ createId: () => "agent", broadcast: vi.fn() });
    sceneService.execute({ type: "asset.create", id: "asset_internal", parentId: "level_default", name: "现代沙发_1", format: "glb", sourcePath: "assets/modern-sofa.glb" });
    const result = await executeAgentToolCall(
      createToolCall("adjust_scene_object", {
        expected_revision: sceneService.getSnapshot().revision,
        reference: "现代沙发_1",
        position: [2, 0, 1]
      }),
      createContext({ getSceneSnapshot: sceneService.getSnapshot, executeSceneCommand: sceneService.execute })
    );

    expect(result.toolName).toBe("adjust_scene_object");
    expect(result.summary).toContain("现代沙发_1");
    expect(result.content).not.toContain("asset_internal");
    expect(sceneService.getSnapshot().nodes.asset_internal).toMatchObject({ position: [2, 0, 1] });
  });

  it("returns public scene object IDs from inspect_scene", async () => {
    const sceneService = createSceneService({ createId: () => "agent", broadcast: vi.fn() });
    sceneService.execute({ type: "wall.create", id: "wall_north", parentId: "level_default", name: "客厅北墙", start: [0, 0], end: [4, 0] });
    sceneService.execute({ type: "asset.create", id: "asset_sofa", parentId: "level_default", name: "现代沙发_1", format: "glb", sourcePath: "assets/sofa.glb", position: [2, 0, 0.55], rotation: [0, Math.PI, 0] });

    const result = await executeAgentToolCall(createToolCall("inspect_scene", {}), createContext({ getSceneSnapshot: sceneService.getSnapshot }));

    expect(result.toolName).toBe("inspect_scene");
    expect(result.content).toContain("scene_object_id: asset_sofa");
    expect(result.content).toContain("显示名：现代沙发_1");
    expect(result.content).toContain("距墙：北墙 0.45m（室内侧）");
    expect(result.content).toContain("位于房间/楼板范围内：是");
    expect(result.content).toContain("离地：0m（落地）");
    expect(result.content).toContain("面朝：north");
    expect(result.content).toContain("rotation_degrees");
  });

  it("places a library asset relative to an anchored wall with semantic facing", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "arch-agent-anchor-"));
    const libraryDir = join(sandbox, "data", "component-library", "assets");
    const componentFile = join(libraryDir, "modern-sofa.glb");
    mkdirSync(libraryDir, { recursive: true });
    writeFileSync(componentFile, "glb");
    writeFileSync(`${componentFile}.semantic.json`, JSON.stringify({ id: componentFile, name: "现代沙发", file: componentFile, source: "external", model: "external", category: "家具", tags: ["沙发"], previewAvailable: false, createdAt: "2026-01-01T00:00:00.000Z" }));
    const sceneService = createSceneService({ createId: () => "agent", broadcast: vi.fn() });
    const placeComponentLibraryItem = vi.fn((input: { componentId: string; name?: string; position?: [number, number, number]; rotation?: [number, number, number] }) => ({
      accepted: true as const,
      command: { type: "asset.create" as const, id: "asset_sofa", parentId: "level_default", name: input.name ?? "现代沙发", format: "glb" as const, sourcePath: "assets/sofa.glb", position: input.position ?? [0, 0, 0], rotation: input.rotation ?? [0, 0, 0], scale: [1, 1, 1] as [number, number, number] },
      snapshot: sceneService.getSnapshot()
    }));

    try {
      const context = createContext({ componentLibraryRootDir: sandbox, getSceneSnapshot: sceneService.getSnapshot, placeComponentLibraryItem });
      const search = await executeAgentToolCall(createToolCall("search_library_assets", { query: "现代沙发" }), context);
      const libraryAssetId = search.content.match(/library_asset_id: ([^\n]+)/)?.[1];
      const result = await executeAgentToolCall(createToolCall("place_library_assets", {
        items: [{ library_asset_id: libraryAssetId, anchor: { element_id: "wall_east", side: "inside", distance: 0.55 }, local: [0, 0, 0], facing: "west" }]
      }), context);

      expect(result.toolName).toBe("place_library_assets");
      expect(placeComponentLibraryItem).toHaveBeenCalledWith(expect.objectContaining({ position: [4.35, 0, 2], rotation: [0, -Math.PI / 2, 0] }));
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("previews a reversed north-wall anchor on the room interior side", async () => {
    const sceneService = createSceneService({ createId: () => "agent", broadcast: vi.fn() });
    sceneService.execute({ type: "node.delete", id: "wall_south" });
    sceneService.execute({ type: "wall.create", id: "wall_reversed_north", parentId: "level_default", name: "反向北墙", start: [0, 4.1], end: [4, 4.1], thickness: 0.2 });

    const result = await executeAgentToolCall(
      createToolCall("preview_library_asset_placement", {
        items: [{ library_asset_id: "lib_preview", anchor: { element_id: "wall_reversed_north", side: "room_interior", distance: 0.15 }, local: [0, 0, 0], footprint_meters: [1, 0.3] }]
      }),
      createContext({ getSceneSnapshot: sceneService.getSnapshot })
    );

    expect(result.toolName).toBe("preview_library_asset_placement");
    expect(result.content).toContain("预览落点：[2, 0, 3.85]");
    expect(result.content).toContain("位于房间/楼板范围内：是");
    expect(result.content).toContain("未发现墙体穿模");
  });

  it("returns the current revision when a precise placement is stale", async () => {
    const sceneService = createSceneService({ createId: () => "agent", broadcast: vi.fn() });
    const result = await executeAgentToolCall(
      createToolCall("place_library_asset", { expected_revision: 99, library_asset_id: "lib_missing", position: [2, 0, 2] }),
      createContext({ getSceneSnapshot: sceneService.getSnapshot })
    );

    expect(result.summary).toContain("最新版本为 0");
    expect(result.content).toContain("current_revision: 0");
  });

  it("blocks placement when two declared furniture footprints overlap", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "arch-agent-collision-"));
    const libraryDir = join(sandbox, "data", "component-library", "assets");
    const componentFile = join(libraryDir, "side-table.glb");
    mkdirSync(libraryDir, { recursive: true });
    writeFileSync(componentFile, "glb");
    writeFileSync(`${componentFile}.semantic.json`, JSON.stringify({ id: componentFile, name: "边几", file: componentFile, source: "external", model: "external", category: "家具", tags: ["边几"], previewAvailable: false, createdAt: "2026-01-01T00:00:00.000Z" }));
    const placeComponentLibraryItem = vi.fn(() => ({
      accepted: true as const,
      command: { type: "asset.create" as const, id: "asset_side_table", parentId: "level_default", name: "边几", format: "glb" as const, sourcePath: "assets/side-table.glb", position: [1.2, 0, 1] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] },
      snapshot: { revision: 3, rootNodeIds: ["site_default"], nodes: {} }
    }));
    try {
      const context = createContext({
        componentLibraryRootDir: sandbox,
        getSceneSnapshot: () => ({
          revision: 3,
          rootNodeIds: ["site_default"],
          nodes: {
            asset_sofa: { id: "asset_sofa", type: "asset", name: "现代沙发_1", parentId: "level_default", format: "glb", sourcePath: "assets/sofa.glb", position: [1, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1], footprint: [2, 1] }
          }
        }),
        placeComponentLibraryItem
      });
      const search = await executeAgentToolCall(createToolCall("search_library_assets", { query: "边几" }), context);
      const libraryAssetId = search.content.match(/library_asset_id: ([^\n]+)/)?.[1];
      const result = await executeAgentToolCall(createToolCall("place_library_assets", {
        items: [{ library_asset_id: libraryAssetId, position: [1.2, 0, 1], footprint_meters: [0.8, 0.8] }]
      }), context);

      expect(result.summary).toContain("占地碰撞");
      expect(placeComponentLibraryItem).not.toHaveBeenCalled();

      const overrideResult = await executeAgentToolCall(createToolCall("place_library_assets", {
        items: [{ library_asset_id: libraryAssetId, position: [1.2, 0, 1], footprint_meters: [0.8, 0.8], ignore_collision: true }]
      }), context);

      expect(overrideResult.summary).toContain("已实例化 1 个");
      expect(placeComponentLibraryItem).toHaveBeenCalledOnce();
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("allows touching footprints and reports collisions within one preview batch", async () => {
    const result = await executeAgentToolCall(
      createToolCall("preview_library_asset_placement", {
        items: [
          { library_asset_id: "cube_a", position: [0, 0, 0], footprint_meters: [0.3, 0.3] },
          { library_asset_id: "cube_b", position: [0.3, 0, 0], footprint_meters: [0.3, 0.3] },
          { library_asset_id: "cube_c", position: [0.5, 0, 0], footprint_meters: [0.3, 0.3] }
        ]
      }),
      createContext({ getSceneSnapshot: () => ({ revision: 3, rootNodeIds: ["site_default"], nodes: {} }) })
    );

    expect(result.content).toContain("家具碰撞：与“预览资产 2”占地重叠");
  });

  it("lets a single placement use the latest revision unless one is supplied", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "arch-agent-latest-placement-"));
    const libraryDir = join(sandbox, "data", "component-library", "assets");
    const componentFile = join(libraryDir, "cube.glb");
    mkdirSync(libraryDir, { recursive: true });
    writeFileSync(componentFile, "glb");
    writeFileSync(`${componentFile}.semantic.json`, JSON.stringify({ id: componentFile, name: "方块", file: componentFile, source: "external", model: "external", tags: [], previewAvailable: false, createdAt: "2026-01-01T00:00:00.000Z" }));
    const placeComponentLibraryItem = vi.fn(() => ({
      accepted: true as const,
      command: { type: "asset.create" as const, id: "asset_cube", parentId: "level_default", name: "方块", format: "glb" as const, sourcePath: "assets/cube.glb", position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] },
      snapshot: { revision: 4, rootNodeIds: ["site_default"], nodes: {} }
    }));
    try {
      const context = createContext({ componentLibraryRootDir: sandbox, getSceneSnapshot: () => ({ revision: 4, rootNodeIds: ["site_default"], nodes: {} }), placeComponentLibraryItem });
      const search = await executeAgentToolCall(createToolCall("search_library_assets", { query: "方块" }), context);
      const libraryAssetId = search.content.match(/library_asset_id: ([^\n]+)/)?.[1];
      const result = await executeAgentToolCall(createToolCall("place_library_asset", { library_asset_id: libraryAssetId, position: [0, 0, 0] }), context);

      expect(result.toolName).toBe("place_library_asset");
      expect(placeComponentLibraryItem).toHaveBeenCalledOnce();
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("rolls back an entire batch when an accepted preflight later fails", async () => {
    const sandbox = mkdtempSync(join(tmpdir(), "arch-agent-placement-rollback-"));
    const libraryDir = join(sandbox, "data", "component-library", "assets");
    const componentFile = join(libraryDir, "cube.glb");
    mkdirSync(libraryDir, { recursive: true });
    writeFileSync(componentFile, "glb");
    writeFileSync(`${componentFile}.semantic.json`, JSON.stringify({ id: componentFile, name: "方块", file: componentFile, source: "external", model: "external", tags: [], previewAvailable: false, createdAt: "2026-01-01T00:00:00.000Z" }));
    const snapshot = { revision: 4, rootNodeIds: ["site_default"], nodes: {} };
    const placeComponentLibraryItem = vi.fn()
      .mockReturnValueOnce({ accepted: true as const, command: { type: "asset.create" as const, id: "asset_first", parentId: "level_default", name: "方块", format: "glb" as const, sourcePath: "assets/cube.glb", position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] }, snapshot })
      .mockReturnValueOnce({ accepted: false as const, message: "写入失败", snapshot });
    const replaceSceneSnapshot = vi.fn();
    try {
      const context = createContext({ componentLibraryRootDir: sandbox, getSceneSnapshot: () => snapshot, placeComponentLibraryItem, replaceSceneSnapshot });
      const search = await executeAgentToolCall(createToolCall("search_library_assets", { query: "方块" }), context);
      const libraryAssetId = search.content.match(/library_asset_id: ([^\n]+)/)?.[1];
      const result = await executeAgentToolCall(createToolCall("place_library_assets", {
        items: [
          { library_asset_id: libraryAssetId, position: [0, 0, 0], footprint_meters: [0.3, 0.3] },
          { library_asset_id: libraryAssetId, position: [1, 0, 0], footprint_meters: [0.3, 0.3] }
        ]
      }), context);

      expect(result.content).toContain("已回滚本批次");
      expect(replaceSceneSnapshot).toHaveBeenCalledWith(snapshot);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("expands line and grid placement arrays before validation", async () => {
    const preview = await executeAgentToolCall(
      createToolCall("preview_library_asset_placement", {
        items: [{
          library_asset_id: "cube",
          position: [0, 0, 0],
          footprint_meters: [0.2, 0.2],
          array: { mode: "grid", rows: 2, columns: 3, offset_meters: [0.5, 0.4] }
        }]
      }),
      createContext({ getSceneSnapshot: () => ({ revision: 1, rootNodeIds: ["site_default"], nodes: {} }) })
    );

    expect(preview.summary).toContain("已预览 6 个落点");
    expect(preview.content).toContain("预览落点：[1, 0, 0]");
    expect(preview.content).toContain("预览落点：[0, 0, 0.4]");
  });

  it("builds architecture from semantic element records", async () => {
    const sceneService = createSceneService({ createId: () => "agent", broadcast: vi.fn() });
    const result = await executeAgentToolCall(
      createToolCall("create_architecture_elements", {
        expected_revision: sceneService.getSnapshot().revision,
        elements: [{ kind: "wall", reference: "客厅北墙", properties: { start: [0, 0], end: [4, 0], height: 2.8 } }]
      }),
      createContext({ getSceneSnapshot: sceneService.getSnapshot, executeSceneCommand: sceneService.execute, executeSceneBatch: sceneService.executeBatch })
    );

    expect(result.toolName).toBe("create_architecture_elements");
    expect(result.summary).toContain("1 个建筑元素");
    expect(Object.values(sceneService.getSnapshot().nodes)).toContainEqual(expect.objectContaining({ type: "wall", name: "客厅北墙" }));
  });

  it("deletes multiple architecture elements atomically without stale revisions", async () => {
    const sceneService = createSceneService({ createId: (prefix) => `${prefix}_${Date.now()}`, broadcast: vi.fn() });
    sceneService.execute({ type: "wall.create", id: "wall_batch_north", parentId: "level_default", start: [0, 0], end: [4, 0] });
    sceneService.execute({ type: "wall.create", id: "wall_batch_east", parentId: "level_default", start: [4, 0], end: [4, 4] });
    const revision = sceneService.getSnapshot().revision;
    const result = await executeAgentToolCall(
      createToolCall("update_architecture_elements", {
        expected_revision: revision,
        items: [
          { element_id: "wall_batch_north", action: "delete" },
          { element_id: "wall_batch_east", action: "delete" }
        ]
      }),
      createContext({ getSceneSnapshot: sceneService.getSnapshot, executeSceneCommand: sceneService.execute, executeSceneBatch: sceneService.executeBatch })
    );

    expect(result.summary).toContain("2 个建筑元素");
    expect(sceneService.getSnapshot().revision).toBe(revision + 1);
    expect(sceneService.getSnapshot().nodes.wall_batch_north).toBeUndefined();
    expect(sceneService.getSnapshot().nodes.wall_batch_east).toBeUndefined();
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
      chatModel: "hy3-preview",
      thinkingEnabled: true,
      reasoningEffort: "",
      requestTimeoutSeconds: 60,
      contextWindowTokens: 256000,
      maxOutputTokens: 16000,
      apiKeyConfigured: true
    },
    tokenHubImage: {
      endpoint: "https://tokenhub.tencentmaas.com/v1/api/image/lite",
      model: "hy-image-v3.0",
      requestTimeoutSeconds: 60
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
