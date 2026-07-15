import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAppPaths } from "../../../src/main/app/appPaths";

describe("appPaths", () => {
  it("keeps development data beside the project root", () => {
    const paths = resolveAppPaths({
      projectRootDir: "C:\\Project\\ArchAgent",
      userDataDir: "C:\\Users\\me\\AppData\\Roaming\\ArchAgent",
      packaged: false
    });

    expect(paths.rootDir).toBe("C:\\Project\\ArchAgent");
    expect(paths.dataDir).toBe("C:\\Project\\ArchAgent\\data");
    expect(paths.envLocalPath).toBe("C:\\Project\\ArchAgent\\.env.local");
    expect(paths.envPath).toBe("C:\\Project\\ArchAgent\\.env");
  });

  it("moves packaged writable data into Electron userData", () => {
    const paths = resolveAppPaths({
      projectRootDir: "C:\\Program Files\\ArchAgent",
      userDataDir: "C:\\Users\\me\\AppData\\Roaming\\ArchAgent",
      packaged: true
    });

    expect(paths.rootDir).toBe("C:\\Users\\me\\AppData\\Roaming\\ArchAgent");
    expect(paths.dataDir).toBe("C:\\Users\\me\\AppData\\Roaming\\ArchAgent\\data");
    expect(paths.outputDir).toBe("C:\\Users\\me\\AppData\\Roaming\\ArchAgent\\data\\output");
    expect(paths.envLocalPath).toBe("C:\\Users\\me\\AppData\\Roaming\\ArchAgent\\.env.local");
    expect(paths.envPath).toBe("C:\\Program Files\\ArchAgent\\.env");
  });

  it("resolves packaged resources while keeping writable data in userData", async () => {
    const projectRootDir = await mkdtemp(join(tmpdir(), "arch-agent-paths-project-"));
    const resourcesDir = await mkdtemp(join(tmpdir(), "arch-agent-paths-resources-"));
    const userDataDir = await mkdtemp(join(tmpdir(), "arch-agent-paths-user-"));
    const docsDir = join(resourcesDir, "docs");

    try {
      await mkdir(docsDir, { recursive: true });

      const paths = resolveAppPaths({
        projectRootDir,
        resourcesDir,
        userDataDir,
        packaged: true
      });

      expect(paths.docsDir).toBe(docsDir);
      expect(paths.dataDir).toBe(join(userDataDir, "data"));
      expect(paths.envPath).toBe(join(resourcesDir, ".env"));
    } finally {
      await rm(projectRootDir, { recursive: true, force: true });
      await rm(resourcesDir, { recursive: true, force: true });
      await rm(userDataDir, { recursive: true, force: true });
    }
  });
});
