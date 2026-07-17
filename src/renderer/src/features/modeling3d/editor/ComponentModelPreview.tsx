/** Displays cached component thumbnails and creates a cache entry only when one is missing. */
import { useEffect, useRef, useState, type JSX } from "react";
import { AmbientLight, Box3, DirectionalLight, Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import type { ArchAgentApi } from "../../../../../shared/types";
import { loadMeshObject } from "../scene/loadMeshObject";

let previewGenerationQueue = Promise.resolve();

export function ComponentModelPreview({ api, assetId, label }: { api: ArchAgentApi; assetId: string; label: string }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "160px 0px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const loadPreview = async (): Promise<void> => {
      const cachedPreview = await api.componentLibrary.loadPreview(assetId);
      if (cachedPreview) {
        if (!cancelled) setPreviewUrl(cachedPreview);
        return;
      }

      await queuePreviewGeneration(() => generateAndCachePreview(api, assetId));
      const generatedPreview = await api.componentLibrary.loadPreview(assetId);
      if (!cancelled) setPreviewUrl(generatedPreview);
    };
    void loadPreview().catch(() => {
      if (!cancelled) setPreviewUrl(undefined);
    });
    return () => { cancelled = true; };
  }, [api, assetId, visible]);

  return (
    <div ref={hostRef} className="component-model-preview" aria-label={`${label} 三维预览`}>
      {previewUrl ? <img className="component-preview-image" src={previewUrl} alt="" /> : <div className="component-preview-placeholder" aria-hidden="true" />}
    </div>
  );
}

/** Serializes cache generation so a large library never creates multiple WebGL contexts at once. */
function queuePreviewGeneration(task: () => Promise<void>): Promise<void> {
  const queuedTask = previewGenerationQueue.then(task, task);
  previewGenerationQueue = queuedTask.catch(() => undefined);
  return queuedTask;
}

/** Renders one offscreen model image, persists it, then immediately releases all GPU resources. */
async function generateAndCachePreview(api: ArchAgentApi, assetId: string): Promise<void> {
  const payload = await api.componentLibrary.loadAsset(assetId);
  const source = await loadMeshObject(payload.format, payload.dataBase64);
  const canvas = document.createElement("canvas");
  canvas.width = 288;
  canvas.height = 216;
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });

  try {
    renderer.setPixelRatio(1);
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.setClearAlpha(0);
    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 1.35));
    const keyLight = new DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);
    const fillLight = new DirectionalLight(0xffffff, 0.7);
    fillLight.position.set(-3, 2, -4);
    scene.add(fillLight);
    scene.add(normalizePreviewObject(source));
    const camera = new PerspectiveCamera(34, canvas.width / canvas.height, 0.1, 100);
    camera.position.set(2.8, 2.2, 3.2);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const imageBase64 = canvas.toDataURL("image/png").split(",")[1];
    if (!imageBase64) throw new Error("无法生成构件预览图。");
    await api.componentLibrary.savePreview(assetId, imageBase64);
  } finally {
    disposeObjectResources(source);
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

function normalizePreviewObject(source: Object3D): Object3D {
  const bounds = new Box3().setFromObject(source);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const largestDimension = Math.max(size.x, size.y, size.z, 0.01);
  source.position.sub(center);
  source.scale.setScalar(1.65 / largestDimension);
  return source;
}

function disposeObjectResources(source: Object3D): void {
  source.traverse((node) => {
    const mesh = node as Object3D & { geometry?: { dispose(): void }; material?: { dispose(): void } | Array<{ dispose(): void }> };
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
    else mesh.material?.dispose();
  });
}
