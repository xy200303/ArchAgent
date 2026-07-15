/** Defines stable camera locations for the spatial editor viewport. */
export type CameraPreset = "perspective" | "top" | "front" | "right" | "reset";

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  up?: [number, number, number];
}

const DEFAULT_TARGET: [number, number, number] = [2.5, 1.2, 2];

const CAMERA_POSES: Record<CameraPreset, CameraPose> = {
  perspective: { position: [9, 7, 9], target: DEFAULT_TARGET },
  top: { position: [2.5, 24, 2.01], target: [2.5, 0, 2], up: [0, 0, -1] },
  front: { position: [2.5, 7, 22], target: [2.5, 1.2, 2] },
  right: { position: [22, 7, 2], target: [2.5, 1.2, 2] },
  reset: { position: [9, 7, 9], target: DEFAULT_TARGET }
};

export function getCameraPose(preset: CameraPreset): CameraPose {
  return CAMERA_POSES[preset];
}
