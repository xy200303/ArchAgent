/** Mounts the Pascal WebGPU viewer and renders the shared scene snapshot. */
import { useEffect, useLayoutEffect, useState } from "react";
import { useScene } from "@pascal-app/core";
import { Viewer } from "@pascal-app/viewer";
import { useThree } from "@react-three/fiber";
import { registerArchAgentNodes } from "../nodes/pascalNodeDefinitions";
import { toPascalScene } from "../scene/pascalSceneAdapter";
import type { SceneSnapshot } from "../../../../../shared/modeling3d/sceneContracts";
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

export default function PascalViewer({ onError, snapshot }: { onError: (msg: string) => void; snapshot: SceneSnapshot }): JSX.Element {
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
      <Viewer>
        <PreviewCamera />
      </Viewer>
    </div>
  );
}
