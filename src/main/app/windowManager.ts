/** Owns Electron windows, renderer loading, CSP registration, and renderer event broadcast. */
import electron from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RendererEvent } from "../../shared/types";
import { registerContentSecurityPolicy } from "./securityHeaders";

const { BrowserWindow } = electron;

export interface WindowManager {
  createWindow(projectPath?: string): void;
  sendEvent(event: RendererEvent): void;
}

export function createWindowManager(options: {
  projectRootDir: string;
  resourcesDir?: string;
  getWindowTitle: () => string;
}): WindowManager {
  const windows = new Map<number, Electron.BrowserWindow>();

  function resolveWindowIconPath(): string | undefined {
    const candidates = [
      options.resourcesDir ? join(options.resourcesDir, "build", "icon.png") : "",
      options.resourcesDir ? join(options.resourcesDir, "build", "icon.ico") : "",
      join(options.projectRootDir, "build", "icon.png"),
      join(options.projectRootDir, "build", "icon.ico")
    ];
    return candidates.find((candidate) => Boolean(candidate) && existsSync(candidate));
  }

  function createWindow(projectPath?: string): void {
    const windowIconPath = resolveWindowIconPath();
    const window = new BrowserWindow({
      width: 1360,
      height: 860,
      minWidth: 1180,
      minHeight: 760,
      title: options.getWindowTitle(),
      autoHideMenuBar: true,
      ...(windowIconPath ? { icon: windowIconPath } : {}),
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        enableBlinkFeatures: "WebGPU"
      }
    });
    window.setMenuBarVisibility(false);
    window.removeMenu();

    const windowId = window.webContents.id;
    windows.set(windowId, window);
    window.on("closed", () => windows.delete(windowId));

    registerContentSecurityPolicy(window.webContents.session, {
      dev: Boolean(process.env.ELECTRON_RENDERER_URL)
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      const url = new URL(process.env.ELECTRON_RENDERER_URL);
      if (projectPath) url.searchParams.set("projectPath", projectPath);
      void window.loadURL(url.toString());
    } else {
      const query = projectPath ? { projectPath } : undefined;
      void window.loadFile(join(__dirname, "../renderer/index.html"), { query });
    }

    if (process.env.NODE_ENV === "development" || process.env.ELECTRON_RENDERER_URL) {
      window.webContents.openDevTools({ mode: "detach" });
    }
  }

  return {
    createWindow,
    sendEvent(event) {
      for (const window of windows.values()) {
        window.webContents.send("app:event", event);
      }
    }
  };
}
