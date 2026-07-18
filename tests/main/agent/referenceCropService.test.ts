import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { cropReferenceObjects } from "../../../src/main/agent/referenceCropService";

describe("referenceCropService", () => {
  const directories: string[] = [];
  afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

  it("crops normalized object bounds into standalone PNG references", async () => {
    const directory = mkdtempSync(join(tmpdir(), "arch-agent-crop-"));
    directories.push(directory);
    const sourcePath = join(directory, "scene.png");
    await sharp({ create: { width: 100, height: 80, channels: 4, background: "#ffffff" } }).png().toFile(sourcePath);

    const [crop] = await cropReferenceObjects({
      sourcePath,
      outputDir: join(directory, "crops"),
      regions: [{ id: "chair", name: "椅子", box: [100, 250, 400, 500] }]
    });

    expect(existsSync(crop.path)).toBe(true);
    await expect(sharp(crop.path).metadata()).resolves.toMatchObject({ width: 40, height: 40 });
  });
});
