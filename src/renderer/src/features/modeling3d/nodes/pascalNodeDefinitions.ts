/** Registers the minimal Pascal node definitions currently owned by ArchAgent. */
import { registerNode, nodeRegistry, type NodeDefinition } from "@pascal-app/core";
import {
  BuildingNode,
  LevelNode,
  SiteNode,
  SlabNode,
  WallNode
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
  white: "#f4f3ef"
};

function resolvePresetColor(preset?: string): string {
  return PRESET_COLORS[preset ?? ""] ?? "#e5e7eb";
}

function createMaterial(color: string): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.7, metalness: 0.1 });
}

function containerGeometry(): THREE.Object3D {
  return new THREE.Group();
}

function slabGeometry(node: z.infer<typeof SlabNode>): THREE.Object3D {
  try {
    const group = new THREE.Group();
    const points = node.polygon;
    if (points.length < 3) return group;

    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i][0], points[i][1]);
    }
    shape.closePath();

    const depth = 0.2;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2);
    const preset = node.material?.preset ?? node.materialPreset ?? "concrete";
    const material = createMaterial(resolvePresetColor(preset));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = node.elevation ?? 0;
    group.add(mesh);
    console.log(`[ArchAgent] built slab geometry for ${node.id}, children: ${group.children.length}`);
    return group;
  } catch (e) {
    console.error(`[ArchAgent] slab geometry failed for ${node.id}:`, e);
    return new THREE.Group();
  }
}

function wallGeometry(node: z.infer<typeof WallNode>): THREE.Object3D {
  try {
    const group = new THREE.Group();
    const [x1, y1] = node.start;
    const [x2, y2] = node.end;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 0.001) return group;

    const angle = Math.atan2(dy, dx);
    const height = node.height ?? 2.8;
    const thickness = node.thickness ?? 0.2;
    const geometry = new THREE.BoxGeometry(length, height, thickness);
    const preset = node.material?.preset ?? node.materialPreset ?? "plaster";
    const material = createMaterial(resolvePresetColor(preset));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set((x1 + x2) / 2, height / 2, (y1 + y2) / 2);
    mesh.rotation.y = -angle;
    group.add(mesh);
    console.log(`[ArchAgent] built wall geometry for ${node.id}, children: ${group.children.length}`);
    return group;
  } catch (e) {
    console.error(`[ArchAgent] wall geometry failed for ${node.id}:`, e);
    return new THREE.Group();
  }
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
    geometry: (node) => wallGeometry(node)
  };
}

export function registerArchAgentNodes(): void {
  const defs: Array<NodeDefinition<any>> = [
    defineSite(),
    defineBuilding(),
    defineLevel(),
    defineSlab(),
    defineWall()
  ];
  for (const def of defs) {
    if (!nodeRegistry.has(def.kind)) {
      registerNode(def);
      console.log(`[ArchAgent] registered Pascal node definition: ${def.kind}`);
    }
  }
}
