/** Imports picker, browser-payload, and operating-system clipboard attachments. */
import electron from "electron";
import { copyFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type {
  AttachmentRef,
  ChatSession,
  ClipboardAttachmentInput,
  PasteAttachmentInput,
  PickAttachmentInput
} from "../../shared/types";
import type { SessionResource } from "../../shared/types";
import { linkSessionResource, resourceFromAttachment } from "../resources/sessionResources";
import { prepareImportedAttachments, sanitizeAttachmentName } from "./attachmentImport";

const { clipboard, dialog } = electron;

export function createAttachmentService(options: {
  sessions: Map<string, ChatSession>;
  attachments: Map<string, AttachmentRef>;
  resources: Map<string, SessionResource>;
  ensureDataDirs: () => void;
  ensureProjectDirs: (projectPath: string) => void;
  ensureSessionImportDir: (sessionId: string) => string;
  createId: (prefix: string) => string;
  now: () => string;
  schedulePersistState: () => void;
}) {
  async function pickAttachments(input: PickAttachmentInput): Promise<AttachmentRef[]> {
    const sessionId = input.sessionId;
    if (!sessionId || !options.sessions.has(sessionId)) {
      throw new Error("Session not found");
    }
    options.ensureProjectDirs(options.sessions.get(sessionId)!.projectPath);
    const importDir = options.ensureSessionImportDir(sessionId);
    const filters = [
      {
        name: "Supported files",
        extensions: [
          "csv",
          "xlsx",
          "xls",
          "json",
          "jsonl",
          "parquet",
          "sqlite",
          "db",
          "docx",
          "pdf",
          "md",
          "txt",
          "png",
          "jpg",
          "jpeg",
          "webp",
          "svg"
        ]
      },
      { name: "All files", extensions: ["*"] }
    ];
    const result = await dialog.showOpenDialog({
      properties: input.multiple === false ? ["openFile"] : ["openFile", "multiSelections"],
      filters
    });
    if (result.canceled) return [];

    return result.filePaths.map((filePath) => {
      const id = options.createId("resource");
      const safeName = sanitizeAttachmentName(basename(filePath));
      const destPath = join(importDir, `${id}-${safeName}`);
      copyFileSync(filePath, destPath);
      const attachment: AttachmentRef = {
        id,
        sessionId,
        name: safeName,
        mimeType: "application/octet-stream",
        size: statSync(destPath).size,
        path: destPath,
        source: "picker",
        createdAt: options.now()
      };
      options.attachments.set(attachment.id, attachment);
      options.resources.set(attachment.id, resourceFromAttachment(attachment, options.sessions.get(sessionId)!.projectPath)!);
      linkSessionResource(options.sessions.get(sessionId)!, attachment.id, options.now());
      options.schedulePersistState();
      return attachment;
    });
  }

  function importClipboardAttachments(input: ClipboardAttachmentInput): AttachmentRef[] {
    const sessionId = input.sessionId;
    if (!sessionId || !options.sessions.has(sessionId)) {
      throw new Error("Session not found");
    }
    options.ensureDataDirs();
    options.ensureProjectDirs(options.sessions.get(sessionId)!.projectPath);
    const importDir = options.ensureSessionImportDir(sessionId);
    return prepareImportedAttachments(input, {
      inputDir: importDir,
      createId: () => options.createId("resource")
    }).map((file) => {
      writeFileSync(file.outputPath, file.buffer);
      const attachment: AttachmentRef = {
        id: file.id,
        sessionId,
        name: file.safeName,
        mimeType: file.mimeType,
        size: statSync(file.outputPath).size,
        path: file.outputPath,
        source: file.source,
        createdAt: options.now()
      };
      options.attachments.set(attachment.id, attachment);
      options.resources.set(attachment.id, resourceFromAttachment(attachment, options.sessions.get(sessionId)!.projectPath)!);
      linkSessionResource(options.sessions.get(sessionId)!, attachment.id, options.now());
      options.schedulePersistState();
      return attachment;
    });
  }

  function readClipboardFilePaths(): string[] {
    const raw: string[] = [];

    if (process.platform === "win32") {
      const buffer = clipboard.readBuffer("FileNameW");
      if (buffer && buffer.length > 0) {
        const text = buffer.toString("utf16le").replace(/\0+$/, "");
        raw.push(...text.split("\0"));
      }
    } else if (process.platform === "darwin") {
      const fileUrl = clipboard.read("public.file-url");
      if (fileUrl) raw.push(fileUrl);
    }

    const uriList = clipboard.read("text/uri-list");
    if (uriList) {
      raw.push(...uriList.split("\n"));
    }

    const filePaths: string[] = [];
    for (const rawLine of raw) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      let filePath = line;
      try {
        const url = new URL(line);
        if (url.protocol === "file:") {
          filePath = decodeURIComponent(url.pathname);
        }
      } catch {
        // Not a URL, treat as a raw path.
      }
      if (existsSync(filePath)) filePaths.push(filePath);
    }
    return filePaths;
  }

  function pasteAttachmentsFromClipboard(input: PasteAttachmentInput): AttachmentRef[] {
    const sessionId = input.sessionId;
    if (!sessionId || !options.sessions.has(sessionId)) {
      throw new Error("Session not found");
    }

    const filePaths = readClipboardFilePaths();
    if (filePaths.length === 0) {
      return [];
    }

    options.ensureProjectDirs(options.sessions.get(sessionId)!.projectPath);
    const importDir = options.ensureSessionImportDir(sessionId);
    const imported: AttachmentRef[] = [];

    for (const filePath of filePaths) {
      const id = options.createId("resource");
      const safeName = sanitizeAttachmentName(basename(filePath));
      const destPath = join(importDir, `${id}-${safeName}`);
      copyFileSync(filePath, destPath);
      const attachment: AttachmentRef = {
        id,
        sessionId,
        name: safeName,
        mimeType: "application/octet-stream",
        size: statSync(destPath).size,
        path: destPath,
        source: "clipboard",
        createdAt: options.now()
      };
      options.attachments.set(attachment.id, attachment);
      options.resources.set(attachment.id, resourceFromAttachment(attachment, options.sessions.get(sessionId)!.projectPath)!);
      linkSessionResource(options.sessions.get(sessionId)!, attachment.id, options.now());
      imported.push(attachment);
    }

    options.schedulePersistState();
    return imported;
  }


  return {
    pickAttachments,
    importClipboardAttachments,
    pasteAttachmentsFromClipboard
  };
}
