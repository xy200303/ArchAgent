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

  it("creates, updates, and deletes a valid rectangular slab", () => {
    const initial = createDefaultScene();
    const created = applySceneCommand(
      initial,
      {
        type: "slab.create",
        id: "slab_terrace",
        parentId: "level_default",
        polygon: [[6, 0], [8, 0], [8, 2], [6, 2]],
        elevation: 0.15,
        materialPreset: "tile"
      },
      () => "unused"
    );
    if (!created.accepted) throw new Error(created.message);

    const updated = applySceneCommand(created.snapshot, { type: "slab.update", id: "slab_terrace", elevation: 0.2 }, () => "unused");
    const deleted = updated.accepted
      ? applySceneCommand(updated.snapshot, { type: "node.delete", id: "slab_terrace" }, () => "unused")
      : updated;

    expect(created.snapshot.nodes.slab_terrace).toMatchObject({ type: "slab", materialPreset: "tile" });
    expect(updated).toMatchObject({ accepted: true, snapshot: { revision: 2 } });
    expect(deleted).toMatchObject({ accepted: true, snapshot: { revision: 3 } });
  });

  it("creates and updates a ceiling under a valid level", () => {
    const initial = createDefaultScene();
    const created = applySceneCommand(initial, { type: "ceiling.create", id: "ceiling_main", parentId: "level_default", polygon: [[0, 0], [5, 0], [5, 4], [0, 4]], height: 3 }, () => "unused");
    if (!created.accepted) throw new Error(created.message);
    const updated = applySceneCommand(created.snapshot, { type: "ceiling.update", id: "ceiling_main", height: 3.2 }, () => "unused");

    expect(created.snapshot.nodes.ceiling_main).toMatchObject({ type: "ceiling", height: 3 });
    expect(updated).toMatchObject({ accepted: true, snapshot: { revision: 2, nodes: { ceiling_main: { height: 3.2 } } } });
  });

  it("creates a structural column with validated dimensions", () => {
    const result = applySceneCommand(createDefaultScene(), { type: "column.create", id: "column_entry", parentId: "level_default", position: [2, 0, 2], height: 2.8, width: 0.3, depth: 0.3 }, () => "unused");
    expect(result).toMatchObject({ accepted: true, snapshot: { nodes: { column_entry: { type: "column", crossSection: "square" } } } });
  });

  it("creates, updates, and deletes a straight stair", () => {
    const created = applySceneCommand(
      createDefaultScene(),
      {
        type: "stair.create",
        id: "stair_lobby",
        parentId: "level_default",
        position: [1, 0, 2],
        width: 1.2,
        totalRise: 3,
        stepCount: 18,
        railingMode: "left"
      },
      () => "unused"
    );
    if (!created.accepted) throw new Error(created.message);

    const updated = applySceneCommand(
      created.snapshot,
      { type: "stair.update", id: "stair_lobby", width: 1.4, railingMode: "both" },
      () => "unused"
    );
    if (!updated.accepted) throw new Error(updated.message);

    const deleted = applySceneCommand(updated.snapshot, { type: "node.delete", id: "stair_lobby" }, () => "unused");

    expect(created.snapshot.nodes.stair_lobby).toMatchObject({ type: "stair", railingMode: "left", stepCount: 18 });
    expect(updated.snapshot.nodes.stair_lobby).toMatchObject({ width: 1.4, railingMode: "both" });
    expect(deleted).toMatchObject({ accepted: true, snapshot: { revision: 3 } });
    if (!deleted.accepted) return;
    expect(deleted.snapshot.nodes.stair_lobby).toBeUndefined();
  });

  it("creates a Pascal-native fence with validated endpoints", () => {
    const created = applySceneCommand(
      createDefaultScene(),
      {
        type: "fence.create",
        id: "fence_terrace",
        parentId: "level_default",
        start: [0, 4],
        end: [4, 4],
        height: 1.2,
        style: "rail"
      },
      () => "unused"
    );
    if (!created.accepted) throw new Error(created.message);

    const invalid = applySceneCommand(
      created.snapshot,
      { type: "fence.update", id: "fence_terrace", start: [2, 2], end: [2, 2] },
      () => "unused"
    );

    expect(created.snapshot.nodes.fence_terrace).toMatchObject({ type: "fence", style: "rail" });
    expect(invalid).toMatchObject({ accepted: false, code: "invalid_command" });
  });

  it("creates wall-hosted doors while rejecting overlaps and wall-end overflow", () => {
    const initial = createDefaultScene();
    const created = applySceneCommand(initial, { type: "door.create", id: "door_entry", wallId: "wall_north", offset: 1, width: 0.9 }, () => "unused");
    if (!created.accepted) throw new Error(created.message);

    const overlap = applySceneCommand(created.snapshot, { type: "door.create", wallId: "wall_north", offset: 1.5, width: 1 }, () => "unused");
    const overflow = applySceneCommand(created.snapshot, { type: "door.create", wallId: "wall_north", offset: 4.5, width: 0.6 }, () => "unused");

    expect(created.snapshot.nodes.door_entry).toMatchObject({ type: "door", parentId: "wall_north" });
    expect(overlap).toMatchObject({ accepted: false, code: "invalid_command" });
    expect(overflow).toMatchObject({ accepted: false, code: "invalid_command" });
  });

  it("rejects a window that overlaps an existing door on the same wall", () => {
    const initial = createDefaultScene();
    const door = applySceneCommand(initial, { type: "door.create", id: "door_entry", wallId: "wall_north", offset: 1, width: 0.9 }, () => "unused");
    if (!door.accepted) throw new Error(door.message);
    const window = applySceneCommand(door.snapshot, { type: "window.create", id: "window_entry", wallId: "wall_north", offset: 1.4, width: 1.2 }, () => "unused");
    expect(window).toMatchObject({ accepted: false, code: "invalid_command" });
  });
});
