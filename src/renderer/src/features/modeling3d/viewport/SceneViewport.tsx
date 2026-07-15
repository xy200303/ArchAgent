/** Provides the always-available R3F interaction viewport for the shared scene. */
import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import type { JSX } from "react";
import * as THREE from "three";
import type { SceneSnapshot, ScenePoint } from "../../../../../shared/modeling3d/sceneContracts";
import { ArchitectureMeshes } from "./ArchitectureMeshes";
import { CameraPresetController, type CameraCommand } from "./CameraPresetController";
import type { WallDrawingDraft } from "./useWallDrawing";
import { WallDrawingOverlay } from "./WallDrawingOverlay";
import { getSnappedGroundPoint } from "./wallDrawingMath";

export function SceneViewport({
  snapshot,
  selectedWallId,
  onSelectWall,
  wallDrawingActive,
  wallDrawingDraft,
  onWallDrawingPoint,
  onWallDrawingPreview,
  cameraCommand
}: {
  snapshot: SceneSnapshot;
  selectedWallId?: string;
  onSelectWall: (id?: string) => void;
  wallDrawingActive: boolean;
  wallDrawingDraft?: WallDrawingDraft;
  onWallDrawingPoint: (point: ScenePoint) => void;
  onWallDrawingPreview: (point: ScenePoint) => void;
  cameraCommand?: CameraCommand;
}): JSX.Element {
  function handleWallDrawingPoint(event: ThreeEvent<MouseEvent>): void {
    const point = getSnappedGroundPoint(event.ray);
    if (point) onWallDrawingPoint(point);
  }

  function handleWallDrawingPreview(event: ThreeEvent<MouseEvent>): void {
    const point = getSnappedGroundPoint(event.ray);
    if (point) onWallDrawingPreview(point);
  }

  return (
    <div className={wallDrawingActive ? "scene-r3f-viewport drawing" : "scene-r3f-viewport"} aria-label="三维空间视图">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [9, 7, 9], fov: 45, near: 0.1, far: 1000 }}
        onPointerMissed={() => {
          if (!wallDrawingActive) onSelectWall(undefined);
        }}
      >
        <color attach="background" args={["#f5f7fa"]} />
        <ambientLight intensity={0.75} />
        <directionalLight castShadow intensity={1.2} position={[8, 12, 6]} shadow-mapSize={[1024, 1024]} />
        <Grid
          args={[30, 30]}
          cellColor="#cbd5e1"
          sectionColor="#94a3b8"
          cellSize={1}
          sectionSize={5}
          fadeDistance={40}
          fadeStrength={1}
          infiniteGrid
        />
        <ArchitectureMeshes
          snapshot={snapshot}
          selectedWallId={selectedWallId}
          onSelectWall={(id) => onSelectWall(id)}
          onDrawPoint={wallDrawingActive ? handleWallDrawingPoint : undefined}
          onDrawPreview={wallDrawingActive ? handleWallDrawingPreview : undefined}
        />
        {wallDrawingActive ? (
          <WallDrawingOverlay
            draft={wallDrawingDraft}
            onPoint={handleWallDrawingPoint}
            onPreview={handleWallDrawingPreview}
          />
        ) : null}
        <OrbitControls
          makeDefault
          target={[2.5, 1.2, 2]}
          minDistance={1.5}
          maxDistance={50}
          enablePan={!wallDrawingActive}
          mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
        />
        <CameraPresetController command={cameraCommand} />
      </Canvas>
    </div>
  );
}
