import { describe, expect, it } from "vitest";
import { getWallViewportTransform } from "../../../../src/renderer/src/features/modeling3d/viewport/sceneViewportMath";
import { isWallDrawingSegment, snapScenePoint } from "../../../../src/renderer/src/features/modeling3d/viewport/wallDrawingMath";

describe("sceneViewportMath", () => {
  it("maps a horizontal wall to a centered, unrotated Three.js box", () => {
    expect(getWallViewportTransform([0, 0], [5, 0], 2.8)).toEqual({
      length: 5,
      position: [2.5, 1.4, 0],
      rotationY: 0
    });
  });

  it("rotates a vertical scene wall so its box follows the positive Z axis", () => {
    const transform = getWallViewportTransform([5, 0], [5, 4], 2.8);

    expect(transform.length).toBe(4);
    expect(transform.position).toEqual([5, 1.4, 2]);
    expect(transform.rotationY).toBeCloseTo(-Math.PI / 2);
  });

  it("snaps wall drawing points to the quarter-meter construction grid", () => {
    expect(snapScenePoint([1.13, -2.37])).toEqual([1.25, -2.25]);
  });

  it("requires a non-zero segment before creating a wall command", () => {
    expect(isWallDrawingSegment([1, 1], [1, 1])).toBe(false);
    expect(isWallDrawingSegment([1, 1], [1.25, 1])).toBe(true);
  });
});
