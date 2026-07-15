import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_DIRECT_ATTACHMENT_BYTES, MAX_DIRECT_ATTACHMENT_TOTAL_BYTES } from "../../../src/shared/attachmentLimits";
import { prepareImportedAttachments, sanitizeAttachmentName } from "../../../src/main/files/attachmentImport";

describe("attachmentImport", () => {
  it("sanitizes unsafe attachment names", () => {
    expect(sanitizeAttachmentName('  需求<说明>:"v1"?.docx  ')).toBe("需求_说明___v1__.docx");
    expect(sanitizeAttachmentName("\u0000\t")).toBe("attached-file");
  });

  it("keeps imported names compatible with Windows filesystem rules", () => {
    expect(sanitizeAttachmentName("CON.txt")).toBe("_CON.txt");
    expect(sanitizeAttachmentName("report. ")).toBe("report");
    expect(sanitizeAttachmentName(`${"a".repeat(180)}.pdf`)).toMatch(/^a{116}\.pdf$/);
    expect(sanitizeAttachmentName("NUL")).toBe("_NUL");
  });

  it("prepares clipboard or drop files for writing under the input directory", () => {
    const prepared = prepareImportedAttachments(
      {
        sessionId: "session_1",
        source: "drop",
        files: [{ name: "方案.md", mimeType: "text/markdown", dataBase64: Buffer.from("# 方案").toString("base64") }]
      },
      {
        inputDir: "C:\\App\\data\\input",
        createId: () => "attachment_1"
      }
    );

    expect(prepared).toHaveLength(1);
    expect(prepared[0]).toMatchObject({
      id: "attachment_1",
      safeName: "方案.md",
      mimeType: "text/markdown",
      source: "drop",
      outputPath: join("C:\\App\\data\\input", "attachment_1-方案.md")
    });
    expect(prepared[0]?.buffer.toString("utf-8")).toBe("# 方案");
  });

  it("rejects invalid base64 payloads", () => {
    expect(() =>
      prepareImportedAttachments(
        {
          files: [{ name: "bad.txt", mimeType: "text/plain", dataBase64: "not-base64!" }]
        },
        { inputDir: "C:\\App\\data\\input", createId: () => "attachment_1" }
      )
    ).toThrow("base64");
  });

  it("rejects oversized direct imports", () => {
    const oversized = Buffer.alloc(MAX_DIRECT_ATTACHMENT_BYTES + 1).toString("base64");

    expect(() =>
      prepareImportedAttachments(
        {
          files: [{ name: "big.pdf", mimeType: "application/pdf", dataBase64: oversized }]
        },
        { inputDir: "C:\\App\\data\\input", createId: () => "attachment_1" }
      )
    ).toThrow("超过附件大小限制");
  });

  it("rejects import batches over the total size limit", () => {
    const chunk = Buffer.alloc(Math.floor(MAX_DIRECT_ATTACHMENT_TOTAL_BYTES / 4) + 1).toString("base64");
    let id = 0;

    expect(() =>
      prepareImportedAttachments(
        {
          files: Array.from({ length: 4 }, (_, index) => ({
            name: `${index}.txt`,
            mimeType: "text/plain",
            dataBase64: chunk
          }))
        },
        { inputDir: "C:\\App\\data\\input", createId: () => `attachment_${++id}` }
      )
    ).toThrow("附件总大小超过限制");
  });
});
