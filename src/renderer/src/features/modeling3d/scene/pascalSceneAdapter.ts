/** Converts the shared scene snapshot into Pascal nodes at the renderer boundary. */
import { BuildingNode, LevelNode, SiteNode, SlabNode, WallNode, type AnyNode, type AnyNodeId } from "@pascal-app/core";
import type { SceneNode, SceneSnapshot } from "../../../../../shared/modeling3d/sceneContracts";
import { collectPascalChildIds } from "./pascalSceneHierarchy";

export function toPascalScene(snapshot: SceneSnapshot): {
  nodes: Record<string, AnyNode>;
  rootNodeIds: AnyNodeId[];
} {
  const childIdsByParentId = collectPascalChildIds(snapshot);
  return {
    nodes: Object.fromEntries(
      Object.values(snapshot.nodes).map((node) => [node.id, toPascalNode(node, childIdsByParentId[node.id] ?? [])])
    ),
    rootNodeIds: snapshot.rootNodeIds as AnyNodeId[]
  };
}

function toPascalNode(node: SceneNode, childIds: string[]): AnyNode {
  switch (node.type) {
    case "site":
      return SiteNode.parse({
        id: node.id,
        name: node.name,
        polygon: { type: "polygon", points: node.polygon },
        children: childIds
      });
    case "building":
      return BuildingNode.parse({ id: node.id, name: node.name, parentId: node.parentId, children: childIds });
    case "level":
      return LevelNode.parse({ id: node.id, name: node.name, parentId: node.parentId, level: node.level, children: childIds });
    case "slab":
      return SlabNode.parse({
        id: node.id,
        name: node.name,
        parentId: node.parentId,
        polygon: node.polygon,
        elevation: node.elevation,
        material: { preset: node.materialPreset },
        children: childIds
      });
    case "wall":
      return WallNode.parse({
        id: node.id,
        name: node.name,
        parentId: node.parentId,
        start: node.start,
        end: node.end,
        height: node.height,
        thickness: node.thickness,
        material: { preset: node.materialPreset },
        children: childIds
      });
  }
}
