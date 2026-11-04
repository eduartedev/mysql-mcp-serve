import type { AccessMode } from "../shared/access-mode.js";
import { stripSqlLiteralsAndComments } from "./sql-normalize.js";
import { isWriteQuery, validateQuery, type ValidationResult } from "./sql-validation.js";

export function gateQuery(sql: string, mode: AccessMode): ValidationResult {
  const validation = validateQuery(sql);
  if (!validation.allowed) return validation;

  const stripped = stripSqlLiteralsAndComments(sql.trim());
  if (!stripped.ok) {
    return { allowed: false, error: stripped.error };
  }
  if (mode === "readonly" && isWriteQuery(stripped.policy)) {
    return {
      allowed: false,
      error:
        "El servidor está en modo solo lectura. Define DB_ACCESS_MODE=readwrite (o MYSQL_ACCESS_MODE=readwrite) para permitir INSERT, UPDATE y DELETE.",
    };
  }

  return { allowed: true };
}
