import { describe, expect, it } from "vitest";
import { toAgentFailure } from "../../../src/main/agent/agentFailure";

describe("toAgentFailure", () => {
  it("uses a provider error code from structured response data", () => {
    const error = Object.assign(new Error("request failed"), {
      status: 401,
      response: { data: { error: { code: "401002" } } }
    });

    expect(toAgentFailure(error)).toMatchObject({ code: "401002", category: "auth", message: "request failed" });
  });

  it("reads an error code from a structured JSON provider response", () => {
    expect(toAgentFailure(new Error('401: {"error":{"code":"429001","message":"rate limited"}}'))).toMatchObject({
      code: "429001"
    });
  });

  it("marks rate limits as retryable and keeps retry-after metadata", () => {
    const error = Object.assign(new Error("too many requests"), {
      status: 429,
      response: { data: { error: { code: "429001" } }, headers: { "retry-after": "12" } }
    });

    expect(toAgentFailure(error)).toMatchObject({
      code: "429001",
      category: "rate_limit",
      retryable: true,
      retryAfterSeconds: 12
    });
  });
});
