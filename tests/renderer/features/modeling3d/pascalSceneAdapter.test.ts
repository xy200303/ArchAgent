import { describe, expect, it } from "vitest";
import { collectPascalChildIds } from "../../../../src/renderer/src/features/modeling3d/scene/pascalSceneHierarchy";
import { createDefaultScene } from "../../../../src/shared/modeling3d/sceneReducer";

describe("pascalSceneAdapter", () => {
  it("converts the flat scene contract into Pascal's traversable children hierarchy", () => {
    const childIds = collectPascalChildIds(createDefaultScene());

    expect(childIds.site_default).toEqual(["building_default"]);
    expect(childIds.building_default).toEqual(["level_default"]);
    expect(childIds.level_default).toEqual(["slab_floor", "wall_north", "wall_east", "wall_south", "wall_west"]);
  });
});
