import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resourceFromArtifact } from "../../../src/main/resources/sessionResources";

describe("sessionResources", () => {
  it("discovers the Hunyuan 3D preview sidecar regardless of image format", () => {
    const directory = mkdtempSync(join(tmpdir(), "arch-agent-preview-"));
    const modelPath = join(directory, "modern-sofa.glb");
    const previewPath = `${modelPath}.preview.webp`;
    writeFileSync(modelPath, "glb");
    writeFileSync(previewPath, "webp");

    try {
      const resource = resourceFromArtifact({ id: "resource_model", sessionId: "session_1", name: "modern-sofa.glb", kind: "glb", path: modelPath, size: 3, createdAt: "2026-01-01T00:00:00.000Z" });

      expect(resource?.kind).toBe("model3d");
      expect(resource?.metadata.preview_path).toBe(previewPath);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
