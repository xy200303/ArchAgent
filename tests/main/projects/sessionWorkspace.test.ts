import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSessionWorkspaceDirs, sanitizeSessionWorkspaceName } from "../../../src/main/projects/sessionWorkspace";

describe("sessionWorkspace", () => {
  it("resolves isolated input and output directories for each session", () => {
    const dataDir = join("C:\\App", "data");

    expect(resolveSessionWorkspaceDirs(dataDir, "session_a")).toEqual({
      workspaceDir: join(dataDir, "workspaces", "session_a"),
      inputDir: join(dataDir, "workspaces", "session_a", "input"),
      outputDir: join(dataDir, "workspaces", "session_a", "output")
    });
    expect(resolveSessionWorkspaceDirs(dataDir, "session_b").outputDir).not.toBe(
      resolveSessionWorkspaceDirs(dataDir, "session_a").outputDir
    );
  });

  it("sanitizes session ids before using them as directory names", () => {
    expect(sanitizeSessionWorkspaceName("session:../bad id")).toBe("session_bad_id");
    expect(sanitizeSessionWorkspaceName("")).toBe("session");
  });
});
