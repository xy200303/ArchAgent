/** Converts viewport pointers into stable, snapped wall-tool coordinates. */
import type { ScenePoint } from "../../../../../shared/modeling3d/sceneContracts";

export const WALL_DRAW_GRID_SIZE = 0.25;

/** Snaps an X/Z point to the construction grid before it becomes a wall endpoint. */
export function snapWallDrawingPoint(point: ScenePoint, gridSize = WALL_DRAW_GRID_SIZE): ScenePoint {
  return [snapCoordinate(point[0], gridSize), snapCoordinate(point[1], gridSize)];
}

/** Avoids creating invalid zero-length scene commands from a repeated click. */
export function isWallDrawingSegment(start: ScenePoint, end: ScenePoint): boolean {
  return Math.hypot(end[0] - start[0], end[1] - start[1]) >= 0.01;
}

export interface WallDrawingPreviewTransform {
  length: number;
  position: [number, number, number];
  rotationY: number;
}

/** Maps a shared X/Z wall segment to a Three.js box transform. */
export function getWallDrawingPreviewTransform(
  start: ScenePoint,
  end: ScenePoint,
  height: number
): WallDrawingPreviewTransform {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const rotationY = -Math.atan2(deltaZ, deltaX);

  return {
    length: Math.hypot(deltaX, deltaZ),
    position: [(start[0] + end[0]) / 2, height / 2, (start[1] + end[1]) / 2],
    rotationY: Object.is(rotationY, -0) ? 0 : rotationY
  };
}

function snapCoordinate(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}
