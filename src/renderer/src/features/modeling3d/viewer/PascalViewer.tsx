/** Mounts Pascal's WebGPU scene projection with host-owned camera controls. */
import { CameraControls, type CameraControls as CameraControlsHandle } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { memo, useEffect, useRef, useState, type JSX } from "react";
import { Color } from "three";
import { useScene } from "@pascal-app/core";
import { Viewer } from "@pascal-app/viewer";
import { registerArchAgentNodes } from "../nodes/pascalNodeDefinitions";
import { toPascalScene } from "../scene/pascalSceneAdapter";
import type { SceneSnapshot } from "../../../../../shared/modeling3d/sceneContracts";

registerArchAgentNodes();

export type PascalCameraPreset = "free" | "top";

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

function PascalCameraControls({ preset }: { preset: PascalCameraPreset }): JSX.Element {
  const controls = useRef<CameraControlsHandle>(null);

  useEffect(() => {
    if (preset === "top") {
      void controls.current?.setLookAt(2.5, 24, 2.01, 2.5, 1.2, 2, true);
      return;
    }
    void controls.current?.setLookAt(11, 8, 11, 2.5, 1.2, 2, true);
  }, [preset]);

  return <CameraControls ref={controls} makeDefault minDistance={1.5} maxDistance={50} smoothTime={0.22} />;
}

function PascalViewer({
  onError,
  snapshot,
  cameraPreset
}: {
  onError: (msg: string) => void;
  snapshot: SceneSnapshot;
  cameraPreset: PascalCameraPreset;
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
      <Viewer selectionManager="custom" renderContext="viewer" sceneReadyKey={snapshot.revision}>
        <PascalSceneBackground />
        <PascalGroundGrid />
        <PascalCameraControls preset={cameraPreset} />
      </Viewer>
    </div>
  );
}

export default memo(PascalViewer);
