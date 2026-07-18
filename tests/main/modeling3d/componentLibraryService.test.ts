import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { importGlobalComponent, listGlobalComponents, loadGlobalComponentAsset, loadGlobalComponentPreview, saveGlobalComponentPreview } from "../../../src/main/modeling3d/componentLibraryService";

describe("componentLibraryService", () => {
  const temporaryRoots: string[] = [];

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("migrates legacy project assets into the global personal library", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "arch-agent-components-"));
    temporaryRoots.push(sandbox);
    const applicationRoot = join(sandbox, "application");
    const projectRoot = join(sandbox, "project");
    const legacyDirectory = join(projectRoot, "data", "component-library", "assets");
    const legacyFile = join(legacyDirectory, "modern-sofa.glb");

    mkdirSync(legacyDirectory, { recursive: true });
    writeFileSync(legacyFile, "glb-content");
    writeFileSync(`${legacyFile}.semantic.json`, JSON.stringify({
      name: "Modern sofa",
      source: "hunyuan-3d",
      model: "hy-3d-3.0",
      prompt: "Modern three-seat sofa",
      file: legacyFile,
      createdAt: "2026-07-17T00:00:00.000Z"
    }), "utf8");

    const components = listGlobalComponents(applicationRoot, projectRoot);
    const globalFile = join(applicationRoot, "data", "component-library", "assets", "modern-sofa.glb");

    expect(components).toHaveLength(1);
    expect(components[0]).toMatchObject({ name: "Modern sofa", file: globalFile });
    expect(existsSync(globalFile)).toBe(true);
    expect(existsSync(`${globalFile}.semantic.json`)).toBe(true);
    expect(existsSync(legacyFile)).toBe(true);
  });

  it("copies a project-local model into the global library and preserves its source file", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "arch-agent-components-"));
    temporaryRoots.push(sandbox);
    const applicationRoot = join(sandbox, "application");
    const projectFile = join(sandbox, "project", "output", "assets", "downloaded-chair.glb");

    mkdirSync(join(sandbox, "project", "output", "assets"), { recursive: true });
    writeFileSync(projectFile, "glb-content");

    const component = importGlobalComponent(applicationRoot, projectFile, {
      name: "Downloaded chair",
      category: "furniture",
      tags: ["chair", "downloaded"]
    });

    expect(component).toMatchObject({ name: "Downloaded chair", source: "external", category: "furniture" });
    expect(component.file).not.toBe(projectFile);
    expect(existsSync(component.file)).toBe(true);
    expect(existsSync(projectFile)).toBe(true);
  });

  it("loads model bytes only for a registered global component", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "arch-agent-components-"));
    temporaryRoots.push(sandbox);
    const projectFile = join(sandbox, "project", "output", "assets", "preview.glb");

    mkdirSync(join(sandbox, "project", "output", "assets"), { recursive: true });
    writeFileSync(projectFile, "mesh-preview");
    const component = importGlobalComponent(join(sandbox, "application"), projectFile);
    const payload = loadGlobalComponentAsset(join(sandbox, "application"), component.id);

    expect(payload).toMatchObject({ id: component.id, format: "glb" });
    expect(Buffer.from(payload.dataBase64, "base64").toString()).toBe("mesh-preview");
  });

  it("persists a generated PNG thumbnail beside the global component", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "arch-agent-components-"));
    temporaryRoots.push(sandbox);
    const applicationRoot = join(sandbox, "application");
    const projectFile = join(sandbox, "project", "output", "assets", "previewable.glb");
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

    mkdirSync(join(sandbox, "project", "output", "assets"), { recursive: true });
    writeFileSync(projectFile, "mesh-preview");
    const component = importGlobalComponent(applicationRoot, projectFile);
    saveGlobalComponentPreview(applicationRoot, component.id, png.toString("base64"));

    expect(listGlobalComponents(applicationRoot)[0]).toMatchObject({ id: component.id, previewAvailable: true });
    expect(loadGlobalComponentPreview(applicationRoot, component.id)).toBe(`data:image/png;base64,${png.toString("base64")}`);
  });
});
