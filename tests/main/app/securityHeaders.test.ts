import { describe, expect, it } from "vitest";
import { applyContentSecurityPolicyHeaders, buildContentSecurityPolicy } from "../../../src/main/app/securityHeaders";

describe("securityHeaders", () => {
  it("builds a production CSP that supports local preview workers without remote dev endpoints", () => {
    const policy = buildContentSecurityPolicy({ dev: false });

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(policy).toContain("connect-src 'self' https: blob:");
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toContain("script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'");
    expect(policy).not.toContain("localhost");
  });

  it("allows Vite dev server connections in development CSP", () => {
    const policy = buildContentSecurityPolicy({ dev: true });

    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'");
    expect(policy).toContain("connect-src 'self' https: blob: http://localhost:* ws://localhost:*");
    expect(policy).toContain("http://127.0.0.1:*");
  });

  it("replaces existing CSP response headers case-insensitively", () => {
    const headers = applyContentSecurityPolicyHeaders(
      {
        "content-security-policy": ["default-src *"],
        "X-Test": ["ok"]
      },
      "default-src 'self'"
    );

    expect(headers).toEqual({
      "X-Test": ["ok"],
      "Content-Security-Policy": ["default-src 'self'"]
    });
  });
});
