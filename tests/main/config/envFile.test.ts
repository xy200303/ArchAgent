import dotenv from "dotenv";
import { describe, expect, it } from "vitest";
import { formatEnvValue, serializeEnvFile } from "../../../src/main/config/envFile";

describe("envFile", () => {
  it("keeps simple values unquoted for readable .env.local files", () => {
    expect(formatEnvValue("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
    expect(formatEnvValue(true)).toBe("true");
    expect(formatEnvValue(120000)).toBe("120000");
    expect(formatEnvValue(undefined)).toBe("");
  });

  it("quotes values that would otherwise be parsed as comments or broken lines", () => {
    const content = serializeEnvFile([
      { key: "OPENAI_API_KEY", value: "sk-live#with-comment-char" },
      { key: "OPENAI_BASE_URL", value: "https://proxy.example.com/openai v1" },
      { key: "OPENAI_CHAT_MODEL", value: "gpt-5.5" },
      { key: "LIBREOFFICE_PATH", value: "C:\\Program Files\\LibreOffice\\program\\soffice.exe" },
      { key: "CUSTOM_LABEL", value: 'factory"name' },
      { key: "MULTILINE_VALUE", value: "line1\nline2" }
    ]);
    const parsed = dotenv.parse(Buffer.from(content));

    expect(parsed.OPENAI_API_KEY).toBe("sk-live#with-comment-char");
    expect(parsed.OPENAI_BASE_URL).toBe("https://proxy.example.com/openai v1");
    expect(parsed.OPENAI_CHAT_MODEL).toBe("gpt-5.5");
    expect(parsed.LIBREOFFICE_PATH).toBe("C:\\Program Files\\LibreOffice\\program\\soffice.exe");
    expect(parsed.CUSTOM_LABEL).toBe('factory"name');
    expect(parsed.MULTILINE_VALUE).toBe("line1\nline2");
  });
});
