import { describe, expect, it } from "vitest";
import { getErrorMessage, resolveArchAgentApi } from "../../../src/renderer/src/platform/bridge";

describe("renderer bridge", () => {
  it("rejects a missing preload bridge with a user-facing error", () => {
    const result = resolveArchAgentApi(undefined);

    expect(result.api).toBeUndefined();
    expect(result.error).toContain("Electron 预加载桥未注入");
  });

  it("rejects an incomplete preload bridge before the app calls nested methods", () => {
    const result = resolveArchAgentApi({
      session: {},
      events: {}
    });

    expect(result.api).toBeUndefined();
    expect(result.error).toContain("session.list");
    expect(result.error).toContain("events.subscribe");
  });

  it("accepts a complete bridge shape", () => {
    const bridge = {
      app: { getMetadata() {} },
      session: { list() {}, create() {} },
      chat: { prompt() {} },
      attachment: { pick() {} },
      artifact: { list() {} },
      runtime: { status() {}, scan() {} },
      settings: { get() {} },
      scene: { getSnapshot() {} },
      events: { subscribe() {} }
    };

    expect(resolveArchAgentApi(bridge).api).toBe(bridge);
  });

  it("normalizes unknown errors into readable messages", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("bad")).toBe("bad");
    expect(getErrorMessage({})).toBe("操作失败，请稍后重试。");
  });
});
