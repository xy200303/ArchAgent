/** Pure renderer helpers for labels, file presentation, and path-safe UI operations. */
import {
  File,
  FileCode2,
  FileJson2,
  FileSpreadsheet,
  FileText,
  Image,
  type LucideIcon
} from "lucide-react";
import type { AppSettings, ArtifactKind, ChatSession, ProjectInfo } from "../../../shared/types";


export function statusLabel(status: ChatSession["status"]): string {
  const map = {
    idle: "空闲",
    running: "生成中",
    completed: "已完成",
    failed: "失败"
  };
  return map[status];
}

export function isImageKind(kind: ArtifactKind): boolean {
  return kind === "png" || kind === "jpg" || kind === "jpeg" || kind === "webp" || kind === "svg";
}

export function isTextWorkspaceFile(kind: ArtifactKind): boolean {
  return kind === "md" || kind === "txt" || kind === "json" || kind === "log";
}

export function looksLikeBinary(content: string): boolean {
  return content.slice(0, 8000).includes("\u0000");
}

export function resolveMonacoLanguage(fileName: string): string {
  const lowerName = fileName.toLowerCase();
  if (lowerName === "dockerfile") return "dockerfile";
  const extension = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".") + 1) : "";
  const languageByExtension: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    jsonc: "json",
    md: "markdown",
    markdown: "markdown",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "cpp",
    cc: "cpp",
    cpp: "cpp",
    cxx: "cpp",
    h: "cpp",
    hpp: "cpp",
    cs: "csharp",
    html: "html",
    htm: "html",
    xml: "xml",
    svg: "xml",
    vue: "html",
    css: "css",
    scss: "scss",
    less: "less",
    yaml: "yaml",
    yml: "yaml",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    ps1: "powershell",
    bat: "bat",
    cmd: "bat",
    sql: "sql",
    php: "php",
    lua: "lua",
    r: "r",
    swift: "swift",
    kt: "kotlin",
    ini: "ini",
    toml: "ini",
    env: "ini",
    cfg: "ini",
    conf: "ini"
  };
  return languageByExtension[extension] ?? "plaintext";
}

export function getWorkspaceFileIconSpec(fileName: string): { Icon: LucideIcon; className: string } {
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() : "";
  if (["png", "jpg", "jpeg", "webp", "svg", "gif", "bmp"].includes(extension)) {
    return { Icon: Image, className: "file-icon-image" };
  }
  if (["csv", "xlsx", "xls"].includes(extension)) {
    return { Icon: FileSpreadsheet, className: "file-icon-sheet" };
  }
  if (extension === "pdf") {
    return { Icon: FileText, className: "file-icon-pdf" };
  }
  if (extension === "doc" || extension === "docx") {
    return { Icon: FileText, className: "file-icon-doc" };
  }
  if (extension === "json" || extension === "jsonc") {
    return { Icon: FileJson2, className: "file-icon-json" };
  }
  if (extension === "md" || extension === "markdown") {
    return { Icon: FileText, className: "file-icon-md" };
  }
  if (
    [
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "go",
      "rs",
      "java",
      "c",
      "cc",
      "cpp",
      "h",
      "hpp",
      "cs",
      "rb",
      "php",
      "sh",
      "sql",
      "html",
      "css",
      "xml",
      "yaml",
      "yml",
      "vue"
    ].includes(extension)
  ) {
    return { Icon: FileCode2, className: "file-icon-code" };
  }
  if (extension === "txt" || extension === "log") {
    return { Icon: FileText, className: "file-icon-text" };
  }
  return { Icon: File, className: "file-icon-default" };
}

export function isSpreadsheetFileName(fileName: string): boolean {
  return /\.(csv|xlsx|xls)$/i.test(fileName);
}

export function getWorkspaceArtifactKind(fileName: string): ArtifactKind {
  const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() : "";
  if (extension === "csv") return "txt";
  if (extension === "xlsx" || extension === "xls") return "other";
  if (extension === "pdf") return "pdf";
  if (extension === "docx") return "docx";
  if (extension === "png" || extension === "jpg" || extension === "jpeg" || extension === "webp" || extension === "svg") {
    return extension;
  }
  if (extension === "json") return "json";
  if (extension === "md" || extension === "markdown") return "md";
  if (extension === "txt" || extension === "py" || extension === "ts" || extension === "js" || extension === "sql") return "txt";
  if (extension === "log") return "log";
  return "other";
}

export function isSafeWorkspaceEntryName(name: string): boolean {
  return Boolean(name) && name !== "." && name !== ".." && !/[<>:"/\\|?*\u0000-\u001f]/.test(name);
}

export function joinWorkspacePath(rootPath: string, name: string): string {
  const separator = rootPath.includes("\\") ? "\\" : "/";
  return `${rootPath.replace(/[\\/]$/, "")}${separator}${name}`;
}

export function getInitialProjectFromUrl(): ProjectInfo | undefined {
  const params = new URLSearchParams(window.location.search);
  const projectPath = params.get("projectPath");
  if (!projectPath) return undefined;
  const name = projectPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() || projectPath;
  return { path: projectPath, name };
}

export function resolveSessionTitle(sessions: ChatSession[], sessionId?: string): string {
  if (!sessionId) return "历史会话";
  return sessions.find((session) => session.id === sessionId)?.title || "历史会话";
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function runtimeSourceLabel(source?: AppSettings["runtime"]["bundledPython"]["source"]): string {
  if (source === "resources") return "安装包资源";
  if (source === "project") return "项目目录";
  return "运行时资源";
}

export function formatToolPreview(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return content;
  }
}
