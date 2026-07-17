/** Verifies Hunyuan 3D request validation before an external generation job is submitted. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateHunyuanGlb } from "../../../src/main/modeling3d/hunyuan3dService";

describe("hunyuan3dService", () => {
  const originalHy3ApiKey = process.env.HY3_API_KEY;
  const originalFaceCount = process.env.HY3_3D_FACE_COUNT;

  afterEach(() => {
    if (originalHy3ApiKey === undefined) delete process.env.HY3_API_KEY;
    else process.env.HY3_API_KEY = originalHy3ApiKey;
    if (originalFaceCount === undefined) delete process.env.HY3_3D_FACE_COUNT;
    else process.env.HY3_3D_FACE_COUNT = originalFaceCount;
    vi.unstubAllGlobals();
  });

  it("rejects an English text-to-3D prompt before submitting a remote job", async () => {
    process.env.HY3_API_KEY = "test-key";

    await expect(generateHunyuanGlb({
      name: "modern sofa",
      prompt: "A modern three-seat sofa"
    }, process.cwd())).rejects.toThrow("仅支持中文正向提示词");
  });

  it("uses PascalCase generate types and surfaces a failed submit response", async () => {
    process.env.HY3_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "",
      status: "failed",
      error: { message: "【GenerateType】仅支持Normal,LowPoly,Geometry,Sketch" }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateHunyuanGlb({
      name: "现代沙发",
      prompt: "现代三人位沙发，浅灰色布艺材质"
    }, process.cwd())).rejects.toThrow("GenerateType");

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ generate_type: "Normal", face_count: 50_000 });
  });

  it("honors a compact detail budget instead of the provider's 500,000-face default", async () => {
    process.env.HY3_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "", status: "failed", error: { message: "expected test failure" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateHunyuanGlb({ name: "现代沙发", prompt: "现代三人位沙发", detailLevel: "draft" }, process.cwd())).rejects.toThrow("expected test failure");

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({ face_count: 20_000 });
  });

  it("requires and persists the provider preview before publishing a generated GLB", async () => {
    process.env.HY3_API_KEY = "test-key";
    const outputDir = mkdtempSync(join(tmpdir(), "arch-agent-hunyuan-"));
    const preview = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "job_1", status: "queued" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "completed", data: [{ type: "glb", url: "https://example.test/model.glb", preview_image_url: "https://example.test/model.png" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(Buffer.from("glb-model"), { status: 200 }))
      .mockResolvedValueOnce(new Response(preview, { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const generated = await generateHunyuanGlb({ name: "现代沙发", prompt: "现代三人位沙发" }, outputDir);
      const semantic = JSON.parse(readFileSync(`${generated.path}.semantic.json`, "utf8")) as { previewFile?: string };

      expect(semantic.previewFile).toBe(`${generated.path}.preview.png`);
      expect(existsSync(semantic.previewFile!)).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
