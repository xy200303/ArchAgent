/** Renders shared architecture nodes as selectable R3F meshes. */
import { Edges } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo, type JSX } from "react";
import * as THREE from "three";
import type { SceneSlabNode, SceneSnapshot, SceneWallNode, WallMaterialPreset } from "../../../../../shared/modeling3d/sceneContracts";
import { getWallViewportTransform } from "./sceneViewportMath";

const MATERIAL_COLORS: Record<WallMaterialPreset, string> = {
  brick: "#b4533c",
  concrete: "#94a3b8",
  glass: "#77b7d6",
  marble: "#d8d5ce",
  metal: "#6b7280",
  plaster: "#e5e7eb",
  tile: "#c8d0d8",
  white: "#f8fafc",
  wood: "#9a6d48"
};

export function ArchitectureMeshes({
  snapshot,
  selectedWallId,
  onSelectWall,
  onDrawPoint,
  onDrawPreview
}: {
  snapshot: SceneSnapshot;
  selectedWallId?: string;
  onSelectWall: (id: string) => void;
  onDrawPoint?: (event: ThreeEvent<MouseEvent>) => void;
  onDrawPreview?: (event: ThreeEvent<MouseEvent>) => void;
}): JSX.Element {
  const nodes = Object.values(snapshot.nodes);
  const slabs = nodes.filter((node): node is SceneSlabNode => node.type === "slab");
  const walls = nodes.filter((node): node is SceneWallNode => node.type === "wall");

  return (
    <group>
      {slabs.map((slab) => <SlabMesh key={slab.id} slab={slab} />)}
      {walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          selected={wall.id === selectedWallId}
          onSelect={onSelectWall}
          onDrawPoint={onDrawPoint}
          onDrawPreview={onDrawPreview}
        />
      ))}
    </group>
  );
}

function WallMesh({
  wall,
  selected,
  onSelect,
  onDrawPoint,
  onDrawPreview
}: {
  wall: SceneWallNode;
  selected: boolean;
  onSelect: (id: string) => void;
  onDrawPoint?: (event: ThreeEvent<MouseEvent>) => void;
  onDrawPreview?: (event: ThreeEvent<MouseEvent>) => void;
}): JSX.Element {
  const transform = getWallViewportTransform(wall.start, wall.end, wall.height);
  const color = MATERIAL_COLORS[wall.materialPreset];

  return (
    <mesh
      castShadow
      receiveShadow
      position={transform.position}
      rotation={[0, transform.rotationY, 0]}
      onClick={(event) => {
        event.stopPropagation();
        if (onDrawPoint) {
          onDrawPoint(event);
          return;
        }
        onSelect(wall.id);
      }}
      onPointerMove={onDrawPreview}
    >
      <boxGeometry args={[transform.length, wall.height, wall.thickness]} />
      <meshStandardMaterial
        color={color}
        emissive={selected ? "#2b88d8" : "#000000"}
        emissiveIntensity={selected ? 0.3 : 0}
        roughness={wall.materialPreset === "glass" ? 0.2 : 0.75}
        metalness={wall.materialPreset === "metal" ? 0.55 : 0}
        transparent={wall.materialPreset === "glass"}
        opacity={wall.materialPreset === "glass" ? 0.65 : 1}
      />
      {selected ? <Edges color="#1677c8" threshold={12} /> : null}
    </mesh>
  );
}

function SlabMesh({ slab }: { slab: SceneSlabNode }): JSX.Element {
  const shape = useMemo(() => createPolygonShape(slab.polygon), [slab.polygon]);

  return (
    <mesh receiveShadow position={[0, slab.elevation, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color={MATERIAL_COLORS[slab.materialPreset]} roughness={0.9} side={THREE.DoubleSide} />
    </mesh>
  );
}

function createPolygonShape(points: SceneSlabNode["polygon"]): THREE.Shape {
  const [firstPoint, ...remainingPoints] = points;
  const shape = new THREE.Shape();
  if (!firstPoint) return shape;

  shape.moveTo(firstPoint[0], firstPoint[1]);
  remainingPoints.forEach((point) => shape.lineTo(point[0], point[1]));
  shape.closePath();
  return shape;
}
