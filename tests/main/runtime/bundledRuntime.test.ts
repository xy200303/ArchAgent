import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createBundledPythonEnv,
  findBundledPythonRuntime,
  mergePathEntries,
  resolveBundledResourceDir,
  type BundledPythonRuntime
} from "../../../src/main/runtime/bundledRuntime";

describe("bundledRuntime", () => {
  it("detects the bundled Windows Python runtime with the existing pyhton directory name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-runtime-"));
    const pythonDir = join(dir, "runtime", "win", "pyhton");

    try {
      await mkdir(pythonDir, { recursive: true });
      await writeFile(join(pythonDir, "python.exe"), "");

      const runtime = findBundledPythonRuntime({ rootDir: dir, platform: "win32" });

      expect(runtime?.source).toBe("project");
      expect(runtime?.homeDir).toBe(pythonDir);
      expect(runtime?.pythonExePath).toBe(join(pythonDir, "python.exe"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("prefers packaged resources over the project directory", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "arch-agent-project-"));
    const resourcesDir = await mkdtemp(join(tmpdir(), "arch-agent-resources-"));
    const projectPythonDir = join(projectDir, "runtime", "win", "python");
    const packagedPythonDir = join(resourcesDir, "runtime", "win", "python");

    try {
      await mkdir(projectPythonDir, { recursive: true });
      await mkdir(packagedPythonDir, { recursive: true });
      await writeFile(join(projectPythonDir, "python.exe"), "");
      await writeFile(join(packagedPythonDir, "python.exe"), "");

      const runtime = findBundledPythonRuntime({ rootDir: projectDir, resourcesDir, platform: "win32" });

      expect(runtime?.source).toBe("resources");
      expect(runtime?.homeDir).toBe(packagedPythonDir);
    } finally {
      await rm(projectDir, { recursive: true, force: true });
      await rm(resourcesDir, { recursive: true, force: true });
    }
  });

  it("prepends Python runtime folders to PATH without dropping existing entries", () => {
    const runtime: BundledPythonRuntime = {
      platform: "win32",
      source: "project",
      homeDir: "C:\\App\\runtime\\win\\python",
      pythonExePath: "C:\\App\\runtime\\win\\python\\python.exe",
      scriptsDir: "C:\\App\\runtime\\win\\python\\Scripts",
      pathEntries: ["C:\\App\\runtime\\win\\python", "C:\\App\\runtime\\win\\python\\Scripts"]
    };

    const env = createBundledPythonEnv(runtime, { Path: `C:\\Windows${delimiter}C:\\Tools` });

    expect(env.Path?.split(delimiter).slice(0, 4)).toEqual([
      "C:\\App\\runtime\\win\\python",
      "C:\\App\\runtime\\win\\python\\Scripts",
      "C:\\Windows",
      "C:\\Tools"
    ]);
    expect(env.PYTHONUTF8).toBe("1");
    expect(env.PYTHONIOENCODING).toBe("utf-8");
  });

  it("deduplicates path entries case-insensitively", () => {
    expect(mergePathEntries(["C:\\Python", "c:\\python\\"], "C:\\Python\\Scripts", ";")).toBe(
      "C:\\Python;C:\\Python\\Scripts"
    );
  });

  it("resolves packaged resources before falling back to project resources", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "arch-agent-project-docs-"));
    const resourcesDir = await mkdtemp(join(tmpdir(), "arch-agent-resource-docs-"));
    const docsDir = join(resourcesDir, "docs");

    try {
      await mkdir(docsDir, { recursive: true });

      expect(resolveBundledResourceDir(projectDir, "docs", resourcesDir)).toBe(docsDir);
    } finally {
      await rm(projectDir, { recursive: true, force: true });
      await rm(resourcesDir, { recursive: true, force: true });
    }
  });
});
