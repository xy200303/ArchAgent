/** Configures Monaco workers once for all file editor surfaces. */
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

let configured = false;

/**
 * 配置 Monaco 的 Web Worker 与 @monaco-editor/react 加载器。
 * 仅在首次使用文本编辑器时调用，worker 由 Vite 独立打包。
 * （monaco-editor 包内的 workerManager 回退路径会让 Vite 自动打出各语言 worker，
 * 这里显式接入以获得 JSON/TS/CSS/HTML 的校验与补全能力。）
 */
export function ensureMonacoConfigured(): void {
  if (configured) return;
  configured = true;

  self.MonacoEnvironment = {
    getWorker(_workerId, label) {
      if (label === "json") return new jsonWorker();
      if (label === "css" || label === "scss" || label === "less") return new cssWorker();
      if (label === "html" || label === "xml" || label === "handlebars" || label === "razor") {
        return new htmlWorker();
      }
      if (label === "typescript" || label === "javascript") return new tsWorker();
      return new editorWorker();
    }
  };

  loader.config({ monaco });
}
