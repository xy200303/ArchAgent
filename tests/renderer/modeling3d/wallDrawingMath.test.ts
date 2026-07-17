import { describe, expect, it } from "vitest";
import { getWallDrawingPreviewTransform, isWallDrawingSegment, snapWallDrawingPoint } from "../../../src/renderer/src/features/modeling3d/viewer/wallDrawingMath";

describe("wallDrawingMath", () => {
  it("snaps pointer positions to the 0.25 metre construction grid", () => {
    expect(snapWallDrawingPoint([1.13, -2.38])).toEqual([1.25, -2.5]);
  });

  it("rejects repeated drawing clicks and maps valid segments into a preview box", () => {
    expect(isWallDrawingSegment([1, 1], [1, 1])).toBe(false);
    expect(isWallDrawingSegment([1, 1], [2, 1.5])).toBe(true);
    expect(getWallDrawingPreviewTransform([1, 1], [3, 1], 2.8)).toEqual({
      length: 2,
      position: [2, 1.4, 1],
      rotationY: 0
    });
  });
});
