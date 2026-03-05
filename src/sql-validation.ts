/**
 * Validación de SQL: se permiten consultas de solo lectura.
 * Whitelist: SELECT, SHOW, DESCRIBE, DESC, EXPLAIN.
 * Se bloquean variantes sensibles de SHOW y funciones peligrosas dentro de SELECT.
 */

const ALLOWED_FIRST_KEYWORDS = ["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN"];

const DESTRUCTIVE_KEYWORDS = [
  "DROP",
  "TRUNCATE",
  "ALTER",
  "CREATE",
  "REPLACE",
  "RENAME",
  "GRANT",
  "REVOKE",
  "EXEC",
  "EXECUTE",
  "CALL",
  "LOAD DATA",
  "SHUTDOWN",
  "KILL",
  "SYSTEM",
  "SOURCE",
  "PREPARE",
  "SET GLOBAL",
  "FLUSH",
  "RESET",
  "PURGE",
  "\\.",
];

/** Patrones seguros que contienen palabras clave destructivas pero son inofensivos. */
const SAFE_EXCEPTIONS: RegExp[] = [
  /\bSHOW\s+CREATE\b/i,
];

const WRITE_KEYWORDS = ["INSERT", "UPDATE", "DELETE"];

const SENSITIVE_SHOW_PATTERNS: RegExp[] = [
  /\bSHOW\s+GRANTS\b/i,
  /\bSHOW\s+(MASTER|SLAVE|REPLICA)\s+STATUS\b/i,
  /\bSHOW\s+(GLOBAL\s+)?VARIABLES\b/i,
  /\bSHOW\s+(FULL\s+)?PROCESSLIST\b/i,
  /\bSHOW\s+ENGINE\b/i,
  /\bSHOW\s+BINARY\s+LOGS?\b/i,
  /\bSHOW\s+BINLOG\b/i,
];

const DANGEROUS_FUNCTION_PATTERNS: RegExp[] = [
  /\bSLEEP\s*\(/i,
  /\bBENCHMARK\s*\(/i,
  /\bLOAD_FILE\s*\(/i,
  /\bINTO\s+OUTFILE\b/i,
  /\bINTO\s+DUMPFILE\b/i,
];

function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/g, " ");
}

function getFirstKeyword(sql: string): string {
  const normalized = normalizeSql(sql);
  const match = normalized.match(/^\s*(\w+)/i);
  return match ? match[1].toUpperCase() : "";
}

export function isReadOnlyCommand(sql: string): boolean {
  return ALLOWED_FIRST_KEYWORDS.includes(getFirstKeyword(sql));
}

export function isSelectQuery(sql: string): boolean {
  return getFirstKeyword(sql) === "SELECT";
}

export function hasDestructiveKeyword(sql: string): boolean {
  const normalized = normalizeSql(sql);
  const upper = normalized.toUpperCase();

  if (SAFE_EXCEPTIONS.some((re) => re.test(normalized))) {
    return false;
  }

  return DESTRUCTIVE_KEYWORDS.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`);
    return re.test(upper);
  });
}

export function hasSensitiveShow(sql: string): boolean {
  const normalized = normalizeSql(sql);
  return SENSITIVE_SHOW_PATTERNS.some((re) => re.test(normalized));
}

export function hasDangerousFunction(sql: string): boolean {
  const normalized = normalizeSql(sql);
  return DANGEROUS_FUNCTION_PATTERNS.some((re) => re.test(normalized));
}

export function isWriteQuery(sql: string): boolean {
  const first = getFirstKeyword(sql);
  return WRITE_KEYWORDS.includes(first);
}

export interface ValidationResult {
  allowed: boolean;
  error?: string;
}

/**
 * Valida que la consulta sea de solo lectura (SELECT, SHOW, DESCRIBE, EXPLAIN).
 * Bloquea SHOW sensibles, funciones peligrosas y cualquier comando destructivo/de escritura.
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
        "La consulta contiene comandos no permitidos (DROP, TRUNCATE, ALTER, etc.).",
    };
  }

  if (isWriteQuery(trimmed)) {
    return {
      allowed: false,
      error: "No se permiten INSERT, UPDATE ni DELETE. Solo consultas de lectura.",
    };
  }

  if (!isReadOnlyCommand(trimmed)) {
    return {
      allowed: false,
      error:
        "Solo se permiten consultas de lectura: SELECT, SHOW, DESCRIBE y EXPLAIN.",
    };
  }

  if (hasSensitiveShow(trimmed)) {
    return {
      allowed: false,
      error:
        "Variante de SHOW no permitida. No se permite SHOW GRANTS, SHOW VARIABLES, SHOW PROCESSLIST ni similares.",
    };
  }

  if (hasDangerousFunction(trimmed)) {
    return {
      allowed: false,
      error:
        "La consulta contiene funciones no permitidas (SLEEP, BENCHMARK, LOAD_FILE, INTO OUTFILE/DUMPFILE).",
    };
  }

  return { allowed: true };
}
