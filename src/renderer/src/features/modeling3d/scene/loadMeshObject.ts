/** Parses supported mesh payloads without exposing file paths to the renderer. */
import { Mesh, MeshStandardMaterial, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { SceneAssetNode } from "../../../../../shared/modeling3d/sceneContracts";

export async function loadMeshObject(format: SceneAssetNode["format"], dataBase64: string): Promise<Object3D> {
  const bytes = base64ToArrayBuffer(dataBase64);
  if (format === "glb" || format === "gltf") {
    const gltf = await new Promise<{ scene: Object3D }>((resolve, reject) =>
      new GLTFLoader().parse(bytes, "", (result) => resolve({ scene: result.scene }), reject)
    );
    return gltf.scene;
  }
  if (format === "obj") return new OBJLoader().parse(new TextDecoder().decode(bytes));

  const geometry = new STLLoader().parse(bytes);
  geometry.computeVertexNormals();
  return new Mesh(geometry, new MeshStandardMaterial({ color: "#b8c5d1", roughness: 0.72 }));
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return bytes.buffer;
}
