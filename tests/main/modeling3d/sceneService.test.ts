import { describe, expect, it, vi } from "vitest";
import { createSceneService } from "../../../src/main/modeling3d/sceneService";

describe("sceneService", () => {
  it("broadcasts only accepted commands and retains the authoritative snapshot", () => {
    const broadcast = vi.fn();
    const service = createSceneService({ createId: (prefix) => `${prefix}_test`, broadcast });

    const rejected = service.execute({ type: "wall.create", parentId: "missing", start: [0, 0], end: [1, 0] });
    const accepted = service.execute({ type: "wall.create", parentId: "level_default", start: [0, 0], end: [1, 0] });

    expect(rejected).toMatchObject({ accepted: false, code: "invalid_parent" });
    expect(accepted).toMatchObject({ accepted: true, snapshot: { revision: 1 } });
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().revision).toBe(1);
  });

  it("restores command snapshots through undo and redo", () => {
    const broadcast = vi.fn();
    const service = createSceneService({ createId: (prefix) => `${prefix}_test`, broadcast });
    service.execute({ type: "wall.create", parentId: "level_default", start: [6, 0], end: [7, 0] });

    const undone = service.undo();
    const redone = service.redo();

    expect(undone).toMatchObject({ accepted: true, canRedo: true, snapshot: { revision: 0 } });
    expect(redone).toMatchObject({ accepted: true, canUndo: true, snapshot: { revision: 1 } });
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: "scene.snapshot.restored" }));
  });

  it("commits a validated command batch as one scene revision", () => {
    const service = createSceneService({ createId: (prefix) => `${prefix}_test`, broadcast: vi.fn() });
    const result = service.executeBatch([
      { type: "wall.create", id: "wall_batch_a", parentId: "level_default", start: [0, 0], end: [2, 0] },
      { type: "wall.create", id: "wall_batch_b", parentId: "level_default", start: [2, 0], end: [2, 2] }
    ]);

    expect(result).toMatchObject({ accepted: true, snapshot: { revision: 1 } });
    expect(service.getSnapshot().nodes).toMatchObject({ wall_batch_a: { type: "wall" }, wall_batch_b: { type: "wall" } });
  });

  it("rejects a batch without applying its earlier commands", () => {
    const service = createSceneService({ createId: (prefix) => `${prefix}_test`, broadcast: vi.fn() });
    const result = service.executeBatch([
      { type: "wall.create", id: "wall_valid", parentId: "level_default", start: [0, 0], end: [2, 0] },
      { type: "wall.create", id: "wall_invalid", parentId: "missing", start: [2, 0], end: [2, 2] }
    ]);

    expect(result).toMatchObject({ accepted: false, failedIndex: 1 });
    expect(service.getSnapshot().nodes.wall_valid).toBeUndefined();
  });

  it("persists each active project scene independently", () => {
    const snapshots = new Map();
    const service = createSceneService({
      createId: (prefix) => `${prefix}_test`,
      broadcast: vi.fn(),
      loadProjectSnapshot: (projectPath) => snapshots.get(projectPath),
      saveProjectSnapshot: (projectPath, snapshot) => snapshots.set(projectPath, snapshot)
    });

    service.activateProject("C:/projects/one");
    service.execute({ type: "wall.create", id: "wall_project_one", parentId: "level_default", start: [6, 0], end: [7, 0] });
    service.activateProject("C:/projects/two");
    const projectTwo = service.getSnapshot();
    service.activateProject("C:/projects/one");

    expect(projectTwo.nodes.wall_project_one).toBeUndefined();
    expect(service.getSnapshot().nodes.wall_project_one).toMatchObject({ type: "wall" });
  });

  it("persists an imported scene replacement and makes it undoable", () => {
    const service = createSceneService({ createId: (prefix) => `${prefix}_test`, broadcast: vi.fn() });
    const imported = structuredClone(service.getSnapshot());
    imported.revision = 12;

    service.replaceSnapshot(imported);
    const undone = service.undo();

    expect(service.getSnapshot().revision).toBe(0);
    expect(undone).toMatchObject({ accepted: true, canRedo: true });
  });
});
