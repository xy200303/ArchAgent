/** Locates bundled runtime resources and constructs their process environment. */
import { delimiter, join, resolve } from "node:path";
import { existsSync } from "node:fs";

export type BundledResourceSource = "resources" | "project";

export interface BundledPythonRuntime {
  platform: "win32";
  source: BundledResourceSource;
  homeDir: string;
  pythonExePath: string;
  scriptsDir: string;
  pathEntries: string[];
}

export interface BundledPythonRuntimeOptions {
  rootDir: string;
  resourcesDir?: string;
  platform?: NodeJS.Platform;
  enabled?: boolean;
}

const WINDOWS_PYTHON_DIR_NAMES = ["python", "pyhton"] as const;

export function getProcessResourcesDir(): string | undefined {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

export function resolveBundledResourceDir(
  rootDir: string,
  resourceName: string,
  resourcesDir = getProcessResourcesDir(),
  projectRelativeFallback = resourceName
): string {
  const resourceCandidate = resourcesDir ? join(resourcesDir, resourceName) : "";
  if (resourceCandidate && existsSync(resourceCandidate)) {
    return resourceCandidate;
  }
  return join(rootDir, projectRelativeFallback);
}

export function findBundledPythonRuntime(
  options: BundledPythonRuntimeOptions
): BundledPythonRuntime | undefined {
  const platform = options.platform ?? process.platform;
  if (options.enabled === false || platform !== "win32") return undefined;

  const candidates = buildRuntimeBaseCandidates(options.rootDir, options.resourcesDir);
  for (const candidate of candidates) {
    for (const dirName of WINDOWS_PYTHON_DIR_NAMES) {
      const homeDir = resolve(candidate.baseDir, "runtime", "win", dirName);
      const pythonExePath = join(homeDir, "python.exe");
      if (!existsSync(pythonExePath)) continue;

      const scriptsDir = join(homeDir, "Scripts");
      return {
        platform: "win32",
        source: candidate.source,
        homeDir,
        pythonExePath,
        scriptsDir,
        pathEntries: collectPythonPathEntries(homeDir)
      };
    }
  }

  return undefined;
}

export function createBundledPythonEnv(
  runtime: BundledPythonRuntime,
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  const pathKey = findPathEnvKey(env);
  env[pathKey] = mergePathEntries(runtime.pathEntries, env[pathKey] ?? "");
  env.PYTHONUTF8 ??= "1";
  env.PYTHONIOENCODING ??= "utf-8";
  env.PIP_DISABLE_PIP_VERSION_CHECK ??= "1";
  return env;
}

export function mergePathEntries(
  prependedEntries: string[],
  existingPath: string,
  pathDelimiter = delimiter
): string {
  const entries: string[] = [];
  const seen = new Set<string>();

  for (const entry of [...prependedEntries, ...existingPath.split(pathDelimiter)]) {
    const normalized = normalizePathEntry(entry);
    if (!normalized || seen.has(normalized)) continue;
    entries.push(entry);
    seen.add(normalized);
  }

  return entries.join(pathDelimiter);
}

function buildRuntimeBaseCandidates(
  rootDir: string,
  resourcesDir?: string
): Array<{ source: BundledResourceSource; baseDir: string }> {
  const candidates: Array<{ source: BundledResourceSource; baseDir: string }> = [];
  if (resourcesDir) {
    candidates.push({ source: "resources", baseDir: resourcesDir });
  }
  candidates.push({ source: "project", baseDir: rootDir });

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const normalized = resolve(candidate.baseDir).toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function collectPythonPathEntries(homeDir: string): string[] {
  return [homeDir, join(homeDir, "Scripts"), join(homeDir, "DLLs"), join(homeDir, "Library", "bin")].filter((entry) =>
    existsSync(entry)
  );
}

function findPathEnvKey(env: NodeJS.ProcessEnv): string {
  return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
}

function normalizePathEntry(entry: string): string {
  return entry.trim().replace(/[\\/]+$/, "").toLowerCase();
}
