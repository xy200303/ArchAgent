/** Renders persisted external meshes without coupling them to an editor implementation. */
import { type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useState, type JSX } from "react";
import { Box3, Box3Helper, type Object3D } from "three";
import type { ArchAgentApi } from "../../../../../shared/types";
import type { SceneAssetNode } from "../../../../../shared/modeling3d/sceneContracts";
import { loadMeshObject, normalizeMeshObjectForScene } from "../scene/loadMeshObject";
import type { SceneDragPreview } from "./relocationCommand";

export function ImportedAssetLayer({
  api,
  assets,
  dragPreview,
  selectedNodeId,
  onError,
  onSelectNode,
  onObjectChange
}: {
  api: ArchAgentApi;
  assets: SceneAssetNode[];
  dragPreview?: SceneDragPreview;
  selectedNodeId?: string;
  onError: (message: string) => void;
  onSelectNode: (id: string) => void;
  onObjectChange?: (id: string, object?: Object3D) => void;
}): JSX.Element {
  return <>{assets.map((asset) => <ImportedAsset key={asset.id} api={api} asset={asset} previewPosition={dragPreview?.nodeId === asset.id ? [dragPreview.point[0], asset.position[1], dragPreview.point[1]] : undefined} selected={selectedNodeId === asset.id} onError={onError} onSelectNode={onSelectNode} onObjectChange={onObjectChange} />)}</>;
}

function ImportedAsset({
  api,
  asset,
  previewPosition,
  selected,
  onError,
  onSelectNode,
  onObjectChange
}: {
  api: ArchAgentApi;
  asset: SceneAssetNode;
  previewPosition?: [number, number, number];
  selected: boolean;
  onError: (message: string) => void;
  onSelectNode: (id: string) => void;
  onObjectChange?: (id: string, object?: Object3D) => void;
}): JSX.Element | null {
  const [object, setObject] = useState<Object3D>();

  useEffect(() => {
    let disposed = false;
    void api.scene.loadAsset(asset.id)
      .then((payload) => loadMeshObject(payload.format, payload.dataBase64))
      .then(normalizeMeshObjectForScene)
      .then((nextObject) => { if (!disposed) setObject(nextObject); })
      .catch((error: unknown) => {
        if (!disposed) onError(`参考模型“${asset.name}”加载失败：${error instanceof Error ? error.message : String(error)}`);
      });
    return () => { disposed = true; };
  }, [api, asset.id, asset.name, onError]);

  useEffect(() => {
    onObjectChange?.(asset.id, object);
    return () => onObjectChange?.(asset.id, undefined);
  }, [asset.id, object, onObjectChange]);

  if (!object) return null;
  return (
    <>
      <primitive
        object={object}
        position={previewPosition ?? asset.position}
        rotation={asset.rotation}
        scale={asset.scale}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onSelectNode(asset.id);
        }}
      />
      {selected ? <AssetSelectionOutline object={object} position={previewPosition ?? asset.position} rotation={asset.rotation} scale={asset.scale} /> : null}
    </>
  );
}

/** Keeps the imported mesh selection visible without mutating source materials. */
function AssetSelectionOutline({ object, position, rotation, scale }: { object: Object3D; position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }): JSX.Element {
  const [helper] = useState(() => new Box3Helper(new Box3(), "#1677c8"));
  useLayoutEffect(() => {
    object.updateWorldMatrix(true, true);
    helper.box.setFromObject(object);
  }, [helper, object, position, rotation, scale]);
  useEffect(() => {
    helper.userData.archAgentExportable = false;
    return () => helper.dispose();
  }, [helper]);
  return <primitive object={helper} />;
}
