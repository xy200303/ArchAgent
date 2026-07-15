/** Defines the renderer Content Security Policy for development and production. */
import type { Session } from "electron";

type ResponseHeaders = Record<string, string[] | string | undefined>;
type CleanResponseHeaders = Record<string, string[] | string>;

export function buildContentSecurityPolicy(options: { dev: boolean }): string {
  const connectSrc = ["'self'", "https:", "blob:"];
  if (options.dev) {
    connectSrc.push("http://localhost:*", "ws://localhost:*", "http://127.0.0.1:*", "ws://127.0.0.1:*");
  }

  const scriptSrc = ["'self'", "'wasm-unsafe-eval'"];
  if (options.dev) {
    // Vite React Refresh injects an inline preamble during development.
    scriptSrc.push("'unsafe-inline'");
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "script-src": scriptSrc,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": connectSrc,
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'", "data:", "blob:"],
    "form-action": ["'self'"]
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function applyContentSecurityPolicyHeaders(headers: ResponseHeaders, policy: string): CleanResponseHeaders {
  const nextHeaders: CleanResponseHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== "content-security-policy" && value !== undefined) {
      nextHeaders[key] = value;
    }
  }
  nextHeaders["Content-Security-Policy"] = [policy];
  return nextHeaders;
}

export function registerContentSecurityPolicy(session: Session, options: { dev: boolean }): void {
  const policy = buildContentSecurityPolicy(options);
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: applyContentSecurityPolicyHeaders(details.responseHeaders ?? {}, policy)
    });
  });
}
