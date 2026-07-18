import { describe, expect, it, vi } from "vitest";
import { createReconstructionWorkflowService } from "../../../src/main/agent/reconstructionWorkflowService";
import type { ChatSession, RendererEvent } from "../../../src/shared/types";

describe("reconstructionWorkflowService", () => {
  it("requires answers and an explicit confirmation before exposing an Agent-executable plan", async () => {
    const session = createSession();
    const sessions = new Map([[session.id, session]]);
    const placeComponentLibraryItem = vi.fn(() => ({
      accepted: true as const,
      command: {
        type: "asset.create" as const,
        id: "asset_sofa",
        parentId: "level_default",
        name: "现代沙发",
        format: "glb" as const,
        sourcePath: "assets/sofa.glb"
      },
      snapshot: { revision: 1, rootNodeIds: [], nodes: {} }
    }));
    const service = createReconstructionWorkflowService({
      rootDir: process.cwd(),
      sessions,
      getSessionOutputDir: () => process.cwd(),
      createId: (prefix) => `${prefix}_1`,
      now: () => "2026-07-18T00:00:00.000Z",
      schedulePersistState: vi.fn(),
      sendEvent: vi.fn<(event: RendererEvent) => void>(),
      placeComponentLibraryItem
    });

    const workflow = service.createPlan(session.id, {
      mode: "photo_complex",
      title: "客厅还原",
      summary: "复用沙发，等待确认窗帘范围。",
      questions: [{
        id: "curtain",
        prompt: "是否保留窗帘？",
        options: [{ id: "keep", label: "保留" }, { id: "skip", label: "不保留" }]
      }],
      assets: [{ id: "sofa", name: "现代沙发", source: "library", componentId: "library/sofa.glb" }]
    });

    expect(workflow.status).toBe("needs_clarification");
    expect(() => service.confirm({ sessionId: session.id, workflowId: workflow.id, revision: workflow.revision })).toThrow("先回答");
    expect(placeComponentLibraryItem).not.toHaveBeenCalled();

    service.answer({ sessionId: session.id, workflowId: workflow.id, revision: workflow.revision, questionId: "curtain", optionId: "keep" });
    expect(session.workflow?.status).toBe("ready_for_confirmation");
    service.confirm({ sessionId: session.id, workflowId: workflow.id, revision: workflow.revision });
    expect(session.workflow?.status).toBe("confirmed");

    expect(placeComponentLibraryItem).not.toHaveBeenCalled();
    expect(session.workflow?.assets[0]).toMatchObject({ status: "planned" });
  });

  it("rejects stale confirmation versions", () => {
    const session = createSession();
    const service = createReconstructionWorkflowService({
      rootDir: process.cwd(),
      sessions: new Map([[session.id, session]]),
      getSessionOutputDir: () => process.cwd(),
      createId: (prefix) => `${prefix}_1`,
      now: () => "2026-07-18T00:00:00.000Z",
      schedulePersistState: vi.fn(),
      sendEvent: vi.fn(),
      placeComponentLibraryItem: vi.fn()
    });
    const workflow = service.createPlan(session.id, {
      mode: "floorplan",
      title: "户型方案",
      summary: "等待确认。",
      assets: [{ id: "bed", name: "床", source: "library", componentId: "library/bed.glb" }]
    });

    expect(() => service.confirm({ sessionId: session.id, workflowId: workflow.id, revision: workflow.revision + 1 })).toThrow("版本已变化");
  });

  it("does not place an approved asset behind the Agent's back", async () => {
    const session = createSession();
    const placeComponentLibraryItem = vi.fn(() => ({
      accepted: true as const,
      command: { type: "asset.create" as const, id: "asset_sofa", parentId: "level_default", name: "沙发", format: "glb" as const, sourcePath: "assets/sofa.glb" },
      snapshot: { revision: 1, rootNodeIds: [], nodes: {} }
    }));
    const service = createReconstructionWorkflowService({
      rootDir: process.cwd(), sessions: new Map([[session.id, session]]), getSessionOutputDir: () => process.cwd(), createId: (prefix) => `${prefix}_1`, now: () => "2026-07-18T00:00:00.000Z", schedulePersistState: vi.fn(), sendEvent: vi.fn(), placeComponentLibraryItem,
      getSceneSnapshot: () => ({ revision: 1, rootNodeIds: ["site_default"], nodes: { wall_east: { id: "wall_east", type: "wall", name: "东墙", parentId: "level_default", start: [4, 0], end: [4, 4], height: 2.8, thickness: 0.2, materialPreset: "plaster" } } })
    });
    const workflow = service.createPlan(session.id, {
      mode: "floorplan", title: "客厅", summary: "靠东墙放置沙发", assets: [{ id: "sofa", name: "沙发", source: "library", componentId: "library/sofa", placement: { anchor: { elementId: "wall_east", side: "inside", distance: 0.5 }, local: [0, 0, 0], facing: "west", footprint: [2, 1] } }]
    });
    service.confirm({ sessionId: session.id, workflowId: workflow.id, revision: workflow.revision });
    expect(session.workflow?.status).toBe("confirmed");
    expect(placeComponentLibraryItem).not.toHaveBeenCalled();
  });
});

function createSession(): ChatSession {
  return {
    id: "session_1",
    title: "测试会话",
    status: "idle",
    projectPath: process.cwd(),
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    items: []
  };
}
