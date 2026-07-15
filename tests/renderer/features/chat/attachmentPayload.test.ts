import { describe, expect, it } from "vitest";
import {
  assertAttachableFiles,
  filesToAttachmentPayload,
  MAX_DIRECT_ATTACHMENT_BYTES,
  MAX_DIRECT_ATTACHMENT_FILES,
  MAX_DIRECT_ATTACHMENT_TOTAL_BYTES
} from "../../../../src/renderer/src/features/chat/attachmentPayload";

describe("attachment payload", () => {
  it("converts dropped or pasted files into IPC attachment payloads", async () => {
    const file = new File([new Uint8Array([0x23, 0x20, 0xe6, 0x96, 0xb9, 0xe6, 0xa1, 0x88])], "方案.md", {
      type: "text/markdown"
    });

    const payload = await filesToAttachmentPayload([file]);

    expect(payload).toEqual([
      {
        name: "方案.md",
        mimeType: "text/markdown",
        dataBase64: "IyDmlrnmoYg="
      }
    ]);
  });

  it("fills safe defaults for unnamed files and missing mime types", async () => {
    const file = new File(["abc"], "", { type: "" });

    const payload = await filesToAttachmentPayload([file], "clipboard-file");

    expect(payload[0]?.name).toBe("clipboard-file");
    expect(payload[0]?.mimeType).toBe("application/octet-stream");
    expect(payload[0]?.dataBase64).toBe("YWJj");
  });

  it("rejects oversized direct attachments before reading them into memory", () => {
    const oversized = new File(["x"], "超大需求.pdf");
    Object.defineProperty(oversized, "size", { value: MAX_DIRECT_ATTACHMENT_BYTES + 1 });

    expect(() => assertAttachableFiles([oversized])).toThrow("超过 25 MB");
  });

  it("rejects too many direct attachments", () => {
    const files = Array.from({ length: MAX_DIRECT_ATTACHMENT_FILES + 1 }, (_, index) => new File(["x"], `${index}.txt`));

    expect(() => assertAttachableFiles(files)).toThrow("一次最多添加");
  });

  it("rejects direct attachment batches that are too large in total", () => {
    const files = Array.from({ length: 4 }, (_, index) => new File(["x"], `${index}.txt`));
    for (const file of files) {
      Object.defineProperty(file, "size", { value: MAX_DIRECT_ATTACHMENT_TOTAL_BYTES / 4 + 1 });
    }

    expect(() => assertAttachableFiles(files)).toThrow("总大小超过 80 MB");
  });
});
