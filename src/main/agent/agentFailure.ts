import type { AgentFailure } from "../../shared/types";

/** Converts provider exceptions into renderer-safe failure metadata at the process boundary. */
export function toAgentFailure(error: unknown): AgentFailure {
  const message = error instanceof Error && error.message ? error.message : String(error);
  const code = readFailureCode(error, message);
  return { ...(code ? { code } : {}), message };
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
