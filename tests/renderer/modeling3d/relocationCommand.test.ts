import { describe, expect, it } from "vitest";
import { buildRelocationCommand } from "../../../src/renderer/src/features/modeling3d/viewer/relocationCommand";

describe("buildRelocationCommand", () => {
  it("translates a wall without changing its segment dimensions", () => {
    const result = buildRelocationCommand({
      id: "wall_1", type: "wall", name: "外墙", parentId: "level_1", start: [1, 2], end: [5, 2], height: 2.8, thickness: 0.2, materialPreset: "plaster"
    }, [10, 12]);

    expect(result).toEqual({ command: { type: "wall.update", id: "wall_1", start: [8, 12], end: [12, 12] } });
  });

  it("translates a slab polygon as one placement operation", () => {
    const result = buildRelocationCommand({
      id: "slab_1", type: "slab", name: "楼板", parentId: "level_1", polygon: [[0, 0], [4, 0], [4, 2], [0, 2]], elevation: 0, materialPreset: "concrete"
    }, [12, 9]);

    expect(result).toEqual({ command: { type: "slab.update", id: "slab_1", polygon: [[10, 8], [14, 8], [14, 10], [10, 10]] } });
  });

  it("moves an imported asset across the ground while retaining its height", () => {
    const result = buildRelocationCommand({
      id: "asset_1", type: "asset", name: "沙发", parentId: "level_1", format: "glb", sourcePath: "assets/sofa.glb", position: [1, 0.3, 2], rotation: [0, 0.5, 0], scale: [1, 1, 1]
    }, [8, 11]);

    expect(result).toEqual({ command: { type: "asset.update", id: "asset_1", position: [8, 0.3, 11] } });
  });

  it("keeps hosted openings on their wall", () => {
    const result = buildRelocationCommand({
      id: "door_1", type: "door", name: "入户门", parentId: "level_1", wallId: "wall_1", offset: 1, width: 0.9, height: 2.1, sillHeight: 0, materialPreset: "wood"
    }, [4, 5]);

    expect(result).toEqual({ error: "门窗必须保持绑定墙体，请在属性面板中调整所属墙体和沿墙偏移。" });
  });
});
