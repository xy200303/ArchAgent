/** Builds a compact, tool-safe description of the authoritative building scene. */
import type {
  SceneDoorNode,
  SceneCeilingNode,
  SceneColumnNode,
  SceneFenceNode,
  SceneSlabNode,
  SceneStairNode,
  SceneSnapshot,
  SceneWallNode,
  SceneWindowNode,
  SceneZoneNode,
  SceneAssetNode
} from "../../shared/modeling3d/sceneContracts";

/**
 * Limits Agent context to the architectural facts needed for follow-up commands.
 * The full snapshot remains owned by SceneService and is never exposed as mutable state.
 */
export function summarizeSceneForAgent(snapshot: SceneSnapshot): string {
  const walls = Object.values(snapshot.nodes).filter((node): node is SceneWallNode => node.type === "wall");
  const slabs = Object.values(snapshot.nodes).filter((node): node is SceneSlabNode => node.type === "slab");
  const ceilings = Object.values(snapshot.nodes).filter((node): node is SceneCeilingNode => node.type === "ceiling");
  const columns = Object.values(snapshot.nodes).filter((node): node is SceneColumnNode => node.type === "column");
  const zones = Object.values(snapshot.nodes).filter((node): node is SceneZoneNode => node.type === "zone");
  const stairs = Object.values(snapshot.nodes).filter((node): node is SceneStairNode => node.type === "stair");
  const fences = Object.values(snapshot.nodes).filter((node): node is SceneFenceNode => node.type === "fence");
  const doors = Object.values(snapshot.nodes).filter((node): node is SceneDoorNode => node.type === "door");
  const windows = Object.values(snapshot.nodes).filter((node): node is SceneWindowNode => node.type === "window");
  const assets = Object.values(snapshot.nodes).filter((node): node is SceneAssetNode => node.type === "asset");
  const levels = Object.values(snapshot.nodes).filter((node) => node.type === "level");

  return [
    `场景版本：${snapshot.revision}`,
    `楼层：${levels.map((level) => `${level.name}（${level.id}）`).join("；") || "无"}`,
    `墙体数量：${walls.length}`,
    walls.length
      ? "墙体：\n" + walls.map((wall) => formatWall(wall)).join("\n")
      : "墙体：无",
    slabs.length
      ? "楼板：\n" + slabs.map((slab) => `- ${slab.name}（${slab.id}）：${slab.polygon.length} 点轮廓，标高 ${slab.elevation}m，${slab.materialPreset}`).join("\n")
      : "楼板：无",
    ceilings.length
      ? "天花：\n" + ceilings.map((ceiling) => `- ${ceiling.name}（${ceiling.id}）：${ceiling.polygon.length} 点轮廓，高度 ${ceiling.height}m，${ceiling.materialPreset}`).join("\n")
      : "天花：无",
    columns.length
      ? "柱：\n" + columns.map((column) => `- ${column.name}（${column.id}）：[${column.position.join(", ")}]，${column.crossSection} 截面，${column.width}m × ${column.depth}m × ${column.height}m，${column.materialPreset}`).join("\n")
      : "柱：无",
    zones.length
      ? "房间：\n" + zones.map((zone) => `- ${zone.name}（${zone.id}）：${zone.polygon.length} 点轮廓，颜色 ${zone.color}`).join("\n")
      : "房间：无",
    stairs.length
      ? "楼梯：\n" + stairs.map((stair) => `- ${stair.name}（${stair.id}）：[${stair.position.join(", ")}]，宽 ${stair.width}m，升高 ${stair.totalRise}m，${stair.stepCount} 级，扶手 ${stair.railingMode}`).join("\n")
      : "楼梯：无",
    fences.length
      ? "围栏：\n" + fences.map((fence) => `- ${fence.name}（${fence.id}）：[${fence.start.join(", ")}] → [${fence.end.join(", ")}]，高 ${fence.height}m，${fence.style}，${fence.materialPreset}`).join("\n")
      : "围栏：无",
    doors.length
      ? "门：\n" + doors.map((door) => formatOpening(door)).join("\n")
      : "门：无",
    windows.length
      ? "窗：\n" + windows.map((window) => formatOpening(window)).join("\n")
      : "窗：无",
    assets.length
      ? "参考模型：\n" + assets.map((asset) => `- ${asset.name}（${asset.id}）：${asset.format.toUpperCase()}，位置 [${asset.position.join(", ")}]，缩放 [${asset.scale.join(", ")}]`).join("\n")
      : "参考模型：无"
  ].join("\n");
}

function formatWall(wall: SceneWallNode): string {
  return `- ${wall.name}（${wall.id}）：[${wall.start.join(", ")}] → [${wall.end.join(", ")}]，高 ${wall.height}m，厚 ${wall.thickness}m，${wall.materialPreset}`;
}

function formatOpening(opening: SceneDoorNode | SceneWindowNode): string {
  return `- ${opening.name}（${opening.id}）：墙体 ${opening.wallId}，偏移 ${opening.offset}m，${opening.width}m × ${opening.height}m，${opening.materialPreset}`;
}
