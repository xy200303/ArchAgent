/** Renders persisted external meshes without adding them to Pascal's semantic node graph. */
import { useEffect, useState, type JSX } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import type { Object3D } from "three";
import type { ArchAgentApi } from "../../../../../shared/types";
import type { SceneAssetNode } from "../../../../../shared/modeling3d/sceneContracts";
import { loadMeshObject } from "../scene/loadMeshObject";

export function ImportedAssetLayer({
  api,
  assets,
  selectedNodeId,
  onError,
  onSelectNode,
  onObjectChange
}: {
  api: ArchAgentApi;
  assets: SceneAssetNode[];
  selectedNodeId?: string;
  onError: (message: string) => void;
  onSelectNode: (id: string) => void;
  onObjectChange: (id: string, object?: Object3D) => void;
}): JSX.Element {
  return <>{assets.map((asset) => <ImportedAsset key={asset.id} api={api} asset={asset} selected={selectedNodeId === asset.id} onError={onError} onSelectNode={onSelectNode} onObjectChange={onObjectChange} />)}</>;
}

function ImportedAsset({
  api,
  asset,
  selected,
  onError,
  onSelectNode,
  onObjectChange
}: {
  api: ArchAgentApi;
  asset: SceneAssetNode;
  selected: boolean;
  onError: (message: string) => void;
  onSelectNode: (id: string) => void;
  onObjectChange: (id: string, object?: Object3D) => void;
}): JSX.Element | null {
  const [object, setObject] = useState<Object3D>();

  useEffect(() => {
    let disposed = false;
    void api.scene.loadAsset(asset.id)
      .then((payload) => loadMeshObject(payload.format, payload.dataBase64))
      .then((nextObject) => { if (!disposed) setObject(nextObject); })
      .catch((error: unknown) => {
        if (!disposed) onError(`参考模型“${asset.name}”加载失败：${error instanceof Error ? error.message : String(error)}`);
      });
    return () => { disposed = true; };
  }, [api, asset.id, asset.name, onError]);

  useEffect(() => {
    onObjectChange(asset.id, object);
    return () => onObjectChange(asset.id, undefined);
  }, [asset.id, object, onObjectChange]);

  if (!object) return null;
  return (
    <primitive
      object={object}
      position={asset.position}
      rotation={asset.rotation}
      scale={asset.scale}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelectNode(asset.id);
      }}
      userData={{ archAgentSelected: selected }}
    />
  );
}
