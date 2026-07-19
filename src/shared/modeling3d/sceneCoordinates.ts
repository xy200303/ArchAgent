/** Defines the world-coordinate and semantic-anchor conventions shared by planning, editing, and rendering. */
import type { ScenePoint, SceneSnapshot } from "./sceneContracts";

export interface SceneCoordinateContext {
  unit: "m";
  handedness: "right";
  origin: [number, number, number];
  axes: { x: string; y: string; z: string };
  rotation: string;
  assetAnchor: string;
  floorBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export function getSceneCoordinateContext(snapshot: SceneSnapshot): SceneCoordinateContext {
  const floorPoints = Object.values(snapshot.nodes).flatMap((node) => node.type === "slab" ? node.polygon : []);
  const wallPoints = Object.values(snapshot.nodes).flatMap((node) => node.type === "wall" ? [node.start, node.end] : []);
  const points = floorPoints.length ? floorPoints : wallPoints;
  return {
    unit: "m",
    handedness: "right",
    origin: [0, 0, 0],
    axes: { x: "向右/东", y: "向上（高度）", z: "向前/南" },
    rotation: "家具语义朝向优先使用 facing 或 look_at；需要精确姿态时才使用 rotation_degrees=[pitch,yaw,roll]。",
    assetAnchor: "家具可用世界 position=[x,y,z]，或锚定墙体：anchor={element_id,side,distance}+local=[沿墙,高度,额外离墙]。side=room_interior（inside 兼容别名）会按房间/楼板边界自动判定室内侧，不依赖墙体绘制方向；distance 从墙面起算。资产位置指向归一化模型底部中心。",
    ...(points.length ? { floorBounds: getFloorBounds(points) } : {})
  };
}

export function formatSceneCoordinateContext(context: SceneCoordinateContext): string {
  const bounds = context.floorBounds ? `；当前平面范围 X=[${context.floorBounds.minX}, ${context.floorBounds.maxX}]，Z=[${context.floorBounds.minZ}, ${context.floorBounds.maxZ}]` : "";
  return `世界坐标系：右手系，单位米；原点 [0,0,0]；X ${context.axes.x}，Y ${context.axes.y}，Z ${context.axes.z}。${context.rotation}${context.assetAnchor}${bounds}`;
}

function getFloorBounds(points: ScenePoint[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const xs = points.map((point) => point[0]);
  const zs = points.map((point) => point[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}
