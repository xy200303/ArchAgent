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
});
