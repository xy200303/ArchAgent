import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getSessionResources, resourceFromArtifact, resourceFromAttachment, toSessionResourceSummary } from "../../../src/main/resources/sessionResources";

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

  it("includes original user uploads in their session resource list", () => {
    const session = {
      id: "session_1",
      title: "测试会话",
      status: "idle" as const,
      projectPath: "C:/project",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      items: [],
      resourceLinks: [{ resourceId: "resource_upload", confirmed: false, pinned: false, addedAt: "2026-01-01T00:00:00.000Z" }]
    };
    const upload = resourceFromAttachment({
      id: "resource_upload",
      sessionId: session.id,
      name: "原始参考图.png",
      mimeType: "image/png",
      size: 1024,
      path: "C:/project/input/original.png",
      source: "picker",
      createdAt: "2026-01-01T00:00:00.000Z"
    }, session.projectPath)!;

    const [resource] = getSessionResources([upload], session);

    expect(resource.source).toBe("user_upload");
    expect(toSessionResourceSummary(resource)).not.toHaveProperty("path");
  });
});
