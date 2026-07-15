/** Applies viewport-only camera commands without changing the shared scene. */
import { useThree } from "@react-three/fiber";
import { useEffect, type JSX } from "react";
import type { CameraPreset } from "./cameraPresets";
import { getCameraPose } from "./cameraPresets";

interface OrbitLikeControls {
  target: { set(x: number, y: number, z: number): void };
  update(): void;
}

export interface CameraCommand {
  preset: CameraPreset;
  revision: number;
}

export function CameraPresetController({ command }: { command?: CameraCommand }): JSX.Element | null {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as OrbitLikeControls | undefined;

  useEffect(() => {
    if (!command) return;

    const pose = getCameraPose(command.preset);
    camera.position.set(...pose.position);
    camera.up.set(...(pose.up ?? [0, 1, 0]));
    camera.lookAt(...pose.target);
    camera.updateProjectionMatrix();
    controls?.target.set(...pose.target);
    controls?.update();
  }, [camera, command, controls]);

  return null;
}
