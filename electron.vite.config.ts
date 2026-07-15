import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import type { ConfigEnv, Plugin } from "vite";

const packageJson = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as {
  version?: string;
  build?: {
    productName?: string;
  };
};
const appDisplayName = packageJson.build?.productName ?? "ArchAgent";
const appVersion = packageJson.version ?? "0.0.0";
const appTitle = `${appDisplayName} v${appVersion}`;

const appHtmlTitlePlugin: Plugin = {
  name: "app-html-title",
  transformIndexHtml(html) {
    return html.replaceAll("%APP_TITLE%", appTitle);
  }
};

export default defineConfig(({ command }: ConfigEnv) => ({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts")
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts")
        },
        output: {
          format: "cjs" as const,
          entryFileNames: "[name].cjs",
          chunkFileNames: "chunks/[name]-[hash].cjs"
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    base: command === "serve" ? "/" : "./",
    define: {
      "process.env.NODE_ENV": JSON.stringify(command === "serve" ? "development" : "production"),
      "process.env.NEXT_PUBLIC_ASSETS_CDN_URL": JSON.stringify("")
    },
    plugins: [react(), appHtmlTitlePlugin]
  }
}));
