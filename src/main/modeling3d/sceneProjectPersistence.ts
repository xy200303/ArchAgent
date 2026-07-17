/** Reads and writes the authoritative scene snapshot inside each project. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SceneSnapshot } from "../../shared/modeling3d/sceneContracts";

const SCENE_FILE_NAME = "scene.json";

export function loadProjectScene(projectPath: string): SceneSnapshot | undefined {
  const path = join(projectPath, ".agent", SCENE_FILE_NAME);
  if (!existsSync(path)) return undefined;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isSceneSnapshot(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function saveProjectScene(projectPath: string, snapshot: SceneSnapshot): void {
  writeFileSync(join(projectPath, ".agent", SCENE_FILE_NAME), JSON.stringify(snapshot, null, 2), "utf8");
}

function isSceneSnapshot(value: unknown): value is SceneSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<SceneSnapshot>;
  return Number.isInteger(snapshot.revision) && Array.isArray(snapshot.rootNodeIds) && Boolean(snapshot.nodes) && typeof snapshot.nodes === "object";
}
