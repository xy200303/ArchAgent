/** Converts the shared scene snapshot into Pascal nodes at the renderer boundary. */
import { BuildingNode, CeilingNode, ColumnNode, DoorNode, FenceNode, LevelNode, SiteNode, SlabNode, StairNode, WallNode, WindowNode, ZoneNode, type AnyNode, type AnyNodeId } from "@pascal-app/core";
import type { SceneNode, SceneSnapshot } from "../../../../../shared/modeling3d/sceneContracts";
import { collectPascalChildIds } from "./pascalSceneHierarchy";

export function toPascalScene(snapshot: SceneSnapshot): {
  nodes: Record<string, AnyNode>;
  rootNodeIds: AnyNodeId[];
} {
  const childIdsByParentId = collectPascalChildIds(snapshot);
  return {
    nodes: Object.fromEntries(
      Object.values(snapshot.nodes)
        .filter((node) => node.type !== "asset")
        .map((node) => [node.id, toPascalNode(node, childIdsByParentId[node.id] ?? [], snapshot.nodes)])
    ),
    rootNodeIds: snapshot.rootNodeIds as AnyNodeId[]
  };
}

function toPascalNode(node: SceneNode, childIds: string[], sceneNodes: SceneSnapshot["nodes"]): AnyNode {
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
    case "ceiling":
      return CeilingNode.parse({
        id: node.id,
        name: node.name,
        parentId: node.parentId,
        polygon: node.polygon,
        height: node.height,
        material: { preset: node.materialPreset },
        children: childIds
      });
    case "column":
      return ColumnNode.parse({ id: node.id, name: node.name, parentId: node.parentId, position: node.position, crossSection: node.crossSection, height: node.height, width: node.width, depth: node.depth, radius: Math.max(node.width, node.depth) / 2, material: { preset: node.materialPreset } });
    case "zone": return ZoneNode.parse({ id: node.id, name: node.name, parentId: node.parentId, polygon: node.polygon, color: node.color });
    case "stair": return StairNode.parse({ id: node.id, name: node.name, parentId: node.parentId, position: node.position, rotation: node.rotation, stairType: "straight", width: node.width, totalRise: node.totalRise, stepCount: node.stepCount, thickness: node.thickness, railingMode: node.railingMode, material: { preset: node.materialPreset }, children: [] });
    case "fence":
      return FenceNode.parse({
        id: node.id,
        name: node.name,
        parentId: node.parentId,
        start: node.start,
        end: node.end,
        height: node.height,
        thickness: node.thickness,
        style: node.style,
        baseStyle: "grounded",
        material: { preset: node.materialPreset }
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
    case "door":
      return toPascalDoorNode(node, sceneNodes);
    case "window":
      return toPascalWindowNode(node, sceneNodes);
    case "asset":
      throw new Error("参考模型不属于 Pascal 场景节点。");
  }
}

function toPascalDoorNode(node: Extract<SceneNode, { type: "door" }>, sceneNodes: SceneSnapshot["nodes"]): AnyNode {
  const wall = getOpeningWall(node.wallId, sceneNodes);
  const position = getOpeningPosition(node, wall);
  return DoorNode.parse({
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    wallId: node.wallId,
    position,
    rotation: [0, wall ? -getWallAngle(wall) : 0, 0],
    width: node.width,
    height: node.height,
    material: { preset: node.materialPreset }
  });
}

function toPascalWindowNode(node: Extract<SceneNode, { type: "window" }>, sceneNodes: SceneSnapshot["nodes"]): AnyNode {
  const wall = getOpeningWall(node.wallId, sceneNodes);
  const position = getOpeningPosition(node, wall);
  return WindowNode.parse({
    id: node.id,
    name: node.name,
    parentId: node.parentId,
    wallId: node.wallId,
    position,
    rotation: [0, wall ? -getWallAngle(wall) : 0, 0],
    width: node.width,
    height: node.height,
    material: { preset: node.materialPreset }
  });
}

function getOpeningWall(wallId: string, sceneNodes: SceneSnapshot["nodes"]): Extract<SceneNode, { type: "wall" }> | undefined {
  const wall = sceneNodes[wallId];
  return wall?.type === "wall" ? wall : undefined;
}

function getOpeningPosition(
  opening: Extract<SceneNode, { type: "door" | "window" }>,
  wall: Extract<SceneNode, { type: "wall" }> | undefined
): [number, number, number] {
  if (!wall) return [opening.offset + opening.width / 2, opening.sillHeight + opening.height / 2, 0];
  const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
  const ratio = length > 0 ? (opening.offset + opening.width / 2) / length : 0;
  return [
    wall.start[0] + (wall.end[0] - wall.start[0]) * ratio,
    opening.sillHeight + opening.height / 2,
    wall.start[1] + (wall.end[1] - wall.start[1]) * ratio
  ];
}

function getWallAngle(wall: Extract<SceneNode, { type: "wall" }>): number {
  return Math.atan2(wall.end[1] - wall.start[1], wall.end[0] - wall.start[0]);
}
