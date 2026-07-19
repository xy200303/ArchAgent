import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSceneExchangeService } from "../../../src/main/modeling3d/sceneExchangeService";
import { applySceneCommand, createDefaultScene } from "../../../src/shared/modeling3d/sceneReducer";
import type { SceneSnapshot } from "../../../src/shared/modeling3d/sceneContracts";

describe("sceneExchangeService", () => {
  const temporaryRoots: string[] = [];

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("reuses one project-local mesh file for repeated library placements", () => {
    const projectPath = mkdtempSync(join(tmpdir(), "arch-agent-scene-"));
    temporaryRoots.push(projectPath);
    const componentPath = join(projectPath, "library", "sofa.glb");
    mkdirSync(join(projectPath, "library"), { recursive: true });
    writeFileSync(componentPath, "mesh-data");
    let snapshot: SceneSnapshot = createDefaultScene();
    let sequence = 0;
    const service = createSceneExchangeService({
      createId: (prefix) => `${prefix}_${++sequence}`,
      getActiveProjectPath: () => projectPath,
      getSnapshot: () => snapshot,
      replaceSnapshot: (nextSnapshot) => { snapshot = nextSnapshot; return snapshot; },
      executeSceneCommand: (command) => {
        const result = applySceneCommand(snapshot, command, (prefix) => `${prefix}_${++sequence}`);
        if (result.accepted) snapshot = result.snapshot;
        return result;
      }
    });

    const component = { id: "lib_sofa", name: "Sofa", file: componentPath };
    const first = service.placeGlobalComponent(component);
    const second = service.placeGlobalComponent(component);
    const assetsDirectory = join(projectPath, ".agent", "assets");

    expect(first).toMatchObject({ accepted: true });
    expect(second).toMatchObject({ accepted: true });
    expect(readdirSync(assetsDirectory)).toEqual(["library-lib_sofa.glb"]);
    expect(existsSync(join(assetsDirectory, "library-lib_sofa.glb"))).toBe(true);
    const sourcePaths = Object.values(snapshot.nodes).filter((node) => node.type === "asset").map((node) => node.sourcePath);
    expect(sourcePaths).toEqual([join("assets", "library-lib_sofa.glb"), join("assets", "library-lib_sofa.glb")]);
  });
});
