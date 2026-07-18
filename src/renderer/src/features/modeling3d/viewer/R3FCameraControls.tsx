/** Owns CAD-style camera navigation for the renderer-owned R3F canvas. */
import { CameraControls, CameraControlsImpl, type CameraControls as CameraControlsHandle } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type JSX, type RefObject } from "react";
import { Quaternion } from "three";

export type EditorCameraPreset = "free" | "top" | "front" | "right" | "left" | "bottom" | "back";

type CameraPosition = readonly [number, number, number];

const CAMERA_TARGET: CameraPosition = [2.5, 1.2, 2];
const CAMERA_PRESET_POSITIONS: Record<EditorCameraPreset, CameraPosition> = {
  free: [11, 8, 11],
  top: [2.5, 24, 2.01],
  front: [2.5, 3, 16],
  right: [16, 3, 2],
  left: [-11, 3, 2],
  bottom: [2.5, -22, 2.01],
  back: [2.5, 3, -12]
};

export function R3FCameraControls({
  preset,
  revision,
  enabled,
  focusTarget,
  focusRevision,
  controlsRef,
  onOrientationChange
}: {
  preset: EditorCameraPreset;
  revision: number;
  enabled: boolean;
  focusTarget?: [number, number, number];
  focusRevision: number;
  controlsRef: RefObject<CameraControlsHandle | null>;
  onOrientationChange: (quaternion: Quaternion) => void;
}): JSX.Element {
  const latestFocusTarget = useRef<[number, number, number] | undefined>(undefined);

  useEffect(() => {
    const [cameraX, cameraY, cameraZ] = CAMERA_PRESET_POSITIONS[preset];
    const [targetX, targetY, targetZ] = CAMERA_TARGET;
    void controlsRef.current?.setLookAt(cameraX, cameraY, cameraZ, targetX, targetY, targetZ, true);
  }, [controlsRef, preset, revision]);

  useEffect(() => {
    latestFocusTarget.current = focusTarget;
  }, [focusTarget]);

  /** Focus only follows an explicit toolbar request, never a selection change. */
  useEffect(() => {
    const target = latestFocusTarget.current;
    if (!target || focusRevision === 0) return;
    void controlsRef.current?.setLookAt(target[0] + 8, target[1] + 6, target[2] + 8, ...target, true);
  }, [controlsRef, focusRevision]);

  return (
    <>
      <CameraControls
        ref={controlsRef}
        makeDefault
        enabled={enabled}
        minDistance={1.5}
        maxDistance={50}
        minPolarAngle={0.06}
        maxPolarAngle={Math.PI - 0.06}
        smoothTime={0.22}
        mouseButtons={{
          left: CameraControlsImpl.ACTION.ROTATE,
          middle: CameraControlsImpl.ACTION.TRUCK,
          right: CameraControlsImpl.ACTION.TRUCK,
          wheel: CameraControlsImpl.ACTION.DOLLY
        }}
      />
      <CameraOrientationSync onOrientationChange={onOrientationChange} />
    </>
  );
}

/** Synchronizes the DOM gizmo without scheduling React state updates per frame. */
function CameraOrientationSync({ onOrientationChange }: { onOrientationChange: (quaternion: Quaternion) => void }): null {
  const camera = useThree((state) => state.camera);
  const previousOrientation = useRef(new Quaternion());

  useFrame(() => {
    if (previousOrientation.current.equals(camera.quaternion)) return;
    previousOrientation.current.copy(camera.quaternion);
    onOrientationChange(camera.quaternion);
  });

  return null;
}
