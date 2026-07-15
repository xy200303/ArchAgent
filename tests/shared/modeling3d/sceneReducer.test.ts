import { describe, expect, it } from "vitest";
import { applySceneCommand, createDefaultScene } from "../../../src/shared/modeling3d/sceneReducer";

describe("sceneReducer", () => {
  it("creates a valid wall under a level and increments the snapshot revision", () => {
    const initial = createDefaultScene();
    const result = applySceneCommand(
      initial,
      { type: "wall.create", id: "wall_entry", parentId: "level_default", start: [1, 1], end: [3, 1] },
      () => "unused"
    );

    expect(result).toMatchObject({ accepted: true, snapshot: { revision: 1 } });
    if (!result.accepted) return;
    expect(result.snapshot.nodes.wall_entry).toMatchObject({ type: "wall", height: 2.8, thickness: 0.2 });
  });

  it("rejects a zero-length wall without mutating the current snapshot", () => {
    const initial = createDefaultScene();
    const result = applySceneCommand(
      initial,
      { type: "wall.create", parentId: "level_default", start: [2, 2], end: [2, 2] },
      () => "invalid"
    );

    expect(result).toMatchObject({ accepted: false, code: "invalid_command" });
    expect(initial.revision).toBe(0);
    expect(Object.keys(initial.nodes)).toHaveLength(8);
  });

  it("updates and deletes existing walls while rejecting unsupported nodes", () => {
    const initial = createDefaultScene();
    const updated = applySceneCommand(initial, { type: "wall.update", id: "wall_north", height: 3.2 }, () => "unused");
    if (!updated.accepted) throw new Error(updated.message);

    const deleted = applySceneCommand(updated.snapshot, { type: "node.delete", id: "wall_north" }, () => "unused");
    const invalidDelete = applySceneCommand(updated.snapshot, { type: "node.delete", id: "level_default" }, () => "unused");

    expect(updated.snapshot.nodes.wall_north).toMatchObject({ height: 3.2 });
    expect(deleted).toMatchObject({ accepted: true, snapshot: { revision: 2 } });
    expect(invalidDelete).toMatchObject({ accepted: false, code: "unsupported_node" });
  });
});
