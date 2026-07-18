import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPersistedState, savePersistedState, type PersistedStateSnapshot } from "../../../src/main/projects/sessionPersistence";
import {
  getProjectStateFilePath,
  getProjectResourcesFilePath,
  loadProjectResources,
  loadProjectState,
  saveProjectResources,
  saveProjectState,
  type ProjectStateSnapshot
} from "../../../src/main/projects/sessionPersistence";

describe("sessionPersistence", () => {
  it("saves and restores sessions, artifacts, attachments and memory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-state-"));
    const filePath = join(dir, "state.json");
    const snapshot: PersistedStateSnapshot = {
      sessions: [
        {
          id: "session_1",
      title: "客厅建模",
          status: "completed",
      projectPath: "C:/projects/客厅建模",
          createdAt: "2026-05-23T00:00:00.000Z",
          updatedAt: "2026-05-23T00:01:00.000Z",
          items: [
            {
              id: "msg_1",
              kind: "message",
              role: "assistant",
              content: "已生成分析报告。",
              isFinished: true,
              createdAt: "2026-05-23T00:01:00.000Z"
            }
          ]
        }
      ],
      attachments: [
        {
          id: "attachment_1",
          sessionId: "session_1",
          name: "数据说明.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: 1024,
          path: "C:/tmp/数据说明.docx",
          source: "picker",
          createdAt: "2026-05-23T00:00:10.000Z"
        }
      ],
      artifacts: [
        {
          id: "artifact_1",
          name: "分析报告.md",
          kind: "md",
          path: "C:/tmp/分析报告.md",
          size: 2048,
          createdAt: "2026-05-23T00:01:00.000Z"
        }
      ],
      sessionMemories: {
        session_1: [{ source: "数据口径", content: "按月统计订单金额" }]
      },
      recentProjectPaths: []
    };

    try {
      savePersistedState(filePath, snapshot);
      const restored = loadPersistedState(filePath);

    expect(restored?.sessions[0]?.title).toBe("客厅建模");
      expect(restored?.attachments[0]?.name).toBe("数据说明.docx");
      expect(restored?.artifacts[0]?.kind).toBe("md");
      expect(restored?.sessionMemories.session_1[0]?.content).toBe("按月统计订单金额");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns null when no state file exists", () => {
    expect(loadPersistedState(join(tmpdir(), "missing-arch-agent-state.json"))).toBeNull();
  });

  it("ignores legacy version 1 state while restoring", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-legacy-state-"));
    const filePath = join(dir, "state.json");

    try {
      await writeFile(
        filePath,
        JSON.stringify(
          {
            version: 1,
            savedAt: "2026-05-23T00:00:00.000Z",
            sessions: [],
            attachments: [],
            artifacts: [],
            templateLoadedSessionIds: ["legacy_session"],
            sessionMemories: {}
          },
          null,
          2
        ),
        "utf-8"
      );

      expect(loadPersistedState(filePath)).toEqual({
        sessions: [],
        attachments: [],
        artifacts: [],
        resources: [],
        sessionMemories: {},
        recentProjectPaths: []
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stores project sessions under <project>/.agent/sessions.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-project-state-"));
    const snapshot: ProjectStateSnapshot = {
      sessions: [
        {
          id: "session_project_1",
          title: "项目内会话",
          status: "idle",
          projectPath: dir,
          createdAt: "2026-07-13T00:00:00.000Z",
          updatedAt: "2026-07-13T00:00:00.000Z",
          items: []
        }
      ],
      attachments: [],
      artifacts: [],
      sessionMemories: {
        session_project_1: [{ source: "备注", content: "项目隔离存储" }]
      }
    };

    try {
      saveProjectState(dir, snapshot);
      expect(getProjectStateFilePath(dir)).toBe(join(dir, ".agent", "sessions.json"));

      const restored = loadProjectState(dir);
      expect(restored?.sessions[0]?.title).toBe("项目内会话");
      expect(restored?.sessions[0]?.projectPath).toBe(dir);
      expect(restored?.sessionMemories.session_project_1[0]?.content).toBe("项目隔离存储");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stores the project resource registry under <project>/.agent/resources.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arch-agent-project-resources-"));
    try {
      saveProjectResources(dir, {
        resources: [{
          id: "resource_floorplan",
          sessionId: "session_project_1",
          name: "户型图.png",
          kind: "image",
          mimeType: "image/png",
          size: 12,
          path: join(dir, "input", "户型图.png"),
          source: "user_upload",
          parentResourceIds: [],
          metadata: {},
          status: "ready",
          confirmed: true,
          pinned: false,
          createdAt: "2026-07-19T00:00:00.000Z"
        }]
      });

      expect(getProjectResourcesFilePath(dir)).toBe(join(dir, ".agent", "resources.json"));
      expect(loadProjectResources(dir)?.resources[0]?.id).toBe("resource_floorplan");
      expect(loadProjectState(dir)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns null when project has no state file", () => {
    expect(loadProjectState(join(tmpdir(), "missing-arch-agent-project"))).toBeNull();
  });
});
