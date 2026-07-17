/** Registers the minimal Pascal node definitions currently owned by ArchAgent. */
import { registerNode, nodeRegistry, type GeometryContext, type NodeDefinition } from "@pascal-app/core";
import {
  BuildingNode,
  CeilingNode,
  ColumnNode,
  FenceNode,
  ZoneNode,
  StairNode,
  DoorNode,
  LevelNode,
  SiteNode,
  SlabNode,
  WallNode,
  WindowNode
} from "@pascal-app/core";
import type { z } from "zod";
import * as THREE from "three/webgpu";

const PRESET_COLORS: Record<string, string> = {
  concrete: "#94a3b8",
  plaster: "#e2e8f0",
  wood: "#c4a484",
  brick: "#b87a5c",
  metal: "#94a3b8",
  glass: "#c8d4dc",
  tile: "#e5e7eb",
  marble: "#f3f4f6",
  white: "#e4e9f0"
};

const { id: _defaultDoorId, type: _defaultDoorType, ...doorDefaults } = DoorNode.parse({ id: "door_archagent_default" });
const { id: _defaultWindowId, type: _defaultWindowType, ...windowDefaults } = WindowNode.parse({ id: "window_archagent_default" });

function resolvePresetColor(preset?: string): string {
  return PRESET_COLORS[preset ?? ""] ?? "#e5e7eb";
}

function createMaterial(color: string): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.7, metalness: 0.1 });
}

function containerGeometry(): THREE.Object3D {
  return new THREE.Group();
}

/**
 * Pascal's generic renderer mounts an empty group, then adopts only children
 * returned by `geometry`. Every visible definition must therefore return a
 * group containing its meshes, never a bare Mesh or a system-only definition.
 */
function createGeometryGroup(meshes: THREE.Object3D[]): THREE.Group {
  const group = new THREE.Group();
  group.add(...meshes);
  return group;
}

function createPolygonSurface(
  polygon: [number, number][],
  elevation: number,
  depth: number,
  material: THREE.MeshStandardNodeMaterial
): THREE.Group {
  const group = new THREE.Group();
  if (polygon.length < 3) return group;

  const shape = new THREE.Shape();
  shape.moveTo(polygon[0][0], polygon[0][1]);
  for (let index = 1; index < polygon.length; index += 1) {
    shape.lineTo(polygon[index][0], polygon[index][1]);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = elevation;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function slabGeometry(node: z.infer<typeof SlabNode>): THREE.Object3D {
  try {
    const preset = node.material?.preset ?? node.materialPreset ?? "concrete";
    return createPolygonSurface(node.polygon, node.elevation ?? 0, 0.2, createMaterial(resolvePresetColor(preset)));
  } catch (e) {
    console.error(`[ArchAgent] slab geometry failed for ${node.id}:`, e);
    return new THREE.Group();
  }
}

/** Builds an actual perforated wall mesh from its hosted door and window nodes. */
function wallGeometry(node: z.infer<typeof WallNode>, context: GeometryContext): THREE.Group {
  const length = Math.hypot(node.end[0] - node.start[0], node.end[1] - node.start[1]);
  const height = node.height ?? 2.8;
  const thickness = node.thickness ?? 0.2;
  if (length < 0.001) return new THREE.Group();

  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(length, 0);
  shape.lineTo(length, height);
  shape.lineTo(0, height);
  shape.closePath();

  const wallAngle = Math.atan2(node.end[1] - node.start[1], node.end[0] - node.start[0]);
  for (const opening of getWallOpenings(context.children, node.start, wallAngle, length, height)) {
    const hole = new THREE.Path();
    hole.moveTo(opening.left, opening.bottom);
    hole.lineTo(opening.left, opening.top);
    hole.lineTo(opening.right, opening.top);
    hole.lineTo(opening.right, opening.bottom);
    hole.closePath();
    shape.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  const preset = node.material?.preset ?? node.materialPreset ?? "plaster";
  const mesh = new THREE.Mesh(geometry, createMaterial(resolvePresetColor(preset)));
  mesh.position.set(node.start[0], 0, node.start[1]);
  mesh.rotation.y = -wallAngle;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return createGeometryGroup([mesh]);
}

function getWallOpenings(
  children: GeometryContext["children"],
  wallStart: [number, number],
  wallAngle: number,
  wallLength: number,
  wallHeight: number
): Array<{
  left: number;
  right: number;
  bottom: number;
  top: number;
}> {
  return children
    .filter((child): child is z.infer<typeof DoorNode> | z.infer<typeof WindowNode> => child.type === "door" || child.type === "window")
    .map((opening) => {
      const worldX = opening.position[0] - wallStart[0];
      const worldZ = opening.position[2] - wallStart[1];
      const centerX = worldX * Math.cos(wallAngle) + worldZ * Math.sin(wallAngle);
      const left = Math.max(0, centerX - opening.width / 2);
      const right = Math.min(wallLength, centerX + opening.width / 2);
      const bottom = Math.max(0, opening.position[1] - opening.height / 2);
      const top = Math.min(wallHeight, opening.position[1] + opening.height / 2);
      return { left, right, bottom, top };
    })
    .filter((opening) => opening.right - opening.left > 0.001 && opening.top - opening.bottom > 0.001)
    .sort((left, right) => left.left - right.left);
}

function zoneGeometry(node: z.infer<typeof ZoneNode>): THREE.Group {
  const material = createMaterial(node.color);
  material.transparent = true;
  material.opacity = 0.35;
  return createPolygonSurface(node.polygon, 0.012, 0.01, material);
}

function stairGeometry(node: z.infer<typeof StairNode>): THREE.Group {
  const group = new THREE.Group();
  const stepCount = Math.max(2, node.stepCount);
  const run = Math.max(2.4, stepCount * 0.28);
  const treadDepth = run / stepCount;
  const rise = node.totalRise / stepCount;
  const material = createMaterial(resolvePresetColor(node.material?.preset ?? node.materialPreset ?? "concrete"));

  for (let index = 0; index < stepCount; index += 1) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(treadDepth, node.thickness, node.width), material);
    step.position.set(index * treadDepth + treadDepth / 2, index * rise + node.thickness / 2, 0);
    step.castShadow = true;
    step.receiveShadow = true;
    group.add(step);
  }
  return group;
}

function fenceGeometry(node: z.infer<typeof FenceNode>): THREE.Group {
  const group = new THREE.Group();
  const length = Math.hypot(node.end[0] - node.start[0], node.end[1] - node.start[1]);
  if (length < 0.001) return group;

  const material = createMaterial(resolvePresetColor(node.material?.preset ?? node.materialPreset ?? "metal"));
  const angle = -Math.atan2(node.end[1] - node.start[1], node.end[0] - node.start[0]);
  const midpoint: [number, number, number] = [(node.start[0] + node.end[0]) / 2, 0, (node.start[1] + node.end[1]) / 2];
  const postSpacing = Math.max(0.6, node.postSpacing ?? 1.2);
  const postCount = Math.max(2, Math.ceil(length / postSpacing) + 1);

  for (let index = 0; index < postCount; index += 1) {
    const fraction = index / (postCount - 1);
    const post = new THREE.Mesh(new THREE.BoxGeometry(node.postSize ?? node.thickness, node.height, node.postSize ?? node.thickness), material);
    post.position.set(node.start[0] + (node.end[0] - node.start[0]) * fraction, node.height / 2, node.start[1] + (node.end[1] - node.start[1]) * fraction);
    group.add(post);
  }

  const railCount = node.style === "rail" ? 2 : 1;
  for (let index = 0; index < railCount; index += 1) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(length, node.thickness, node.thickness), material);
    rail.position.set(midpoint[0], node.height * (railCount === 1 ? 0.8 : index === 0 ? 0.35 : 0.8), midpoint[2]);
    rail.rotation.y = angle;
    group.add(rail);
  }
  return group;
}

function openingGeometry(node: z.infer<typeof DoorNode> | z.infer<typeof WindowNode>, color: string): THREE.Group {
  const material = createMaterial(color);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(node.width, node.height, node.frameDepth ?? 0.08), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return createGeometryGroup([mesh]);
}

const baseDefaults = {
  object: "node" as const,
  parentId: null,
  visible: true,
  metadata: {}
};

function defineSite(): NodeDefinition<typeof SiteNode> {
  return {
    kind: "site",
    schemaVersion: 1,
    schema: SiteNode,
    category: "site",
    defaults: () => ({
      ...baseDefaults,
      name: "场地",
      polygon: { type: "polygon" as const, points: [[-5, -5], [5, -5], [5, 5], [-5, 5]] },
      children: []
    }),
    capabilities: {},
    geometry: containerGeometry
  };
}

function defineBuilding(): NodeDefinition<typeof BuildingNode> {
  return {
    kind: "building",
    schemaVersion: 1,
    schema: BuildingNode,
    category: "structure",
    defaults: () => ({
      ...baseDefaults,
      name: "建筑",
      children: [],
      position: [0, 0, 0],
      rotation: [0, 0, 0]
    }),
    capabilities: {},
    geometry: containerGeometry
  };
}

function defineLevel(): NodeDefinition<typeof LevelNode> {
  return {
    kind: "level",
    schemaVersion: 1,
    schema: LevelNode,
    category: "structure",
    defaults: () => ({
      ...baseDefaults,
      name: "楼层",
      children: [],
      level: 0
    }),
    capabilities: {},
    geometry: containerGeometry
  };
}

function defineSlab(): NodeDefinition<typeof SlabNode> {
  return {
    kind: "slab",
    schemaVersion: 1,
    schema: SlabNode,
    category: "structure",
    surfaceRole: "floor",
    defaults: () => ({
      ...baseDefaults,
      children: [],
      polygon: [[0, 0], [5, 0], [5, 4], [0, 4]],
      elevation: 0,
      holes: [],
      holeMetadata: [],
      autoFromWalls: false
    }),
    capabilities: { selectable: { hitVolume: "mesh" } },
    geometry: (node) => slabGeometry(node)
  };
}

function defineCeiling(): NodeDefinition<typeof CeilingNode> {
  return {
    kind: "ceiling",
    schemaVersion: 1,
    schema: CeilingNode,
    category: "structure",
    surfaceRole: "ceiling",
    defaults: () => ({
      ...baseDefaults,
      children: [],
      polygon: [[0, 0], [5, 0], [5, 4], [0, 4]],
      height: 2.8,
      holes: [],
      holeMetadata: [],
      autoFromWalls: false
    }),
    capabilities: { selectable: { hitVolume: "mesh" } },
    geometry: (node) => {
      const preset = node.material?.preset ?? node.materialPreset ?? "white";
      return createPolygonSurface(node.polygon, node.height, 0.08, createMaterial(resolvePresetColor(preset)));
    }
  };
}

function defineColumn(): NodeDefinition<typeof ColumnNode> {
  return {
    kind: "column",
    schemaVersion: 1,
    schema: ColumnNode,
    category: "structure",
    defaults: () => ({ ...baseDefaults, position: [0, 0, 0], rotation: 0, materialPreset: "concrete" } as any),
    capabilities: { selectable: { hitVolume: "mesh" } },
    geometry: (node) => {
      const radius = node.crossSection === "round" ? node.radius : Math.max(node.width, node.depth) / 2;
      const geometry = node.crossSection === "round"
        ? new THREE.CylinderGeometry(radius, radius, node.height, 32)
        : new THREE.BoxGeometry(node.width, node.height, node.depth);
      const mesh = new THREE.Mesh(geometry, createMaterial(resolvePresetColor(node.material?.preset ?? node.materialPreset)));
      // ParametricNodeRenderer already owns the node's position and rotation.
      mesh.position.y = node.height / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return createGeometryGroup([mesh]);
    }
  };
}

function defineZone(): NodeDefinition<typeof ZoneNode> {
  return {
    kind: "zone",
    schemaVersion: 1,
    schema: ZoneNode,
    category: "structure",
    defaults: () => ({ ...baseDefaults, name: "房间", polygon: [[0, 0], [4, 0], [4, 3], [0, 3]], color: "#0f6cbd" } as any),
    capabilities: { selectable: { hitVolume: "mesh" } },
    geometry: (node) => zoneGeometry(node)
  };
}
function defineStair(): NodeDefinition<typeof StairNode> {
  return {
    kind: "stair",
    schemaVersion: 1,
    schema: StairNode,
    category: "structure",
    defaults: () => ({ ...baseDefaults, position: [0, 0, 0], rotation: 0, stairType: "straight", width: 1.1, totalRise: 2.8, stepCount: 16, thickness: 0.16, railingMode: "both", children: [] } as any),
    capabilities: { selectable: { hitVolume: "mesh" } },
    geometry: (node) => stairGeometry(node)
  };
}

function defineFence(): NodeDefinition<typeof FenceNode> {
  return {
    kind: "fence",
    schemaVersion: 1,
    schema: FenceNode,
    category: "structure",
    defaults: () => ({
      ...baseDefaults,
      start: [0, 0],
      end: [4, 0],
      height: 1.1,
      thickness: 0.08,
      style: "slat",
      baseStyle: "grounded",
      materialPreset: "metal"
    } as any),
    capabilities: { selectable: { hitVolume: "mesh" } },
    geometry: (node) => fenceGeometry(node)
  };
}

function defineWall(): NodeDefinition<typeof WallNode> {
  return {
    kind: "wall",
    schemaVersion: 1,
    schema: WallNode,
    category: "structure",
    surfaceRole: "wall",
    defaults: () => ({
      ...baseDefaults,
      children: [],
      start: [0, 0],
      end: [5, 0],
      height: 2.8,
      thickness: 0.2,
      frontSide: "interior",
      backSide: "exterior"
    }),
    capabilities: { selectable: { hitVolume: "mesh" } },
    geometry: (node, context) => wallGeometry(node, context)
  };
}

function defineDoor(): NodeDefinition<typeof DoorNode> {
  return {
    kind: "door",
    schemaVersion: 1,
    schema: DoorNode,
    category: "structure",
    surfaceRole: "joinery",
    defaults: () => ({
      ...doorDefaults,
      ...baseDefaults,
      name: "门",
      position: [0, 0, 0],
      width: 0.9,
      height: 2.1,
      frameDepth: 0.16,
      frameThickness: 0.06
    }),
    capabilities: { selectable: { hitVolume: "mesh" } },
    geometry: (node) => openingGeometry(node, resolvePresetColor(node.material?.preset ?? "wood"))
  };
}

function defineWindow(): NodeDefinition<typeof WindowNode> {
  return {
    kind: "window",
    schemaVersion: 1,
    schema: WindowNode,
    category: "structure",
    surfaceRole: "glazing",
    defaults: () => ({
      ...windowDefaults,
      ...baseDefaults,
      name: "窗",
      position: [0, 0, 0],
      width: 1.2,
      height: 1.2,
      frameDepth: 0.16,
      frameThickness: 0.06,
      sill: true
    }),
    capabilities: { selectable: { hitVolume: "mesh" } },
    geometry: (node) => openingGeometry(node, resolvePresetColor(node.material?.preset ?? "glass"))
  };
}

export function registerArchAgentNodes(): void {
  const defs: Array<NodeDefinition<any>> = [
    defineSite(),
    defineBuilding(),
    defineLevel(),
    defineSlab(),
    defineCeiling(),
    defineColumn(),
    defineZone(),
    defineStair(),
    defineFence(),
    defineWall(),
    defineDoor(),
    defineWindow()
  ];
  for (const def of defs) {
    // Re-register in development so Vite HMR replaces stale geometry definitions.
    if (!nodeRegistry.has(def.kind) || import.meta.env.DEV) {
      registerNode(def);
      console.log(`[ArchAgent] registered Pascal node definition: ${def.kind}`);
    }
  }
}
