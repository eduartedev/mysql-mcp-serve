/**
 * Validación de SQL: solo se permiten consultas SELECT.
 * Se rechazan SHOW, DESCRIBE, EXPLAIN y cualquier otro comando.
 */

const DESTRUCTIVE_KEYWORDS = [
  "DROP",
  "TRUNCATE",
  "ALTER",
  "CREATE",
  "REPLACE",
  "GRANT",
  "REVOKE",
  "EXEC",
  "EXECUTE",
  "CALL",
  "LOAD_FILE",
  "INTO OUTFILE",
  "INTO DUMPFILE",
  "SHUTDOWN",
  "KILL",
  "SYSTEM",
  "SOURCE",
  "\\.",
];

const WRITE_KEYWORDS = ["INSERT", "UPDATE", "DELETE"];

function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/g, " ");
}

function getFirstKeyword(sql: string): string {
  const normalized = normalizeSql(sql);
  const match = normalized.match(/^\s*(\w+)/i);
  return match ? match[1].toUpperCase() : "";
}

/** Comprueba si la consulta es únicamente SELECT. */
export function isSelectQuery(sql: string): boolean {
  return getFirstKeyword(sql) === "SELECT";
}

/**
 * Comprueba si la consulta contiene palabras clave destructivas.
 */
export function hasDestructiveKeyword(sql: string): boolean {
  const upper = normalizeSql(sql).toUpperCase();
  return DESTRUCTIVE_KEYWORDS.some((kw) => {
    const re = new RegExp(`\\b${kw}\\b`);
    return re.test(upper);
  });
}

/**
 * Comprueba si la consulta es de escritura (INSERT/UPDATE/DELETE).
 */
export function isWriteQuery(sql: string): boolean {
  const first = getFirstKeyword(sql);
  return WRITE_KEYWORDS.includes(first);
}

export interface ValidationResult {
  allowed: boolean;
  error?: string;
}

/**
 * Valida que la consulta sea únicamente SELECT. Rechaza todo lo demás.
 */
export function validateQuery(sql: string): ValidationResult {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { allowed: false, error: "La consulta SQL no puede estar vacía." };
  }

  if (hasDestructiveKeyword(trimmed)) {
    return {
      allowed: false,
      error:
        "La consulta contiene comandos no permitidos (DROP, TRUNCATE, ALTER, etc.). Solo se permiten consultas SELECT.",
    };
  }

  if (isSelectQuery(trimmed)) {
    return { allowed: true };
  }

  if (isWriteQuery(trimmed)) {
    return {
      allowed: false,
      error: "Solo se permiten consultas SELECT. No se permiten INSERT, UPDATE ni DELETE.",
    };
  }

  return {
    allowed: false,
    error: "Solo se permiten consultas SELECT. No se permiten SHOW, DESCRIBE, EXPLAIN ni otros comandos.",
  };
}
