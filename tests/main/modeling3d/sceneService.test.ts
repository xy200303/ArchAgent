import { describe, expect, it, vi } from "vitest";
import { createSceneService } from "../../../src/main/modeling3d/sceneService";

describe("sceneService", () => {
  it("broadcasts only accepted commands and retains the authoritative snapshot", () => {
    const broadcast = vi.fn();
    const service = createSceneService({ createId: (prefix) => `${prefix}_test`, broadcast });

    const rejected = service.execute({ type: "wall.create", parentId: "missing", start: [0, 0], end: [1, 0] });
    const accepted = service.execute({ type: "wall.create", parentId: "level_default", start: [0, 0], end: [1, 0] });

    expect(rejected).toMatchObject({ accepted: false, code: "invalid_parent" });
    expect(accepted).toMatchObject({ accepted: true, snapshot: { revision: 1 } });
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot().revision).toBe(1);
  });
});
