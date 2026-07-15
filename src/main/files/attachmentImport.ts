/** Validates and prepares user-provided files before they enter a project workspace. */
import { join } from "node:path";
import { MAX_DIRECT_ATTACHMENT_BYTES, MAX_DIRECT_ATTACHMENT_TOTAL_BYTES } from "../../shared/attachmentLimits";
import type { ClipboardAttachmentInput } from "../../shared/types";

const MAX_SAFE_ATTACHMENT_NAME_LENGTH = 120;
const WINDOWS_RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export interface PreparedImportedAttachment {
  id: string;
  safeName: string;
  mimeType: string;
  source: "clipboard" | "drop";
  outputPath: string;
  buffer: Buffer;
}

export function prepareImportedAttachments(
  input: ClipboardAttachmentInput,
  options: {
    inputDir: string;
    createId: () => string;
  }
): PreparedImportedAttachment[] {
  const source: "clipboard" | "drop" = input.source === "drop" ? "drop" : "clipboard";
  const prepared = input.files.map((file) => {
    const id = options.createId();
    const safeName = sanitizeAttachmentName(file.name);
    const buffer = decodeBase64File(file.dataBase64);
    if (buffer.byteLength > MAX_DIRECT_ATTACHMENT_BYTES) {
      throw new Error(`${safeName} 超过附件大小限制，请使用“选择附件”。`);
    }

    return {
      id,
      safeName,
      mimeType: file.mimeType || "application/octet-stream",
      source,
      outputPath: join(options.inputDir, `${id}-${safeName}`),
      buffer
    };
  });

  const totalBytes = prepared.reduce((sum, file) => sum + file.buffer.byteLength, 0);
  if (totalBytes > MAX_DIRECT_ATTACHMENT_TOTAL_BYTES) {
    throw new Error("附件总大小超过限制，请分批添加或使用“选择附件”。");
  }

  return prepared;
}

export function sanitizeAttachmentName(name: string): string {
  let sanitized = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!sanitized.replace(/_/g, "").trim()) {
    return "attached-file";
  }

  if (WINDOWS_RESERVED_DEVICE_NAME.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }

  return limitAttachmentNameLength(sanitized);
}

function decodeBase64File(value: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) {
    throw new Error("附件数据不是有效的 base64。");
  }
  return Buffer.from(value, "base64");
}

function limitAttachmentNameLength(name: string): string {
  if (name.length <= MAX_SAFE_ATTACHMENT_NAME_LENGTH) {
    return name;
  }

  const extensionStart = name.lastIndexOf(".");
  const hasExtension = extensionStart > 0 && extensionStart < name.length - 1;
  if (!hasExtension) {
    return trimTrailingDotsAndSpaces(name.slice(0, MAX_SAFE_ATTACHMENT_NAME_LENGTH)) || "attached-file";
  }

  const extension = name.slice(extensionStart);
  if (extension.length >= MAX_SAFE_ATTACHMENT_NAME_LENGTH - 1) {
    return trimTrailingDotsAndSpaces(name.slice(0, MAX_SAFE_ATTACHMENT_NAME_LENGTH)) || "attached-file";
  }

  const base = name.slice(0, extensionStart);
  const baseMaxLength = MAX_SAFE_ATTACHMENT_NAME_LENGTH - extension.length;
  const limitedBase = trimTrailingDotsAndSpaces(base.slice(0, baseMaxLength)) || "attached-file";
  return `${limitedBase}${extension}`;
}

function trimTrailingDotsAndSpaces(value: string): string {
  return value.replace(/[. ]+$/g, "");
}
