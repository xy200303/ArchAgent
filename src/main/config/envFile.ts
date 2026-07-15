/** Serializes application settings into a deterministic dotenv representation. */
export interface EnvFileEntry {
  key: string;
  value: string | number | boolean | undefined;
}

const BARE_VALUE_PATTERN = /^[A-Za-z0-9_./:@%+=,-]*$/;

export function serializeEnvFile(entries: EnvFileEntry[]): string {
  return `${entries.map(({ key, value }) => `${key}=${formatEnvValue(value)}`).join("\n")}\n`;
}

export function formatEnvValue(value: string | number | boolean | undefined): string {
  if (value === undefined) return "";
  const text = String(value);
  if (BARE_VALUE_PATTERN.test(text)) return text;
  return `"${text.replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;
}
