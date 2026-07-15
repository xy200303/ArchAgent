import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkRuntime,
  checkRuntimeCommand,
  getBundledPythonRuntimeStatus,
  type RuntimeExecFile
} from "../../../src/main/runtime/runtimeDiagnostics";

describe("runtimeDiagnostics", () => {
  it("reports missing bundled Python without throwing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-runtime-missing-"));

    try {
      expect(getBundledPythonRuntimeStatus({ projectRootDir: dir })).toEqual({ available: false });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("runs diagnostics against bundled Python when it is available", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-runtime-check-"));
    const pythonDir = join(dir, "runtime", "win", "pyhton");
    const calls: Array<{ command: string; args: string[]; path?: string }> = [];
    const execFileImpl: RuntimeExecFile = async (command, args, options) => {
      calls.push({ command, args, path: options.env.Path ?? options.env.PATH });
      return args.includes("pip")
        ? { stdout: "pip 24.0\n", stderr: "" }
        : { stdout: "", stderr: "Python 3.12.0\n" };
    };

    try {
      await mkdir(join(pythonDir, "Scripts"), { recursive: true });
      await writeFile(join(pythonDir, "python.exe"), "");

      const result = await checkRuntime({
        projectRootDir: dir,
        cwd: dir,
        env: { Path: "C:\\Windows" },
        now: () => "2026-05-23T00:00:00.000Z",
        execFileImpl
      });

      expect(result.checkedAt).toBe("2026-05-23T00:00:00.000Z");
      expect(result.bundledPython.available).toBe(true);
      expect(result.python.source).toBe("bundled");
      expect(result.python.output).toBe("Python 3.12.0");
      expect(result.pip.output).toBe("pip 24.0");
      expect(calls.map((call) => call.command)).toEqual([join(pythonDir, "python.exe"), join(pythonDir, "python.exe")]);
      expect(calls[0]?.path?.toLowerCase()).toContain(pythonDir.toLowerCase());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("falls back to system Python when no bundled runtime exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-runtime-system-"));
    const execFileImpl: RuntimeExecFile = async () => ({ stdout: "Python 3.11.0\n", stderr: "" });

    try {
      const result = await checkRuntime({
        projectRootDir: dir,
        cwd: dir,
        env: { PATH: "C:\\Tools" },
        execFileImpl
      });

      expect(result.bundledPython.available).toBe(false);
      expect(result.python.command).toBe("python --version");
      expect(result.python.source).toBe("system");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns failed command diagnostics instead of throwing", async () => {
    const execFileImpl: RuntimeExecFile = async () => {
      throw new Error("python is blocked");
    };

    const result = await checkRuntimeCommand("python", ["--version"], {
      cwd: process.cwd(),
      env: {},
      source: "system",
      execFileImpl
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("python is blocked");
    expect(result.command).toBe("python --version");
  });
});
