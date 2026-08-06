/**
 * Validación de SQL (Nivel B):
 * - Lectura: SELECT, WITH, SHOW, DESCRIBE, DESC, EXPLAIN, ANALYZE, CHECK, CHECKSUM
 * - Escritura controlada: INSERT libre; UPDATE/DELETE solo con cláusula WHERE
 * - Se bloquean DDL/DCL destructivos, SHOW sensibles y funciones peligrosas
 */

const READ_ONLY_KEYWORDS = [
  "SELECT",
  "SHOW",
  "DESCRIBE",
  "DESC",
  "EXPLAIN",
  "WITH",
  "ANALYZE",
  "CHECK",
  "CHECKSUM",
];

const WRITE_KEYWORDS = ["INSERT", "UPDATE", "DELETE"];

const ALLOWED_FIRST_KEYWORDS = [...READ_ONLY_KEYWORDS, ...WRITE_KEYWORDS];

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
const SAFE_EXCEPTIONS: RegExp[] = [/\bSHOW\s+CREATE\b/i];

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

/** WHERE que afectan todas las filas de forma obvia. */
const ALWAYS_TRUE_WHERE_PATTERNS: RegExp[] = [
  /\bWHERE\s+1\s*=\s*1\b/i,
  /\bWHERE\s+TRUE\b/i,
  /\bWHERE\s+1\b(?!\s*[=<>!])/i,
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
  return READ_ONLY_KEYWORDS.includes(getFirstKeyword(sql));
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
  if (WRITE_KEYWORDS.includes(first)) return true;
  // WITH ... INSERT/UPDATE/DELETE
  if (first === "WITH") {
    return /\b(INSERT|UPDATE|DELETE)\b/i.test(sql);
  }
  return false;
}

export function hasWhereClause(sql: string): boolean {
  return /\bWHERE\b/i.test(normalizeSql(sql));
}

export function hasAlwaysTrueWhere(sql: string): boolean {
  const normalized = normalizeSql(sql);
  if (ALWAYS_TRUE_WHERE_PATTERNS.some((re) => re.test(normalized))) {
    return true;
  }
  // WHERE 'x'='x' o WHERE "x"="x"
  if (/\bWHERE\s+(['"])([^'"]*)\1\s*=\s*\1\2\1/i.test(normalized)) {
    return true;
  }
  return false;
}

/** UPDATE/DELETE (o WITH que los contiene) requieren WHERE. */
export function requiresWhereClause(sql: string): boolean {
  const first = getFirstKeyword(sql);
  if (first === "UPDATE" || first === "DELETE") return true;
  if (first === "WITH") {
    return /\b(UPDATE|DELETE)\b/i.test(sql);
  }
  return false;
}

export function hasMultipleStatements(sql: string): boolean {
  const withoutTrailing = sql.trim().replace(/;\s*$/, "");
  return withoutTrailing.includes(";");
}

export interface ValidationResult {
  allowed: boolean;
  error?: string;
}

/**
 * Valida consultas de lectura ampliada y escritura controlada (Nivel B).
 */
export function validateQuery(sql: string): ValidationResult {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { allowed: false, error: "La consulta SQL no puede estar vacía." };
  }

  if (hasMultipleStatements(trimmed)) {
    return {
      allowed: false,
      error: "No se permiten múltiples sentencias en una sola consulta.",
    };
  }

  if (hasDestructiveKeyword(trimmed)) {
    return {
      allowed: false,
      error:
        "La consulta contiene comandos no permitidos (DROP, TRUNCATE, ALTER, etc.).",
    };
  }

  const first = getFirstKeyword(trimmed);
  if (!ALLOWED_FIRST_KEYWORDS.includes(first)) {
    return {
      allowed: false,
      error:
        "Comando no permitido. Se aceptan: SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, ANALYZE, CHECK, CHECKSUM, INSERT, UPDATE y DELETE.",
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

  if (requiresWhereClause(trimmed)) {
    if (!hasWhereClause(trimmed)) {
      return {
        allowed: false,
        error:
          "UPDATE y DELETE requieren una cláusula WHERE para evitar modificar todas las filas.",
      };
    }
    if (hasAlwaysTrueWhere(trimmed)) {
      return {
        allowed: false,
        error:
          "La cláusula WHERE parece siempre verdadera (ej. WHERE 1=1). Usa una condición real.",
      };
    }
  }

  return { allowed: true };
}
