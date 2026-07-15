import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const electronViteBin = resolve(rootDir, "node_modules", "electron-vite", "bin", "electron-vite.js");
const env = { ...process.env };

// Some hosted/dev terminals set this to make Electron behave like Node.
// Electron apps need the real browser runtime, so always clear it here.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(process.execPath, [electronViteBin, ...process.argv.slice(2)], {
  cwd: rootDir,
  env,
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
