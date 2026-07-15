import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compactText,
  getReadToolName,
  readDocumentText,
  sanitizeFileName,
  writeUtf8File
} from "../../../src/main/agent/agentTools";

describe("agentTools", () => {
  it("maps file extensions to built-in read tools", () => {
    expect(getReadToolName("template.docx")).toBe("read_file");
    expect(getReadToolName("report.pdf")).toBe("read_pdf");
    expect(getReadToolName("screenshot.png")).toBe("read_image");
    expect(getReadToolName("notes.md")).toBe("read_file");
  });

  it("sanitizes unsafe file names", () => {
    expect(sanitizeFileName('  数据<分析>:"报告"?.md  ')).toBe("数据_分析___报告__.md");
    expect(sanitizeFileName("   ")).toBe("artifact");
  });

  it("compacts long text and keeps a truncation hint", () => {
    const compacted = compactText("第一段\n\n\n\n第二段" + "x".repeat(20), 10);

    expect(compacted).toContain("第一段\n\n第二");
    expect(compacted).toContain("内容过长");
  });

  it("reads supported text documents", async () => {
    const result = await readDocumentText(join(process.cwd(), "tests", "fixtures", "sample.txt"), 200);

    expect(result.toolName).toBe("read_file");
    expect(result.sourceName).toBe("sample.txt");
    expect(result.content).toContain("示例销售分析数据集");
    expect(result.summary).toContain("已读取 sample.txt");
  });

  it("writes utf-8 files and creates parent directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-"));
    const output = join(dir, "nested", "分析报告.md");

    try {
      await writeUtf8File(output, "# 销售分析报告\n\n测试内容");
      await expect(readFile(output, "utf-8")).resolves.toContain("测试内容");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
