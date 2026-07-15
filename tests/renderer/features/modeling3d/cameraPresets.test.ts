/** Covers the stable camera targets used by toolbar view commands. */
import { describe, expect, it } from "vitest";
import { getCameraPose } from "../../../../src/renderer/src/features/modeling3d/viewport/cameraPresets";

describe("cameraPresets", () => {
  it("uses a high, downward-looking pose for the top view", () => {
    const pose = getCameraPose("top");

    expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
    expect(pose.up).toEqual([0, 0, -1]);
  });

  it("restores the perspective pose when reset is requested", () => {
    expect(getCameraPose("reset")).toEqual(getCameraPose("perspective"));
  });
});
