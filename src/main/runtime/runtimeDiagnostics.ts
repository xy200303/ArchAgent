/** Performs bounded runtime health checks for settings diagnostics. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { compactText } from "../agent/agentTools";
import {
  createBundledPythonEnv,
  findBundledPythonRuntime,
  type BundledPythonRuntime
} from "./bundledRuntime";
import type {
  BundledPythonRuntimeStatus,
  RuntimeCheckResult,
  RuntimeCommandCheck
} from "../../shared/types";

const execFileAsync = promisify(execFile);

export type RuntimeExecFile = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeout: number;
    maxBuffer: number;
    windowsHide: boolean;
  }
) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>;

export interface RuntimeDiagnosticsOptions {
  projectRootDir: string;
  cwd: string;
  resourcesDir?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => string;
  execFileImpl?: RuntimeExecFile;
}

export function getBundledPythonRuntimeStatus(options: {
  projectRootDir: string;
  resourcesDir?: string;
}): BundledPythonRuntimeStatus {
  const runtime = findBundledPythonRuntime({ rootDir: options.projectRootDir, resourcesDir: options.resourcesDir });
  if (!runtime) {
    return { available: false };
  }

  return runtimeToStatus(runtime);
}

export async function checkRuntime(options: RuntimeDiagnosticsOptions): Promise<RuntimeCheckResult> {
  const runtime = findBundledPythonRuntime({ rootDir: options.projectRootDir, resourcesDir: options.resourcesDir });
  const env = runtime ? createBundledPythonEnv(runtime, options.env ?? process.env) : (options.env ?? process.env);
  const source = runtime ? "bundled" : "system";
  const pythonCommand = runtime?.pythonExePath || "python";

  return {
    checkedAt: options.now?.() ?? new Date().toISOString(),
    bundledPython: runtime ? runtimeToStatus(runtime) : { available: false },
    python: await checkRuntimeCommand(pythonCommand, ["--version"], {
      cwd: options.cwd,
      env,
      source,
      execFileImpl: options.execFileImpl
    }),
    pip: await checkRuntimeCommand(pythonCommand, ["-m", "pip", "--version"], {
      cwd: options.cwd,
      env,
      source,
      execFileImpl: options.execFileImpl
    })
  };
}

export async function checkRuntimeCommand(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    source: RuntimeCommandCheck["source"];
    execFileImpl?: RuntimeExecFile;
  }
): Promise<RuntimeCommandCheck> {
  const startedAt = Date.now();
  const execImpl = options.execFileImpl ?? execFileAsync;

  try {
    const { stdout, stderr } = await execImpl(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: 10000,
      maxBuffer: 1024 * 64,
      windowsHide: true
    });
    return {
      ok: true,
      command: [command, ...args].join(" "),
      source: options.source,
      output: compactText([stdout, stderr].map(toText).filter(Boolean).join("\n"), 2000).trim(),
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ok: false,
      command: [command, ...args].join(" "),
      source: options.source,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt
    };
  }
}

function runtimeToStatus(runtime: BundledPythonRuntime): BundledPythonRuntimeStatus {
  return {
    available: true,
    source: runtime.source,
    homeDir: runtime.homeDir,
    pythonExePath: runtime.pythonExePath,
    scriptsDir: runtime.scriptsDir
  };
}

function toText(value: string | Buffer): string {
  return Buffer.isBuffer(value) ? value.toString("utf-8") : value;
}
