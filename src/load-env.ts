import { readFileSync } from "node:fs";

const KEY = /^MYSQL_[A-Z0-9_]+$/;

/** Aplica claves MYSQL_* que el entorno aún no trae. No pisa un valor ya definido. */
export function applyMysqlEnv(text: string, env: NodeJS.ProcessEnv): void {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!KEY.test(key)) continue;
    if (env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
}

export function loadMysqlEnvFile(
  path = ".env",
  env: NodeJS.ProcessEnv = process.env,
  read: (file: string) => string = (file) => readFileSync(file, "utf8"),
): void {
  let text: string;
  try {
    text = read(path);
  } catch {
    return;
  }
  applyMysqlEnv(text, env);
}
