import { describe, expect, it } from "vitest";
import { ErrorBoundary } from "../../../src/renderer/src/platform/ErrorBoundary";

describe("ErrorBoundary", () => {
  it("stores render errors in derived state", () => {
    const error = new Error("render failed");

    expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
  });
});
