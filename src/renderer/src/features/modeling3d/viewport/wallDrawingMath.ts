/** Converts pointer rays into snapped architecture coordinates for the wall tool. */
import * as THREE from "three";
import type { ScenePoint } from "../../../../../shared/modeling3d/sceneContracts";

export const WALL_DRAW_GRID_SIZE = 0.25;

/** Snaps an X/Z scene point to the editor's construction grid. */
export function snapScenePoint(point: ScenePoint, gridSize = WALL_DRAW_GRID_SIZE): ScenePoint {
  return [snapCoordinate(point[0], gridSize), snapCoordinate(point[1], gridSize)];
}

/** Intersects a camera ray with the ground plane before applying construction-grid snapping. */
export function getSnappedGroundPoint(ray: THREE.Ray, gridSize = WALL_DRAW_GRID_SIZE): ScenePoint | undefined {
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const intersection = ray.intersectPlane(ground, new THREE.Vector3());
  if (!intersection) return undefined;
  return snapScenePoint([intersection.x, intersection.z], gridSize);
}

export function isWallDrawingSegment(start: ScenePoint, end: ScenePoint): boolean {
  return Math.hypot(end[0] - start[0], end[1] - start[1]) >= 0.01;
}

function snapCoordinate(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}
