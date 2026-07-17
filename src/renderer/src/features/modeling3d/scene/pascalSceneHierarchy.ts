/** Builds Pascal's children-based hierarchy from the shared flat scene graph. */
import type { SceneSnapshot } from "../../../../../shared/modeling3d/sceneContracts";

/**
 * Pascal recursively renders `children`, whereas the shared scene contract uses
 * `parentId` to keep commands and validation simple. This maps between them at
 * the Renderer boundary without changing the authoritative scene model.
 */
export function collectPascalChildIds(snapshot: Pick<SceneSnapshot, "nodes">): Record<string, string[]> {
  const childIdsByParentId: Record<string, string[]> = {};
  for (const node of Object.values(snapshot.nodes)) {
    if (node.type === "asset") continue;
    if (!node.parentId) continue;
    (childIdsByParentId[node.parentId] ??= []).push(node.id);
  }
  return childIdsByParentId;
}
