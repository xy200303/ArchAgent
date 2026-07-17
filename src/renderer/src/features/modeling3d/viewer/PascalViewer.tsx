/** Mounts Pascal's WebGPU scene projection with host-owned camera controls. */
import { CameraControls, type CameraControls as CameraControlsHandle } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useRef, useState, type JSX } from "react";
import { Color, type Object3D } from "three";
import { emitter, sceneRegistry, useScene, type NodeEvent } from "@pascal-app/core";
import { Viewer, useViewer } from "@pascal-app/viewer";
import { registerArchAgentNodes } from "../nodes/pascalNodeDefinitions";
import { toPascalScene } from "../scene/pascalSceneAdapter";
import type { SceneExchangeFormat, SceneSnapshot } from "../../../../../shared/modeling3d/sceneContracts";
import type { ArchAgentApi } from "../../../../../shared/types";
import { ImportedAssetLayer } from "./ImportedAssetLayer";
import { SceneExportBridge } from "./SceneExportBridge";
import { WallDrawingOverlay } from "./WallDrawingOverlay";
import { SelectedNodeDragController } from "./SelectedNodeDragController";
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
    <group position={[0, -0.015, 0]} userData={{ archAgentExportable: false }}>
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

const DIRECT_SELECT_EVENT_NAMES = [
  "wall:click",
  "fence:click",
  "slab:click",
  "ceiling:click",
  "column:click",
  "zone:click",
  "stair:click",
  "door:click",
  "window:click"
] as const;

/**
 * Replaces Pascal's hierarchy-first browser selector with direct editor selection.
 * This lets a user click a wall immediately instead of first selecting building,
 * level and zone, while retaining Pascal's material and outline highlighting.
 */
function PascalSelectionBridge({
  selectedNodeId,
  onSelectNode,
  assetObjects
}: {
  selectedNodeId?: string;
  onSelectNode: (id?: string) => void;
  assetObjects: Readonly<Record<string, Object3D>>;
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
    const selectDirectly = (event: NodeEvent): void => {
      event.stopPropagation();
      useViewer.getState().setSelection({ selectedIds: [event.node.id] });
    };
    for (const eventName of DIRECT_SELECT_EVENT_NAMES) emitter.on(eventName, selectDirectly as never);
    return () => {
      for (const eventName of DIRECT_SELECT_EVENT_NAMES) emitter.off(eventName, selectDirectly as never);
    };
  }, []);

  useEffect(() => {
    const outlineObjects = useViewer.getState().outliner.selectedObjects;
    outlineObjects.length = 0;
    for (const id of selectedIds) {
      const object = sceneRegistry.nodes.get(id) ?? assetObjects[id];
      if (object) outlineObjects.push(object);
    }
  }, [assetObjects, selectedIds]);

  useEffect(() => {
    onSelectNode(selectedIds.length === 1 ? selectedIds[0] : undefined);
  }, [onSelectNode, selectedIds]);

  return null;
}

function PascalViewer({
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
  onExportComplete
}: {
  onError: (msg: string) => void;
  api: ArchAgentApi;
  snapshot: SceneSnapshot;
  cameraPreset: PascalCameraPreset;
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
}): JSX.Element {
  const [ready, setReady] = useState(false);
  const [assetObjects, setAssetObjects] = useState<Record<string, Object3D>>({});

  const setAssetObject = useCallback((id: string, object?: Object3D): void => {
    setAssetObjects((current) => {
      if (object && current[id] === object) return current;
      if (!object && !current[id]) return current;
      const next = { ...current };
      if (object) next[id] = object;
      else delete next[id];
      return next;
    });
  }, []);

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
      <Viewer selectionManager="custom" renderContext="viewer" sceneReadyKey={snapshot.revision}>
        <PascalSceneBackground />
        <PascalGroundGrid />
        <ImportedAssetLayer api={api} assets={Object.values(snapshot.nodes).filter((node): node is Extract<typeof node, { type: "asset" }> => node.type === "asset")} selectedNodeId={selectedNodeId} onError={onError} onSelectNode={onSelectNode} onObjectChange={setAssetObject} />
        <PascalCameraControls preset={cameraPreset} revision={cameraRevision} enabled={!wallDrawingActive && !manualDragActive} focusTarget={focusTarget} focusRevision={focusRevision} />
        {!wallDrawingActive && !manualDragActive ? <PascalSelectionBridge selectedNodeId={selectedNodeId} onSelectNode={onSelectNode} assetObjects={assetObjects} /> : null}
        <SelectedNodeDragController nodeId={selectedNodeId} enabled={manualDragEnabled} onDragState={onManualDragState} onPreview={onManualDragPreview} onDrop={onManualDragDrop} />
        {wallDrawingActive ? (
          <WallDrawingOverlay
            draft={wallDrawingDraft}
            onPoint={onWallDrawingPoint}
            onPreview={onWallDrawingPreview}
          />
        ) : null}
        <SceneExportBridge request={exportRequest} onComplete={onExportComplete} onError={onError} />
      </Viewer>
    </div>
  );
}


export default memo(PascalViewer);
