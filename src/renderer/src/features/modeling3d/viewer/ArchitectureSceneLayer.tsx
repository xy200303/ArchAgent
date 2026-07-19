/** Renders semantic architecture nodes with native Three.js geometry. */
import { Edges } from "@react-three/drei";
import { memo, useLayoutEffect, useMemo, useRef, type JSX } from "react";
import * as THREE from "three";
import type { SceneCeilingNode, SceneColumnNode, SceneDoorNode, SceneFenceNode, SceneSlabNode, SceneSnapshot, SceneStairNode, SceneWallNode, SceneWindowNode, SceneZoneNode, WallMaterialPreset } from "../../../../../shared/modeling3d/sceneContracts";
import { getWallViewportTransform } from "../viewport/sceneViewportMath";
import { getRelocatedSceneNode, type SceneDragPreview } from "./relocationCommand";

const MATERIAL_COLORS: Record<WallMaterialPreset, string> = {
  brick: "#b4533c", concrete: "#94a3b8", glass: "#77b7d6", marble: "#d8d5ce", metal: "#6b7280", plaster: "#e5e7eb", tile: "#c8d0d8", white: "#f8fafc", wood: "#9a6d48"
};

type OpeningNode = SceneDoorNode | SceneWindowNode;
type WallBlock = { centerX: number; baseY: number; width: number; height: number };
const EMPTY_OPENINGS: OpeningNode[] = [];
const surfaceMaterials = new Map<string, THREE.MeshStandardMaterial>();

export function ArchitectureSceneLayer({ snapshot, dragPreview, selectedNodeId, onSelectNode }: { snapshot: SceneSnapshot; dragPreview?: SceneDragPreview; selectedNodeId?: string; onSelectNode: (id: string) => void }): JSX.Element {
  const { nodes, openingsByWall } = useMemo(() => {
    const sceneNodes = Object.values(snapshot.nodes);
    const openings = new Map<string, OpeningNode[]>();
    for (const node of sceneNodes) {
      if (node.type !== "door" && node.type !== "window") continue;
      openings.set(node.wallId, [...(openings.get(node.wallId) ?? []), node]);
    }
    return { nodes: sceneNodes, openingsByWall: openings };
  }, [snapshot.nodes]);

  return (
    <group>
      {nodes.map((sourceNode) => {
        const node = dragPreview?.nodeId === sourceNode.id ? getRelocatedSceneNode(sourceNode, dragPreview.point) : sourceNode;
        if (node.type === "wall") {
          const openings = openingsByWall.get(node.id) ?? EMPTY_OPENINGS;
          const selectedOpeningId = openings.some((opening) => opening.id === selectedNodeId) ? selectedNodeId : undefined;
          return <WallMesh key={node.id} wall={node} openings={openings} selected={selectedNodeId === node.id} selectedOpeningId={selectedOpeningId} onSelectNode={onSelectNode} />;
        }
        if (node.type === "slab") return <PolygonSurface key={node.id} node={node} selected={selectedNodeId === node.id} onSelectNode={onSelectNode} />;
        if (node.type === "ceiling") return <CeilingMesh key={node.id} node={node} selected={selectedNodeId === node.id} onSelectNode={onSelectNode} />;
        if (node.type === "column") return <ColumnMesh key={node.id} node={node} selected={selectedNodeId === node.id} onSelectNode={onSelectNode} />;
        if (node.type === "zone") return <ZoneMesh key={node.id} node={node} selected={selectedNodeId === node.id} onSelectNode={onSelectNode} />;
        if (node.type === "stair") return <StairMesh key={node.id} node={node} selected={selectedNodeId === node.id} onSelectNode={onSelectNode} />;
        if (node.type === "fence") return <FenceMesh key={node.id} node={node} selected={selectedNodeId === node.id} onSelectNode={onSelectNode} />;
        return null;
      })}
    </group>
  );
}

function SurfaceMaterial({ preset, selected, transparent = false }: { preset: WallMaterialPreset; selected: boolean; transparent?: boolean }): JSX.Element {
  const key = `${preset}:${selected}:${transparent}`;
  let material = surfaceMaterials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: MATERIAL_COLORS[preset],
      emissive: selected ? "#1677c8" : "#000",
      emissiveIntensity: selected ? 0.25 : 0,
      roughness: preset === "glass" ? 0.18 : 0.75,
      metalness: preset === "metal" ? 0.55 : 0,
      transparent: transparent || preset === "glass",
      opacity: transparent ? 0.5 : preset === "glass" ? 0.62 : 1,
      side: THREE.DoubleSide
    });
    surfaceMaterials.set(key, material);
  }
  return <primitive object={material} attach="material" />;
}

const PolygonSurface = memo(function PolygonSurface({ node, selected, onSelectNode }: { node: SceneSlabNode; selected: boolean; onSelectNode: (id: string) => void }): JSX.Element {
  const shape = useMemo(() => toShape(node.polygon), [node.polygon]);
  return <mesh receiveShadow position={[0, node.elevation, 0]} rotation={[Math.PI / 2, 0, 0]} onClick={(event) => { event.stopPropagation(); onSelectNode(node.id); }}><shapeGeometry args={[shape]} /><SurfaceMaterial preset={node.materialPreset} selected={selected} />{selected ? <Edges color="#1677c8" userData={{ archAgentExportable: false }} /> : null}</mesh>;
});

const CeilingMesh = memo(function CeilingMesh({ node, selected, onSelectNode }: { node: SceneCeilingNode; selected: boolean; onSelectNode: (id: string) => void }): JSX.Element {
  const shape = useMemo(() => toShape(node.polygon), [node.polygon]);
  return <mesh receiveShadow position={[0, node.height, 0]} rotation={[Math.PI / 2, 0, 0]} onClick={(event) => { event.stopPropagation(); onSelectNode(node.id); }}><shapeGeometry args={[shape]} /><SurfaceMaterial preset={node.materialPreset} selected={selected} />{selected ? <Edges color="#1677c8" userData={{ archAgentExportable: false }} /> : null}</mesh>;
});

/** Splits wall faces around door and window extents so openings are real gaps, not decals. */
const WallMesh = memo(function WallMesh({ wall, openings, selected, selectedOpeningId, onSelectNode }: { wall: SceneWallNode; openings: OpeningNode[]; selected: boolean; selectedOpeningId?: string; onSelectNode: (id: string) => void }): JSX.Element {
  const transform = getWallViewportTransform(wall.start, wall.end, wall.height);
  const blocks = useMemo(() => buildWallBlocks(transform.length, wall.height, openings), [openings, transform.length, wall.height]);
  return (
    <group position={transform.position} rotation={[0, transform.rotationY, 0]}>
      {blocks.map((block, index) => <mesh key={`${wall.id}-${index}`} castShadow receiveShadow position={[block.centerX, block.baseY + block.height / 2 - wall.height / 2, 0]} onClick={(event) => { event.stopPropagation(); onSelectNode(wall.id); }}><boxGeometry args={[block.width, block.height, wall.thickness]} /><SurfaceMaterial preset={wall.materialPreset} selected={selected} />{selected ? <Edges color="#1677c8" threshold={12} userData={{ archAgentExportable: false }} /> : null}</mesh>)}
      {openings.map((opening) => <OpeningFrame key={opening.id} opening={opening} wallLength={transform.length} wallHeight={wall.height} wallThickness={wall.thickness} selected={selectedOpeningId === opening.id} onSelectNode={onSelectNode} />)}
    </group>
  );
});

function OpeningFrame({ opening, wallLength, wallHeight, wallThickness, selected, onSelectNode }: { opening: OpeningNode; wallLength: number; wallHeight: number; wallThickness: number; selected: boolean; onSelectNode: (id: string) => void }): JSX.Element {
  const centerX = -wallLength / 2 + opening.offset + opening.width / 2;
  const frameThickness = Math.max(0.045, wallThickness * 0.35);
  const frameColor = opening.type === "door" ? "#5b4636" : "#f3f8fc";
  const topY = opening.sillHeight + opening.height;
  const select = (event: { stopPropagation(): void }): void => { event.stopPropagation(); onSelectNode(opening.id); };
  return (
    <group position={[centerX, -wallLength * 0 + 0, 0]}>
      <mesh position={[-opening.width / 2 + frameThickness / 2, opening.sillHeight + opening.height / 2 - wallHeight / 2, 0]} onClick={select}><boxGeometry args={[frameThickness, opening.height, wallThickness + 0.015]} /><meshStandardMaterial color={frameColor} emissive={selected ? "#1677c8" : "#000"} emissiveIntensity={selected ? 0.35 : 0} /></mesh>
      <mesh position={[opening.width / 2 - frameThickness / 2, opening.sillHeight + opening.height / 2 - wallHeight / 2, 0]} onClick={select}><boxGeometry args={[frameThickness, opening.height, wallThickness + 0.015]} /><meshStandardMaterial color={frameColor} emissive={selected ? "#1677c8" : "#000"} emissiveIntensity={selected ? 0.35 : 0} /></mesh>
      <mesh position={[0, topY - frameThickness / 2 - wallHeight / 2, 0]} onClick={select}><boxGeometry args={[opening.width, frameThickness, wallThickness + 0.015]} /><meshStandardMaterial color={frameColor} emissive={selected ? "#1677c8" : "#000"} emissiveIntensity={selected ? 0.35 : 0} /></mesh>
      {opening.type === "window" ? <mesh position={[0, opening.sillHeight + opening.height / 2 - wallHeight / 2, 0]} onClick={select}><boxGeometry args={[opening.width - frameThickness * 2, opening.height - frameThickness * 2, 0.015]} /><meshStandardMaterial color="#88c4e3" transparent opacity={0.55} roughness={0.1} metalness={0.1} /></mesh> : null}
    </group>
  );
}

const ColumnMesh = memo(function ColumnMesh({ node, selected, onSelectNode }: { node: SceneColumnNode; selected: boolean; onSelectNode: (id: string) => void }): JSX.Element {
  const material = <SurfaceMaterial preset={node.materialPreset} selected={selected} />;
  const click = (event: { stopPropagation(): void }): void => { event.stopPropagation(); onSelectNode(node.id); };
  if (node.crossSection === "round") return <mesh castShadow receiveShadow position={[node.position[0], node.position[1] + node.height / 2, node.position[2]]} onClick={click}><cylinderGeometry args={[Math.max(node.width, node.depth) / 2, Math.max(node.width, node.depth) / 2, node.height, 32]} />{material}{selected ? <Edges color="#1677c8" userData={{ archAgentExportable: false }} /> : null}</mesh>;
  return <mesh castShadow receiveShadow position={[node.position[0], node.position[1] + node.height / 2, node.position[2]]} onClick={click}><boxGeometry args={[node.width, node.height, node.depth]} />{material}{selected ? <Edges color="#1677c8" userData={{ archAgentExportable: false }} /> : null}</mesh>;
});

const ZoneMesh = memo(function ZoneMesh({ node, selected, onSelectNode }: { node: SceneZoneNode; selected: boolean; onSelectNode: (id: string) => void }): JSX.Element {
  const shape = useMemo(() => toShape(node.polygon), [node.polygon]);
  return <mesh position={[0, 0.008, 0]} rotation={[Math.PI / 2, 0, 0]} onClick={(event) => { event.stopPropagation(); onSelectNode(node.id); }}><shapeGeometry args={[shape]} /><meshBasicMaterial color={node.color} transparent opacity={selected ? 0.34 : 0.18} side={THREE.DoubleSide} />{selected ? <Edges color="#1677c8" userData={{ archAgentExportable: false }} /> : null}</mesh>;
});

const StairMesh = memo(function StairMesh({ node, selected, onSelectNode }: { node: SceneStairNode; selected: boolean; onSelectNode: (id: string) => void }): JSX.Element {
  const stepDepth = node.width / node.stepCount;
  const click = (event: { stopPropagation(): void }): void => { event.stopPropagation(); onSelectNode(node.id); };
  return <group position={node.position} rotation={[0, node.rotation, 0]}><InstancedStairSteps stepCount={node.stepCount} width={node.width} stepDepth={stepDepth} totalRise={node.totalRise} preset={node.materialPreset} selected={selected} onClick={click} />{node.railingMode !== "none" ? <StairRail side={node.railingMode === "right" ? 1 : -1} width={node.width} rise={node.totalRise} /> : null}{node.railingMode === "both" ? <StairRail side={1} width={node.width} rise={node.totalRise} /> : null}</group>;
});

function InstancedStairSteps({ stepCount, width, stepDepth, totalRise, preset, selected, onClick }: { stepCount: number; width: number; stepDepth: number; totalRise: number; preset: WallMaterialPreset; selected: boolean; onClick: (event: { stopPropagation(): void }) => void }): JSX.Element {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let index = 0; index < stepCount; index += 1) {
      const height = ((index + 1) / stepCount) * totalRise;
      matrix.makeScale(width, height, stepDepth);
      matrix.setPosition(0, height / 2, -width / 2 + stepDepth * (index + 0.5));
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrix, stepCount, stepDepth, totalRise, width]);
  return <instancedMesh ref={meshRef} args={[undefined, undefined, stepCount]} castShadow receiveShadow onClick={onClick}><boxGeometry args={[1, 1, 1]} /><SurfaceMaterial preset={preset} selected={selected} /></instancedMesh>;
}

function StairRail({ side, width, rise }: { side: number; width: number; rise: number }): JSX.Element {
  return <mesh position={[side * width / 2, rise + 0.45, 0]} rotation={[0, 0, -side * Math.atan2(rise, width)]}><boxGeometry args={[0.035, 0.035, Math.hypot(width, rise)]} /><meshStandardMaterial color="#64748b" metalness={0.65} roughness={0.28} /></mesh>;
}

const FenceMesh = memo(function FenceMesh({ node, selected, onSelectNode }: { node: SceneFenceNode; selected: boolean; onSelectNode: (id: string) => void }): JSX.Element {
  const transform = getWallViewportTransform(node.start, node.end, node.height);
  const postCount = Math.max(2, Math.ceil(transform.length / 1.25) + 1);
  const click = (event: { stopPropagation(): void }): void => { event.stopPropagation(); onSelectNode(node.id); };
  return <group position={transform.position} rotation={[0, transform.rotationY, 0]}><InstancedFencePosts count={postCount} length={transform.length} height={node.height} thickness={node.thickness} preset={node.materialPreset} selected={selected} onClick={click} />{node.style === "privacy" ? <mesh onClick={click}><boxGeometry args={[transform.length, node.height, node.thickness]} /><SurfaceMaterial preset={node.materialPreset} selected={selected} /></mesh> : <>{[0.25, 0.75].map((ratio) => <mesh key={ratio} position={[0, node.height * (ratio - 0.5), 0]} onClick={click}><boxGeometry args={[transform.length, node.thickness, node.thickness]} /><SurfaceMaterial preset={node.materialPreset} selected={selected} /></mesh>)}</>}{selected ? <Edges color="#1677c8" userData={{ archAgentExportable: false }} /> : null}</group>;
});

function InstancedFencePosts({ count, length, height, thickness, preset, selected, onClick }: { count: number; length: number; height: number; thickness: number; preset: WallMaterialPreset; selected: boolean; onClick: (event: { stopPropagation(): void }) => void }): JSX.Element {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let index = 0; index < count; index += 1) {
      matrix.makeScale(thickness * 1.5, height, thickness * 1.5);
      matrix.setPosition(-length / 2 + (length * index) / (count - 1), 0, 0);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [count, height, length, matrix, thickness]);
  return <instancedMesh ref={meshRef} args={[undefined, undefined, count]} onClick={onClick}><boxGeometry args={[1, 1, 1]} /><SurfaceMaterial preset={preset} selected={selected} /></instancedMesh>;
}

function buildWallBlocks(length: number, wallHeight: number, openings: OpeningNode[]): WallBlock[] {
  const levels = Array.from(new Set([0, wallHeight, ...openings.flatMap((opening) => [opening.sillHeight, opening.sillHeight + opening.height])].filter((value) => value >= 0 && value <= wallHeight))).sort((first, second) => first - second);
  const blocks: WallBlock[] = [];
  for (let index = 0; index < levels.length - 1; index += 1) {
    const baseY = levels[index];
    const height = levels[index + 1] - baseY;
    if (height <= 0) continue;
    const middleY = baseY + height / 2;
    const gaps = openings.filter((opening) => opening.sillHeight < middleY && opening.sillHeight + opening.height > middleY).map((opening) => [Math.max(-length / 2, -length / 2 + opening.offset), Math.min(length / 2, -length / 2 + opening.offset + opening.width)] as const).sort((first, second) => first[0] - second[0]);
    let cursor = -length / 2;
    for (const [gapStart, gapEnd] of gaps) {
      if (gapStart > cursor) blocks.push({ centerX: (cursor + gapStart) / 2, baseY, width: gapStart - cursor, height });
      cursor = Math.max(cursor, gapEnd);
    }
    if (cursor < length / 2) blocks.push({ centerX: (cursor + length / 2) / 2, baseY, width: length / 2 - cursor, height });
  }
  return blocks;
}

function toShape(points: readonly [number, number][]): THREE.Shape {
  const [firstPoint, ...remainingPoints] = points;
  const shape = new THREE.Shape();
  if (!firstPoint) return shape;
  shape.moveTo(firstPoint[0], firstPoint[1]);
  remainingPoints.forEach((point) => shape.lineTo(point[0], point[1]));
  shape.closePath();
  return shape;
}
