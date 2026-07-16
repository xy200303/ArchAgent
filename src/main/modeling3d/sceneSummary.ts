/** Builds a compact, tool-safe description of the authoritative building scene. */
import type { SceneSnapshot, SceneWallNode } from "../../shared/modeling3d/sceneContracts";

/**
 * Limits Agent context to the architectural facts needed for follow-up commands.
 * The full snapshot remains owned by SceneService and is never exposed as mutable state.
 */
export function summarizeSceneForAgent(snapshot: SceneSnapshot): string {
  const walls = Object.values(snapshot.nodes).filter((node): node is SceneWallNode => node.type === "wall");
  const levels = Object.values(snapshot.nodes).filter((node) => node.type === "level");

  return [
    `场景版本：${snapshot.revision}`,
    `楼层：${levels.map((level) => `${level.name}（${level.id}）`).join("；") || "无"}`,
    `墙体数量：${walls.length}`,
    walls.length
      ? "墙体：\n" + walls.map((wall) => formatWall(wall)).join("\n")
      : "墙体：无"
  ].join("\n");
}

function formatWall(wall: SceneWallNode): string {
  return `- ${wall.name}（${wall.id}）：[${wall.start.join(", ")}] → [${wall.end.join(", ")}]，高 ${wall.height}m，厚 ${wall.thickness}m，${wall.materialPreset}`;
}
