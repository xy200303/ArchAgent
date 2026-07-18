/** Mounts the main WebGL editor while preserving the shared scene contract. */
import { Grid, type CameraControls as CameraControlsHandle } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { memo, useCallback, useRef, type JSX } from "react";
import type { Quaternion } from "three";
import type { ArchAgentApi } from "../../../../../shared/types";
import type { SceneExchangeFormat, SceneSnapshot } from "../../../../../shared/modeling3d/sceneContracts";
import { ArchitectureSceneLayer } from "./ArchitectureSceneLayer";
import { ImportedAssetLayer } from "./ImportedAssetLayer";
import { R3FCameraControls, type EditorCameraPreset } from "./R3FCameraControls";
import { SceneExportBridge } from "./SceneExportBridge";
import { SelectedNodeDragController } from "./SelectedNodeDragController";
import { WallDrawingOverlay } from "./WallDrawingOverlay";
import type { WallDrawingDraft } from "./useWallDrawing";
import { ViewportNavigationGizmo, type ViewportNavigationGizmoHandle } from "./ViewportNavigationGizmo";

export type { EditorCameraPreset } from "./R3FCameraControls";

function R3FViewer({
  onError,
  api,
  snapshot,
  cameraPreset,
  cameraRevision,
  wallDrawingActive,
  wallDrawingDraft,
  manualDragActive,
  manualDragEnabled,
  onWallDrawingPoint,
  onWallDrawingPreview,
  onManualDragState,
  onManualDragPreview,
  onManualDragDrop,
  selectedNodeId,
  onSelectNode,
  focusTarget,
  focusRevision,
  exportRequest,
  onExportComplete,
  onCameraPreset
}: {
  onError: (message: string) => void;
  api: ArchAgentApi;
  snapshot: SceneSnapshot;
  cameraPreset: EditorCameraPreset;
  cameraRevision: number;
  wallDrawingActive: boolean;
  wallDrawingDraft?: WallDrawingDraft;
  manualDragActive: boolean;
  manualDragEnabled: boolean;
  onWallDrawingPoint: (point: [number, number]) => void;
  onWallDrawingPreview: (point: [number, number]) => void;
  onManualDragState: (active: boolean, nodeId: string) => void;
  onManualDragPreview: (nodeId: string, point: [number, number]) => void;
  onManualDragDrop: (nodeId: string, point: [number, number]) => void;
  selectedNodeId?: string;
  onSelectNode: (id?: string) => void;
  focusTarget?: [number, number, number];
  focusRevision: number;
  exportRequest?: { format: Exclude<SceneExchangeFormat, "scene-json">; revision: number };
  onExportComplete: (dataBase64: string) => void;
  onCameraPreset: (preset: EditorCameraPreset) => void;
}): JSX.Element {
  const assets = Object.values(snapshot.nodes).filter((node): node is Extract<typeof node, { type: "asset" }> => node.type === "asset");
  const cameraControls = useRef<CameraControlsHandle>(null);
  const navigationGizmo = useRef<ViewportNavigationGizmoHandle>(null);

  const syncNavigationOrientation = useCallback((quaternion: Quaternion): void => {
    navigationGizmo.current?.syncOrientation(quaternion);
  }, []);

  const orbitFromNavigationGizmo = useCallback((deltaX: number, deltaY: number): void => {
    void cameraControls.current?.rotate(-deltaX * 0.008, -deltaY * 0.008, false);
  }, []);

  return (
    <div className="r3f-viewer-host" aria-label="三维空间视图">
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [11, 8, 11], fov: 45, near: 0.1, far: 1000 }} onPointerMissed={() => !wallDrawingActive && onSelectNode(undefined)}>
        <color attach="background" args={["#f5f7fa"]} />
        <group userData={{ archAgentExportable: false }}>
          <ambientLight intensity={0.75} />
          <directionalLight castShadow intensity={1.15} position={[8, 12, 6]} shadow-mapSize={[1024, 1024]} />
          <Grid args={[30, 30]} cellColor="#cbd5e1" sectionColor="#94a3b8" cellSize={1} sectionSize={5} fadeDistance={40} fadeStrength={1} infiniteGrid />
        </group>
        <ArchitectureSceneLayer snapshot={snapshot} selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} />
        <ImportedAssetLayer api={api} assets={assets} selectedNodeId={selectedNodeId} onError={onError} onSelectNode={onSelectNode} />
        <R3FCameraControls preset={cameraPreset} revision={cameraRevision} enabled={!wallDrawingActive && !manualDragActive} focusTarget={focusTarget} focusRevision={focusRevision} controlsRef={cameraControls} onOrientationChange={syncNavigationOrientation} />
        <SelectedNodeDragController nodeId={selectedNodeId} enabled={manualDragEnabled} onDragState={onManualDragState} onPreview={onManualDragPreview} onDrop={onManualDragDrop} />
        {wallDrawingActive ? <WallDrawingOverlay draft={wallDrawingDraft} onPoint={onWallDrawingPoint} onPreview={onWallDrawingPreview} /> : null}
        <SceneExportBridge request={exportRequest} onComplete={onExportComplete} onError={onError} />
      </Canvas>
      <ViewportNavigationGizmo ref={navigationGizmo} onCameraPreset={onCameraPreset} onOrbit={orbitFromNavigationGizmo} />
    </div>
  );
}

export default memo(R3FViewer);
