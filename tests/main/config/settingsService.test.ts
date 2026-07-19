import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSettingsService } from "../../../src/main/config/settingsService";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("settingsService", () => {
  it("resets the writable config from the no-key default template", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "arch-agent-settings-"));
    temporaryDirectories.push(rootDir);
    const environmentKeys = ["HY3_API_KEY", "HY3_CHAT_MODEL", "HY3_3D_MODEL", "AGENT_SCRIPT_TIMEOUT_S"] as const;
    const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
    const envLocalPath = join(rootDir, ".env.local");
    const templatePath = join(rootDir, ".env.example");
    writeFileSync(templatePath, [
      "HY3_API_KEY=",
      "HY3_CHAT_MODEL=hy3",
      "HY3_3D_MODEL=hy-3d-3.0",
      "AGENT_SCRIPT_TIMEOUT_S=60",
      ""
    ].join("\n"), "utf-8");
    writeFileSync(envLocalPath, "HY3_API_KEY=previous-secret\nHY3_CHAT_MODEL=custom-model\n", "utf-8");

    try {
      const settings = createSettingsService({
        envLocalPath,
        envPath: join(rootDir, "packaged.env"),
        projectRootDir: rootDir
      }).reset();

      expect(readFileSync(envLocalPath, "utf-8")).toBe(readFileSync(templatePath, "utf-8"));
      expect(settings.openai.apiKeyConfigured).toBe(false);
      expect(settings.openai.chatModel).toBe("hy3");
      expect(settings.tokenHub3d.model).toBe("hy-3d-3.0");
      expect(settings.agent.scriptTimeoutSeconds).toBe(60);
    } finally {
      for (const key of environmentKeys) {
        const value = originalEnvironment.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
