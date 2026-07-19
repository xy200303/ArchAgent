/** Enforces workspace path boundaries and owns main-process file operations. */
import electron from "electron";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { mkdir as mkdirAsync, readFile as readFileAsync, rename as renameAsync, stat as statAsync, writeFile as writeFileAsync } from "node:fs/promises";
import type {
  ArtifactSummary,
  AttachmentRef,
  SessionResource,
  ChatSession,
  CreateDirectoryInput,
  CreateFileInput,
  DeleteFileInput,
  RenameFileInput,
  ReadBinaryFileInput,
  ReadBinaryFileResult,
  ReadTextFileInput,
  WriteTextFileInput
} from "../../shared/types";

const { shell } = electron;

export function createFileService(options: {
  rootDir: string;
  dataDir: string;
  inputDir: string;
  outputDir: string;
  docsDir: string;
  sessions: Map<string, ChatSession>;
  attachments: Map<string, AttachmentRef>;
  artifacts: Map<string, ArtifactSummary>;
  resources: Map<string, SessionResource>;
  schedulePersistState: () => void;
}) {
  function getAllowedFilePaths(): string[] {
    const allowed = new Set<string>([
      options.rootDir,
      options.docsDir,
      options.dataDir,
      options.inputDir,
      options.outputDir
    ]);
    for (const session of options.sessions.values()) {
      const projectPath = resolve(session.projectPath);
      allowed.add(projectPath);
      allowed.add(resolve(join(projectPath, "input")));
      allowed.add(resolve(join(projectPath, "output")));
      allowed.add(resolve(join(projectPath, ".agent")));
    }
    for (const artifact of options.artifacts.values()) {
      allowed.add(resolve(artifact.path));
    }
    for (const resource of options.resources.values()) {
      allowed.add(resolve(resource.path));
    }
    return Array.from(allowed);
  }

  function isPathWithinAllowed(filePath: string): boolean {
    const normalized = resolve(filePath);
    const allowedDirs = getAllowedFilePaths().filter((candidate) => existsSync(candidate));
    for (const allowed of allowedDirs) {
      if (normalized === allowed) return true;
      if (normalized.startsWith(allowed + "\\") || normalized.startsWith(allowed + "/")) return true;
    }
    return false;
  }

  async function readTextFile(input: ReadTextFileInput): Promise<{ content: string; size: number }> {
    if (!isPathWithinAllowed(input.path)) {
      throw new Error("无权访问该文件路径");
    }
    const stats = await statAsync(input.path);
    if (stats.size > 16 * 1024 * 1024) {
      throw new Error("文件过大，暂不支持内置编辑器打开");
    }
    const content = await readFileAsync(input.path, "utf-8");
    return { content, size: stats.size };
  }

  async function writeTextFile(input: WriteTextFileInput): Promise<void> {
    if (!isPathWithinAllowed(input.path)) {
      throw new Error("无权写入该文件路径");
    }
    await writeFileAsync(input.path, input.content, "utf-8");
  }

  async function createFile(input: CreateFileInput): Promise<void> {
    if (!isPathWithinAllowed(input.path)) {
      throw new Error("无权在该路径创建文件");
    }
    if (existsSync(input.path)) {
      throw new Error("文件已存在");
    }
    const parentPath = dirname(input.path);
    if (!existsSync(parentPath)) {
      throw new Error("目标目录不存在");
    }
    await writeFileAsync(input.path, "", "utf-8");
  }

  async function createDirectory(input: CreateDirectoryInput): Promise<void> {
    if (!isPathWithinAllowed(input.path)) {
      throw new Error("无权在该路径创建文件夹");
    }
    if (existsSync(input.path)) {
      throw new Error("文件夹已存在");
    }
    const parentPath = dirname(input.path);
    if (!existsSync(parentPath)) {
      throw new Error("目标目录不存在");
    }
    await mkdirAsync(input.path);
  }

  async function deleteFile(input: DeleteFileInput): Promise<void> {
    if (!isPathWithinAllowed(input.path)) {
      throw new Error("无权删除该路径");
    }
    const stats = await statAsync(input.path);
    await shell.trashItem(input.path);
    cleanupFileReferences(input.path, stats.isDirectory());
  }

  async function renameFile(input: RenameFileInput): Promise<void> {
    if (!isPathWithinAllowed(input.path)) {
      throw new Error("无权重命名该路径");
    }
    const name = input.name.trim();
    if (!isValidWorkspaceEntryName(name)) {
      throw new Error("名称不能为空，且不能包含路径分隔符或保留字符");
    }
    const nextPath = join(dirname(input.path), name);
    if (!isPathWithinAllowed(nextPath)) {
      throw new Error("无权重命名到目标路径");
    }
    if (existsSync(nextPath)) {
      throw new Error("同名文件或文件夹已存在");
    }
    const stats = await statAsync(input.path);
    await renameAsync(input.path, nextPath);
    updateFileReferences(input.path, nextPath, stats.isDirectory());
  }

  function isValidWorkspaceEntryName(name: string): boolean {
    return Boolean(name) && name !== "." && name !== ".." && !/[\\/:*?"<>|]/.test(name);
  }

  function cleanupFileReferences(deletedPath: string, isDirectory: boolean): void {
    const normalizedDeleted = resolve(deletedPath).toLowerCase();
    const underDeleted = (filePath: string): boolean => {
      if (!isDirectory) return false;
      return resolve(filePath).toLowerCase().startsWith(normalizedDeleted + sep);
    };
    for (const [id, attachment] of options.attachments) {
      if (resolve(attachment.path).toLowerCase() === normalizedDeleted || underDeleted(attachment.path)) {
        options.attachments.delete(id);
      }
    }
    for (const [id, artifact] of options.artifacts) {
      if (resolve(artifact.path).toLowerCase() === normalizedDeleted || underDeleted(artifact.path)) {
        options.artifacts.delete(id);
      }
    }
    for (const [id, resource] of options.resources) {
      if (resolve(resource.path).toLowerCase() === normalizedDeleted || underDeleted(resource.path)) {
        options.resources.delete(id);
      }
    }
    options.schedulePersistState();
  }

  function updateFileReferences(previousPath: string, nextPath: string, isDirectory: boolean): void {
    const resolvedPrevious = resolve(previousPath);
    const normalizedPrevious = resolvedPrevious.toLowerCase();
    const rewrite = (filePath: string): string | undefined => {
      const normalizedPath = resolve(filePath).toLowerCase();
      if (normalizedPath === normalizedPrevious) return nextPath;
      if (isDirectory && normalizedPath.startsWith(normalizedPrevious + sep)) {
        return join(nextPath, filePath.slice(resolvedPrevious.length + 1));
      }
      return undefined;
    };
    for (const attachment of options.attachments.values()) {
      const updatedPath = rewrite(attachment.path);
      if (updatedPath) {
        attachment.path = updatedPath;
        attachment.name = basename(updatedPath);
      }
    }
    for (const artifact of options.artifacts.values()) {
      const updatedPath = rewrite(artifact.path);
      if (updatedPath) {
        artifact.path = updatedPath;
        artifact.name = basename(updatedPath);
      }
    }
    for (const resource of options.resources.values()) {
      const updatedPath = rewrite(resource.path);
      if (updatedPath) {
        resource.path = updatedPath;
        resource.name = basename(updatedPath);
      }
    }
    options.schedulePersistState();
  }

  async function revealFile(filePath: string): Promise<void> {
    if (!isPathWithinAllowed(filePath)) {
      throw new Error("无权访问该文件路径");
    }
    const stats = await statAsync(filePath);
    if (stats.isDirectory()) {
      const errorMessage = await shell.openPath(filePath);
      if (errorMessage) {
        throw new Error(errorMessage);
      }
    } else {
      shell.showItemInFolder(filePath);
    }
  }

  async function readBinaryFile(input: ReadBinaryFileInput): Promise<ReadBinaryFileResult> {
    if (!isPathWithinAllowed(input.path)) {
      throw new Error("无权访问该文件路径");
    }
    const stats = await statAsync(input.path);
    if (stats.size > 16 * 1024 * 1024) {
      throw new Error("文件过大，暂不支持内置预览打开");
    }
    const data = await readFileAsync(input.path);
    const extension = extname(input.path).toLowerCase();
    const mimeType = getImageMimeType(extension) || getBinaryMimeType(extension);
    return { dataBase64: data.toString("base64"), mimeType, size: stats.size };
  }

  function getImageMimeType(extension: string): string | undefined {
    const map: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml"
    };
    return map[extension];
  }

  function getBinaryMimeType(extension: string): string | undefined {
    const map: Record<string, string> = {
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    };
    return map[extension];
  }


  return {
    isPathWithinAllowed,
    readTextFile,
    readBinaryFile,
    writeTextFile,
    createFile,
    createDirectory,
    renameFile,
    deleteFile,
    revealFile
  };
}
