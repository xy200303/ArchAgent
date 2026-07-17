/** Maps a ground placement point to the smallest valid update command for a selected scene component. */
import type { SceneCommandInput, SceneNode, ScenePoint } from "../../../../../shared/modeling3d/sceneContracts";

export type RelocationResult =
  | { command: SceneCommandInput }
  | { error: string };

export function canRelocateSceneNode(node: SceneNode): boolean {
  return node.type === "wall" || node.type === "fence" || node.type === "slab" || node.type === "ceiling" || node.type === "zone" || node.type === "column" || node.type === "stair" || node.type === "asset";
}

export function buildRelocationCommand(node: SceneNode, target: ScenePoint): RelocationResult {
  if (node.type === "wall" || node.type === "fence") {
    const center = getSegmentCenter(node.start, node.end);
    const offset: ScenePoint = [target[0] - center[0], target[1] - center[1]];
    const start = translatePoint(node.start, offset);
    const end = translatePoint(node.end, offset);
    return { command: node.type === "wall" ? { type: "wall.update", id: node.id, start, end } : { type: "fence.update", id: node.id, start, end } };
  }
  if (node.type === "slab" || node.type === "ceiling" || node.type === "zone") {
    const center = getPolygonCenter(node.polygon);
    const offset: ScenePoint = [target[0] - center[0], target[1] - center[1]];
    const polygon = node.polygon.map((point) => translatePoint(point, offset));
    if (node.type === "slab") return { command: { type: "slab.update", id: node.id, polygon } };
    if (node.type === "ceiling") return { command: { type: "ceiling.update", id: node.id, polygon } };
    return { command: { type: "zone.update", id: node.id, polygon } };
  }
  if (node.type === "column" || node.type === "stair" || node.type === "asset") {
    const position: [number, number, number] = [target[0], node.position[1], target[1]];
    if (node.type === "column") return { command: { type: "column.update", id: node.id, position } };
    if (node.type === "stair") return { command: { type: "stair.update", id: node.id, position } };
    return { command: { type: "asset.update", id: node.id, position } };
  }
  if (node.type === "door" || node.type === "window") {
    return { error: "门窗必须保持绑定墙体，请在属性面板中调整所属墙体和沿墙偏移。" };
  }
  return { error: "当前节点不支持重新放置。" };
}

function getSegmentCenter(start: ScenePoint, end: ScenePoint): ScenePoint {
  return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
}

function getPolygonCenter(polygon: ScenePoint[]): ScenePoint {
  const total = polygon.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]] as ScenePoint, [0, 0]);
  return [total[0] / polygon.length, total[1] / polygon.length];
}

function translatePoint(point: ScenePoint, offset: ScenePoint): ScenePoint {
  return [point[0] + offset[0], point[1] + offset[1]];
}
