import { stripSqlLiteralsAndComments } from "./sql-normalize.js";

const READ_ONLY_KEYWORDS = ["SELECT", "WITH", "EXPLAIN"];

const WRITE_KEYWORDS = ["INSERT", "UPDATE", "DELETE"];

const ALLOWED_FIRST_KEYWORDS = [...READ_ONLY_KEYWORDS, ...WRITE_KEYWORDS];

const DESTRUCTIVE_KEYWORDS = [
  "DROP",
  "TRUNCATE",
  "ALTER",
  "CREATE",
  "GRANT",
  "REVOKE",
  "COPY",
  "VACUUM",
  "REINDEX",
  "CLUSTER",
  "LOAD",
  "CHECKPOINT",
  "LISTEN",
  "NOTIFY",
  "DO",
  "CALL",
  "EXECUTE",
  "PREPARE",
  "DISCARD",
  "RESET",
  "REFRESH",
];

const DANGEROUS_FUNCTION_PATTERNS: RegExp[] = [
  /\bpg_sleep\s*\(/i,
  /\bpg_read_file\s*\(/i,
  /\bpg_read_binary_file\s*\(/i,
  /\bpg_ls_dir\s*\(/i,
  /\blo_import\s*\(/i,
  /\blo_export\s*\(/i,
  /\bdblink\s*\(/i,
];

const BLOCKED_SET_PATTERNS: RegExp[] = [
  /\bSET\s+(?:LOCAL\s+|SESSION\s+)?search_path\b/i,
  /\bSET\s+(?:LOCAL\s+|SESSION\s+)?role\b/i,
  /\bSET\s+SESSION\s+AUTHORIZATION\b/i,
];

const ALWAYS_TRUE_WHERE_PATTERNS: RegExp[] = [
  /\bWHERE\s+1\s*=\s*1\b/i,
  /\bWHERE\s+TRUE\b/i,
  /\bWHERE\s+1\b(?!\s*[=<>!])/i,
  /\bWHERE\s+\(?\s*\d+\s*=\s*\d+\b/i,
  /\bOR\s+\(?\s*(\d+)\s*=\s*\1\b/i,
  /\bOR\s+TRUE\b/i,
  /\bOR\s+([A-Za-z_][\w]*)\s*=\s*\1\b/i,
];

function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/g, " ");
}

function getFirstKeyword(sql: string): string {
  const normalized = normalizeSql(sql);
  const match = normalized.match(/^\s*(\w+)/i);
  return match ? match[1].toUpperCase() : "";
}

const MAIN_AFTER_PAREN = /\)\s*(SELECT|INSERT|UPDATE|DELETE|EXPLAIN)\b/gi;

export function getMainStatementKeyword(sql: string): string {
  const first = getFirstKeyword(sql);
  if (first !== "WITH") return first;
  const matches = [...sql.matchAll(MAIN_AFTER_PAREN)];
  const last = matches[matches.length - 1]?.[1];
  if (last !== undefined) return last.toUpperCase();
  const write = sql.match(/\b(INSERT|UPDATE|DELETE)\b/i);
  return write?.[1] !== undefined ? write[1].toUpperCase() : first;
}

export function hasDestructiveKeyword(strippedSql: string): boolean {
  const normalized = normalizeSql(strippedSql);
  const upper = normalized.toUpperCase();
  if (BLOCKED_SET_PATTERNS.some((re) => re.test(normalized))) return true;
  if (/\bEXPLAIN\s+ANALYZE\b/i.test(normalized)) return true;
  return DESTRUCTIVE_KEYWORDS.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(upper);
  });
}

export function hasDangerousFunction(strippedSql: string): boolean {
  const normalized = normalizeSql(strippedSql);
  return DANGEROUS_FUNCTION_PATTERNS.some((re) => re.test(normalized));
}

export function isWriteQuery(sql: string): boolean {
  return WRITE_KEYWORDS.includes(getMainStatementKeyword(sql));
}

export function hasWhereClause(strippedSql: string): boolean {
  if (!requiresWhereClause(strippedSql)) return true;
  return /\bWHERE\b/i.test(normalizeSql(strippedSql));
}

export function hasAlwaysTrueWhere(sql: string, strippedSql: string): boolean {
  const normalized = normalizeSql(strippedSql);
  if (ALWAYS_TRUE_WHERE_PATTERNS.some((re) => re.test(normalized))) return true;
  if (/\bWHERE\s+([a-zA-Z_][\w]*)\s*=\s*\1\b/i.test(normalized)) return true;
  if (/\bWHERE\s+(['"])([^'"]*)\1\s*=\s*\1\2\1/i.test(normalizeSql(sql))) return true;
  return false;
}

export function requiresWhereClause(strippedSql: string): boolean {
  const main = getMainStatementKeyword(strippedSql);
  return main === "UPDATE" || main === "DELETE";
}

export function hasMultipleStatements(sql: string): boolean {
  const strippedResult = stripSqlLiteralsAndComments(sql.trim());
  if (!strippedResult.ok) return false;
  const withoutTrailing = strippedResult.stripped.replace(/;\s*$/, "");
  return withoutTrailing.includes(";");
}

export interface ValidationResult {
  allowed: boolean;
  error?: string;
}

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

  const strippedResult = stripSqlLiteralsAndComments(trimmed);
  if (!strippedResult.ok) {
    return { allowed: false, error: strippedResult.error };
  }
  const stripped = strippedResult.stripped;
  const policy = strippedResult.policy;

  if (hasDestructiveKeyword(policy)) {
    return {
      allowed: false,
      error:
        "La consulta contiene comandos no permitidos (DROP, COPY, VACUUM, SET search_path, etc.).",
    };
  }

  const first = getFirstKeyword(policy);
  if (!ALLOWED_FIRST_KEYWORDS.includes(first)) {
    return {
      allowed: false,
      error:
        "Comando no permitido. Se aceptan: SELECT, WITH, EXPLAIN, INSERT, UPDATE y DELETE.",
    };
  }

  if (hasDangerousFunction(policy)) {
    return {
      allowed: false,
      error:
        "La consulta contiene funciones no permitidas (pg_sleep, pg_read_file, COPY, dblink, etc.).",
    };
  }

  if (requiresWhereClause(policy)) {
    if (!hasWhereClause(stripped)) {
      return {
        allowed: false,
        error:
          "UPDATE y DELETE requieren una cláusula WHERE para evitar modificar todas las filas.",
      };
    }
    if (hasAlwaysTrueWhere(trimmed, stripped)) {
      return {
        allowed: false,
        error:
          "La cláusula WHERE parece siempre verdadera (ej. WHERE 1=1). Usa una condición real.",
      };
    }
  }

  return { allowed: true };
}
