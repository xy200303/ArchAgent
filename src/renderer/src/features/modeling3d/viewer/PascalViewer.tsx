/** Mounts Pascal's WebGPU scene projection with host-owned camera controls. */
import { CameraControls, type CameraControls as CameraControlsHandle } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { memo, useEffect, useRef, useState, type JSX } from "react";
import { Color } from "three";
import { useScene } from "@pascal-app/core";
import { Viewer, useViewer } from "@pascal-app/viewer";
import { registerArchAgentNodes } from "../nodes/pascalNodeDefinitions";
import { toPascalScene } from "../scene/pascalSceneAdapter";
import type { SceneSnapshot } from "../../../../../shared/modeling3d/sceneContracts";
import { WallDrawingOverlay } from "./WallDrawingOverlay";
import type { WallDrawingDraft } from "./useWallDrawing";

registerArchAgentNodes();

export type PascalCameraPreset = "free" | "top" | "front" | "right";

type CameraPosition = readonly [number, number, number];

const CAMERA_TARGET: CameraPosition = [2.5, 1.2, 2];
const CAMERA_PRESET_POSITIONS: Record<PascalCameraPreset, CameraPosition> = {
  free: [11, 8, 11],
  top: [2.5, 24, 2.01],
  front: [2.5, 3, 16],
  right: [16, 3, 2]
};

/** Aligns Pascal's internal canvas clear color with the R3F editor surface. */
function PascalSceneBackground(): null {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const previousBackground = scene.background;
    scene.background = new Color("#f5f7fa");
    return () => {
      scene.background = previousBackground;
    };
  }, [scene]);

  return null;
}

/** Provides an editor-style ground reference without adding a persistent scene node. */
function PascalGroundGrid(): JSX.Element {
  return (
    <group position={[0, -0.015, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#fbfcfe" roughness={0.96} />
      </mesh>
      <gridHelper args={[30, 60, "#94a3b8", "#dbe3ec"]} position={[0, 0.002, 0]} />
    </group>
  );
}

/** Moves the host-owned camera without changing Pascal scene data. */
function PascalCameraControls({
  preset,
  revision,
  enabled,
  focusTarget,
  focusRevision
}: {
  preset: PascalCameraPreset;
  revision: number;
  enabled: boolean;
  focusTarget?: [number, number, number];
  focusRevision: number;
}): JSX.Element {
  const controls = useRef<CameraControlsHandle>(null);

  useEffect(() => {
    const [cameraX, cameraY, cameraZ] = CAMERA_PRESET_POSITIONS[preset];
    const [targetX, targetY, targetZ] = CAMERA_TARGET;
    void controls.current?.setLookAt(cameraX, cameraY, cameraZ, targetX, targetY, targetZ, true);
  }, [preset, revision]);

  useEffect(() => {
    if (!focusTarget) return;
    void controls.current?.setLookAt(focusTarget[0] + 8, focusTarget[1] + 6, focusTarget[2] + 8, ...focusTarget, true);
  }, [focusRevision, focusTarget]);

  return <CameraControls ref={controls} makeDefault enabled={enabled} minDistance={1.5} maxDistance={50} smoothTime={0.22} />;
}

/** Keeps Pascal's native selection outline aligned with the single editor selection. */
function PascalSelectionBridge({
  selectedNodeId,
  onSelectNode
}: {
  selectedNodeId?: string;
  onSelectNode: (id?: string) => void;
}): null {
  const selectedIds = useViewer((state) => state.selection.selectedIds);

  useEffect(() => {
    const nextIds = selectedNodeId ? [selectedNodeId] : [];
    const currentIds = useViewer.getState().selection.selectedIds;
    if (currentIds.length !== nextIds.length || currentIds.some((id, index) => id !== nextIds[index])) {
      useViewer.getState().setSelection({ selectedIds: nextIds });
    }
  }, [selectedNodeId]);

  useEffect(() => {
    onSelectNode(selectedIds.length === 1 ? selectedIds[0] : undefined);
  }, [onSelectNode, selectedIds]);

  return null;
}

function PascalViewer({
  onError,
  snapshot,
  cameraPreset,
  cameraRevision,
  wallDrawingActive,
  wallDrawingDraft,
  onWallDrawingPoint,
  onWallDrawingPreview,
  selectedNodeId,
  onSelectNode,
  focusTarget,
  focusRevision
}: {
  onError: (msg: string) => void;
  snapshot: SceneSnapshot;
  cameraPreset: PascalCameraPreset;
  cameraRevision: number;
  wallDrawingActive: boolean;
  wallDrawingDraft?: WallDrawingDraft;
  onWallDrawingPoint: (point: [number, number]) => void;
  onWallDrawingPreview: (point: [number, number]) => void;
  selectedNodeId?: string;
  onSelectNode: (id?: string) => void;
  focusTarget?: [number, number, number];
  focusRevision: number;
}): JSX.Element {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const scene = toPascalScene(snapshot);
      useScene.getState().setScene(scene.nodes, scene.rootNodeIds);
      setReady(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [onError, snapshot]);

  if (!ready) return <div className="spatial-editor-fallback">构建场景中…</div>;
  return (
    <div className="pascal-viewer-host">
      <Viewer selectionManager={wallDrawingActive ? "custom" : "default"} renderContext="viewer" sceneReadyKey={snapshot.revision}>
        <PascalSceneBackground />
        <PascalGroundGrid />
        <PascalCameraControls preset={cameraPreset} revision={cameraRevision} enabled={!wallDrawingActive} focusTarget={focusTarget} focusRevision={focusRevision} />
        {!wallDrawingActive ? <PascalSelectionBridge selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} /> : null}
        {wallDrawingActive ? (
          <WallDrawingOverlay
            draft={wallDrawingDraft}
            onPoint={onWallDrawingPoint}
            onPreview={onWallDrawingPreview}
          />
        ) : null}
      </Viewer>
    </div>
  );
}

export default memo(PascalViewer);
