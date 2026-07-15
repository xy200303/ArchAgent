/** Maps shared architecture coordinates into stable Three.js mesh transforms. */
import type { ScenePoint } from "../../../../../shared/modeling3d/sceneContracts";

export interface WallViewportTransform {
  length: number;
  position: [number, number, number];
  rotationY: number;
}

/**
 * Builds a box transform for a wall whose shared coordinates live on the X/Z plane.
 * Three boxes extend along local X, so the Z component needs an inverted Y rotation.
 */
export function getWallViewportTransform(
  start: ScenePoint,
  end: ScenePoint,
  height: number
): WallViewportTransform {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const rotationY = -Math.atan2(deltaZ, deltaX);

  return {
    length: Math.hypot(deltaX, deltaZ),
    position: [(start[0] + end[0]) / 2, height / 2, (start[1] + end[1]) / 2],
    rotationY: Object.is(rotationY, -0) ? 0 : rotationY
  };
}
