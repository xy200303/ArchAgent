/** Parses supported mesh payloads without exposing file paths to the renderer. */
import { Box3, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { SceneAssetNode } from "../../../../../shared/modeling3d/sceneContracts";

const MAX_CACHED_TEMPLATES_PER_FORMAT = 3;
const sceneAssetTemplates = new Map<SceneAssetNode["format"], Map<string, Promise<Object3D>>>();

export async function loadMeshObject(format: SceneAssetNode["format"], data: ArrayBuffer): Promise<Object3D> {
  if (format === "glb" || format === "gltf") {
    const gltf = await new Promise<{ scene: Object3D }>((resolve, reject) =>
      new GLTFLoader().parse(data, "", (result) => resolve({ scene: result.scene }), reject)
    );
    return gltf.scene;
  }
  if (format === "obj") return new OBJLoader().parse(new TextDecoder().decode(data));

  const geometry = new STLLoader().parse(data);
  geometry.computeVertexNormals();
  return new Mesh(geometry, new MeshStandardMaterial({ color: "#b8c5d1", roughness: 0.72 }));
}

/** Reuses parsed geometry for repeated library instances while preserving independent transforms. */
export async function loadMeshObjectForScene(
  format: SceneAssetNode["format"],
  data: ArrayBuffer,
  stableCacheKey?: string,
  targetDimensions?: [number, number, number]
): Promise<Object3D> {
  let templates = sceneAssetTemplates.get(format);
  if (!templates) {
    templates = new Map();
    sceneAssetTemplates.set(format, templates);
  }

  const sourceCacheKey = stableCacheKey ?? await createAssetCacheKey(data);
  const cacheKey = `${sourceCacheKey}:${targetDimensions?.join(",") ?? "native"}`;
  let template = templates.get(cacheKey);
  if (!template) {
    template = loadMeshObject(format, data).then((object) => normalizeMeshObjectForScene(object, targetDimensions));
    templates.set(cacheKey, template);
    void template.catch(() => templates?.delete(cacheKey));
    if (templates.size > MAX_CACHED_TEMPLATES_PER_FORMAT) {
      const oldest = templates.keys().next().value;
      if (oldest) templates.delete(oldest);
    }
  }
  return (await template).clone(true);
}

/** Makes the persisted asset position represent its visible bottom-center, regardless of GLB local origin. */
export function normalizeMeshObjectForScene(source: Object3D, targetDimensions?: [number, number, number]): Object3D {
  source.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(source);
  if (bounds.isEmpty()) return source;
  if (targetDimensions) {
    const size = bounds.getSize(new Vector3());
    if (size.x > 0 && size.y > 0 && size.z > 0) {
      source.scale.multiply(new Vector3(targetDimensions[0] / size.x, targetDimensions[1] / size.y, targetDimensions[2] / size.z));
      source.updateMatrixWorld(true);
      bounds.setFromObject(source);
    }
  }
  const center = bounds.getCenter(new Vector3());
  source.position.sub(new Vector3(center.x, bounds.min.y, center.z));
  const container = new Group();
  container.add(source);
  return container;
}

async function createAssetCacheKey(data: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return `${data.byteLength}:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
