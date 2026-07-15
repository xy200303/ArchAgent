import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildArtifactPreview } from "../../../src/main/files/artifactPreview";
import type { ArtifactSummary } from "../../../src/shared/types";

describe("artifactPreview", () => {
  it("builds text previews for markdown artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-preview-text-"));
    const filePath = join(dir, "分析报告.md");

    try {
      await writeFile(filePath, "# 销售分析报告\n\n正文内容", "utf-8");
      const preview = await buildArtifactPreview(createArtifact(filePath, "分析报告.md", "md"));

      expect(preview.mode).toBe("text");
      expect(preview.text).toContain("销售分析报告");
      expect(preview.path).toBe(filePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("builds data url previews for image artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-preview-image-"));
    const filePath = join(dir, "diagram.png");

    try {
      await writeFile(
        filePath,
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          "base64"
        )
      );
      const preview = await buildArtifactPreview(createArtifact(filePath, "diagram.png", "png"));

      expect(preview.mode).toBe("image");
      expect(preview.mimeType).toBe("image/png");
      expect(preview.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(preview.path).toBe(filePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns unsupported previews for docx artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-preview-docx-"));
    const filePath = join(dir, "数据说明.docx");

    try {
      await writeFile(filePath, Buffer.from([80, 75, 3, 4]));
      const preview = await buildArtifactPreview(createArtifact(filePath, "数据说明.docx", "docx"));

      expect(preview.mode).toBe("unsupported");
      expect(preview.path).toBe(filePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns unsupported previews for pdf artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-preview-pdf-"));
    const filePath = join(dir, "report.pdf");

    try {
      await writeFile(filePath, Buffer.from("%PDF-1.4"));
      const preview = await buildArtifactPreview(createArtifact(filePath, "report.pdf", "pdf"));

      expect(preview.mode).toBe("unsupported");
      expect(preview.path).toBe(filePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns unsupported previews for unknown artifact types", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-preview-other-"));
    const filePath = join(dir, "archive.bin");

    try {
      await writeFile(filePath, Buffer.from([1, 2, 3]));
      const preview = await buildArtifactPreview(createArtifact(filePath, "archive.bin", "other"));

      expect(preview.mode).toBe("unsupported");
      expect(preview.summary).toContain("不支持");
      expect(preview.path).toBe(filePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function createArtifact(path: string, name: string, kind: ArtifactSummary["kind"]): ArtifactSummary {
  return {
    id: "artifact_1",
    name,
    kind,
    path,
    size: 0,
    createdAt: "2026-05-23T00:00:00.000Z"
  };
}
