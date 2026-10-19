import { stripSqlLiteralsAndComments } from "./sql-normalize.js";
import { isWriteQuery, validateQuery, type ValidationResult } from "./sql-validation.js";

export type AccessMode = "readonly" | "readwrite";

/** Solo el valor exacto "readwrite" (tras trim) habilita escrituras; todo lo demás es solo lectura. */
export function resolveAccessMode(raw: string | undefined): AccessMode {
  return raw?.trim() === "readwrite" ? "readwrite" : "readonly";
}

export function gateQuery(sql: string, mode: AccessMode): ValidationResult {
  const validation = validateQuery(sql);
  if (!validation.allowed) return validation;

  const stripped = stripSqlLiteralsAndComments(sql.trim());
  if (!stripped.ok) {
    return { allowed: false, error: stripped.error };
  }
  if (mode === "readonly" && isWriteQuery(stripped.stripped)) {
    return {
      allowed: false,
      error:
        "El servidor está en modo solo lectura. Define MYSQL_ACCESS_MODE=readwrite para permitir INSERT, UPDATE y DELETE.",
    };
  }

  return { allowed: true };
}

export function toolAnnotations(mode: AccessMode): {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
} {
  const readonly = mode === "readonly";
  return {
    readOnlyHint: readonly,
    destructiveHint: !readonly,
    idempotentHint: false,
    openWorldHint: true,
  };
}
