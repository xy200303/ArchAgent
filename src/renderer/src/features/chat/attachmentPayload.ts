/** Converts browser File objects into the bounded preload attachment payload. */
import type { ClipboardAttachmentInput } from "../../../../shared/types";
import {
  MAX_DIRECT_ATTACHMENT_BYTES,
  MAX_DIRECT_ATTACHMENT_FILES,
  MAX_DIRECT_ATTACHMENT_TOTAL_BYTES
} from "../../../../shared/attachmentLimits";

export { MAX_DIRECT_ATTACHMENT_BYTES, MAX_DIRECT_ATTACHMENT_FILES, MAX_DIRECT_ATTACHMENT_TOTAL_BYTES };

export async function filesToAttachmentPayload(
  files: File[],
  fallbackName = "attached-file"
): Promise<ClipboardAttachmentInput["files"]> {
  assertAttachableFiles(files);
  return Promise.all(
    files.map(async (file) => ({
      name: file.name || fallbackName,
      mimeType: file.type || "application/octet-stream",
      dataBase64: await fileToBase64(file)
    }))
  );
}

export function assertAttachableFiles(files: File[]): void {
  if (files.length > MAX_DIRECT_ATTACHMENT_FILES) {
    throw new Error(`一次最多添加 ${MAX_DIRECT_ATTACHMENT_FILES} 个附件，请分批添加。`);
  }

  const oversized = files.find((file) => file.size > MAX_DIRECT_ATTACHMENT_BYTES);
  if (oversized) {
    throw new Error(
      `${oversized.name || "未命名文件"} 超过 ${formatAttachmentLimit(MAX_DIRECT_ATTACHMENT_BYTES)}，请使用“选择附件”添加大文件。`
    );
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_DIRECT_ATTACHMENT_TOTAL_BYTES) {
    throw new Error(
      `本次附件总大小超过 ${formatAttachmentLimit(MAX_DIRECT_ATTACHMENT_TOTAL_BYTES)}，请分批添加或使用“选择附件”。`
    );
  }
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function formatAttachmentLimit(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
