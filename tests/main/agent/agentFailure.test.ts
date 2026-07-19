import { describe, expect, it } from "vitest";
import { toAgentFailure } from "../../../src/main/agent/agentFailure";

describe("toAgentFailure", () => {
  it("uses a provider error code from structured response data", () => {
    const error = Object.assign(new Error("request failed"), {
      status: 401,
      response: { data: { error: { code: "401002" } } }
    });

    expect(toAgentFailure(error)).toEqual({ code: "401002", message: "request failed" });
  });

  it("reads an error code from a structured JSON provider response", () => {
    expect(toAgentFailure(new Error('401: {"error":{"code":"429001","message":"rate limited"}}'))).toMatchObject({
      code: "429001"
    });
  });
});
