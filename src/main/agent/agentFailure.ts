import type { AgentFailure } from "../../shared/types";

/** Converts provider exceptions into renderer-safe failure metadata at the process boundary. */
export function toAgentFailure(error: unknown): AgentFailure {
  const message = error instanceof Error && error.message ? error.message : String(error);
  const code = readFailureCode(error, message);
  const retryAfterSeconds = readRetryAfterSeconds(error);
  const category = classifyFailure(code);
  return {
    ...(code ? { code } : {}),
    ...(category !== "unknown" ? { category } : {}),
    ...(category === "rate_limit" || category === "gateway" ? { retryable: true } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    message
  };
}

function readFailureCode(error: unknown, message: string): string | undefined {
  const fromError = findCode(error);
  if (fromError) return fromError;
  const jsonStart = message.indexOf("{");
  if (jsonStart < 0) return undefined;
  try {
    return findCode(JSON.parse(message.slice(jsonStart)));
  } catch {
    return undefined;
  }
}

function findCode(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== "object" || depth > 3) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["code", "Code", "errorCode", "ErrorCode"]) {
    const code = record[key];
    if (typeof code === "string" && code.trim()) return code.trim();
    if (typeof code === "number" && Number.isFinite(code)) return String(code);
  }
  for (const key of ["error", "Error", "cause", "response", "data"]) {
    const code = findCode(record[key], depth + 1);
    if (code) return code;
  }
  for (const key of ["status", "statusCode"]) {
    const code = record[key];
    if (typeof code === "string" && code.trim()) return code.trim();
    if (typeof code === "number" && Number.isFinite(code)) return String(code);
  }
  return undefined;
}

function readRetryAfterSeconds(value: unknown, depth = 0): number | undefined {
  if (!value || typeof value !== "object" || depth > 3) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["retryAfterSeconds", "retry_after", "retryAfter"]) {
    const parsed = parseRetryAfter(record[key]);
    if (parsed !== undefined) return parsed;
  }
  const headers = record.headers;
  if (headers && typeof headers === "object") {
    const retryAfter = headers instanceof Headers ? headers.get("retry-after") : (headers as Record<string, unknown>)["retry-after"];
    const parsed = parseRetryAfter(retryAfter);
    if (parsed !== undefined) return parsed;
  }
  for (const key of ["error", "Error", "cause", "response", "data"]) {
    const retryAfterSeconds = readRetryAfterSeconds(record[key], depth + 1);
    if (retryAfterSeconds !== undefined) return retryAfterSeconds;
  }
  return undefined;
}

function parseRetryAfter(value: unknown): number | undefined {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? Math.ceil(numeric) : undefined;
}

function classifyFailure(code: string | undefined): NonNullable<AgentFailure["category"]> {
  if (!code) return "unknown";
  if (/^401|^403/.test(code)) return "auth";
  if (/^429/.test(code)) return "rate_limit";
  if (/^5\d\d/.test(code)) return "gateway";
  if (/^4\d\d/.test(code)) return "request";
  return "unknown";
}
