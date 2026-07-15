import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptsDir, "..");
const generatorPath = join(scriptsDir, "generate-app-icon.py");

const candidates = [
  join(rootDir, "runtime", "win", "python", "python.exe"),
  join(rootDir, "runtime", "win", "pyhton", "python.exe"),
  process.env.PYTHON,
  "python",
  "py"
].filter(Boolean);

let lastError = "";

for (const command of candidates) {
  if (isFilePath(command) && !existsSync(command)) {
    continue;
  }

  const result = spawnSync(command, [generatorPath], {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: true
  });

  if (result.status === 0) {
    process.exit(0);
  }

  lastError = result.error?.message || `${command} exited with ${result.status ?? "unknown status"}`;
}

console.error(`Failed to generate app icon. ${lastError}`);
process.exit(1);

function isFilePath(value) {
  return value.includes("/") || value.includes("\\") || value.endsWith(".exe");
}
