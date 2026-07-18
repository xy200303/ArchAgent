/** Serializes the live R3F scene with Three's maintained exchange exporters. */
import { useThree } from "@react-three/fiber";
import { useEffect, type JSX } from "react";
import { Object3D, Scene } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import type { SceneExchangeFormat } from "../../../../../shared/modeling3d/sceneContracts";

export function SceneExportBridge({ request, onComplete, onError }: { request?: { format: Exclude<SceneExchangeFormat, "scene-json">; revision: number }; onComplete: (dataBase64: string) => void; onError: (message: string) => void }): JSX.Element | null {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    if (!request) return;
    void exportScene(scene, request.format).then(onComplete).catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
  }, [onComplete, onError, request, scene]);

  return null;
}

/** Exports only authored meshes; editor grid and helpers are intentionally excluded. */
async function exportScene(source: Scene, format: Exclude<SceneExchangeFormat, "scene-json">): Promise<string> {
  const exportRoot = new Scene();
  source.updateMatrixWorld(true);
  for (const child of source.children) {
    if (child.userData.archAgentExportable === false) continue;
    exportRoot.add(cloneExportable(child));
  }
  if (format === "obj") return toBase64(new TextEncoder().encode(new OBJExporter().parse(exportRoot)));
  if (format === "stl") return toBase64(new TextEncoder().encode(String(new STLExporter().parse(exportRoot, { binary: false }))));
  const result = await new Promise<ArrayBuffer | Record<string, unknown>>((resolve, reject) => {
    new GLTFExporter().parse(exportRoot, resolve, reject, { binary: format === "glb", onlyVisible: true });
  });
  return result instanceof ArrayBuffer ? toBase64(new Uint8Array(result)) : toBase64(new TextEncoder().encode(JSON.stringify(result)));
}

/** Strips transient selection and navigation children from otherwise exportable models. */
function cloneExportable(source: Object3D): Object3D {
  const clone = source.clone(true);
  clone.traverse((object) => {
    for (const child of [...object.children]) {
      if (child.userData.archAgentExportable === false) object.remove(child);
    }
  });
  return clone;
}

function toBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) text += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(text);
}
