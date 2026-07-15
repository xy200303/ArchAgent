/** Mounts the Pascal WebGPU viewer and seeds the current demonstration scene. */
import { useEffect, useLayoutEffect, useState } from "react";
import { BuildingNode, LevelNode, SiteNode, SlabNode, useScene, WallNode } from "@pascal-app/core";
import { Viewer } from "@pascal-app/viewer";
import { useThree } from "@react-three/fiber";
import { registerArchAgentNodes } from "../nodes/pascalNodeDefinitions";
import type { JSX } from "react";

registerArchAgentNodes();

function PreviewCamera(): null {
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    camera.lookAt(2.5, 1.4, 2);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

export default function PascalViewer({ onError }: { onError: (msg: string) => void }): JSX.Element {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const state = useScene.getState();
      state.clearScene();
      const siteId = "site_default";
      const buildingId = "building_default";
      const levelId = "level_default";
      state.createNodes([
        { node: SiteNode.parse({ id: siteId, name: "默认场地", polygon: { type: "polygon", points: [[-3, -3], [8, -3], [8, 7], [-3, 7]] } }) },
        { node: BuildingNode.parse({ id: buildingId, name: "主建筑", parentId: siteId }) },
        { node: LevelNode.parse({ id: levelId, name: "一层", parentId: buildingId, level: 0 }) },
        { node: SlabNode.parse({ id: "slab_floor", parentId: levelId, polygon: [[0, 0], [5, 0], [5, 4], [0, 4]], elevation: 0, material: { preset: "concrete" } }) },
        { node: WallNode.parse({ id: "wall_north", parentId: levelId, start: [0, 0], end: [5, 0], height: 2.8, thickness: 0.2, material: { preset: "plaster" } }) },
        { node: WallNode.parse({ id: "wall_south", parentId: levelId, start: [0, 4], end: [5, 4], height: 2.8, thickness: 0.2, material: { preset: "plaster" } }) },
        { node: WallNode.parse({ id: "wall_west", parentId: levelId, start: [0, 0], end: [0, 4], height: 2.8, thickness: 0.2, material: { preset: "plaster" } }) },
        { node: WallNode.parse({ id: "wall_east", parentId: levelId, start: [5, 0], end: [5, 4], height: 2.8, thickness: 0.2, material: { preset: "plaster" } }) }
      ]);
      console.log("[ArchAgent] scene nodes created:", Object.keys(useScene.getState().nodes));
      setReady(true);
      return () => { useScene.getState().clearScene(); };
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [onError]);

  if (!ready) return <div className="spatial-editor-fallback">构建场景中…</div>;
  return (
    <div className="pascal-viewer-host">
      <Viewer>
        <PreviewCamera />
      </Viewer>
    </div>
  );
}
