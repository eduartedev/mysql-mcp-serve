import type { Allowlist } from "./schema-permissions.js";

const SYSTEM_SCHEMAS = new Set([
  "mysql",
  "information_schema",
  "performance_schema",
  "sys",
]);

const QUALIFIED_REF =
  /\b(FROM|JOIN|INTO|UPDATE|DESCRIBE|DESC)\s+([A-Za-z0-9_]+)\s*\.\s*[A-Za-z0-9_]+/gi;

const QUOTED_REF =
  /\b(FROM|JOIN|INTO|UPDATE|DESCRIBE|DESC)\s+"([A-Za-z0-9_]+)"\s*\.\s*"[A-Za-z0-9_]+"/gi;

const SHOW_CREATE_QUALIFIED =
  /\bSHOW\s+CREATE\s+(?:TABLE|VIEW|TRIGGER|FUNCTION|PROCEDURE)\s+([A-Za-z0-9_]+)\s*\.\s*[A-Za-z0-9_]+/gi;

const SHOW_SCHEMA_FROM =
  /\bSHOW\s+(?:OPEN\s+TABLES|TABLE\s+STATUS|TABLES)\s+(?:FROM|IN)\s+([A-Za-z0-9_]+)/gi;

const SHOW_SECOND_FROM =
  /\bSHOW\s+(?:COLUMNS|FIELDS|INDEX|INDEXES|KEYS)\s+FROM\s+[A-Za-z0-9_]+\s+(?:FROM|IN)\s+([A-Za-z0-9_]+)/gi;

const MAINT_QUALIFIED =
  /\b(?:ANALYZE|CHECK|CHECKSUM)\s+TABLE\s+([A-Za-z0-9_]+)\s*\.\s*[A-Za-z0-9_]+/gi;

const MAINT_QUOTED =
  /\b(?:ANALYZE|CHECK|CHECKSUM)\s+TABLE\s+"([A-Za-z0-9_]+)"\s*\.\s*"[A-Za-z0-9_]+"/gi;

const ERR_SCHEMA_IN_SQL =
  "La consulta referencia una base no permitida por MYSQL_ALLOWED_DATABASES.";
const ERR_SYSTEM_SCHEMA =
  "La consulta referencia una base del sistema (mysql, information_schema, etc.).";
const ERR_SCHEMA_NOT_CONFIGURED =
  "La consulta referencia otra base distinta de MYSQL_DATABASE.";
const ERR_SCHEMA_READONLY =
  "La base está marcada como solo lectura (:ro). MYSQL_ACCESS_MODE=readwrite no habilita escritura en ella.";

function remember(refs: Map<string, boolean>, schema: string, write: boolean): void {
  const key = schema.toLowerCase();
  refs.set(key, (refs.get(key) ?? false) || write);
}

function isWriteKeyword(keyword: string, deleting: boolean): boolean {
  const word = keyword.toUpperCase();
  return word === "UPDATE" || word === "INTO" || (word === "FROM" && deleting);
}

function scanKeywordRefs(sql: string, refs: Map<string, boolean>, deleting: boolean): void {
  for (const re of [QUALIFIED_REF, QUOTED_REF]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(sql)) !== null) {
      remember(refs, match[2] ?? "", isWriteKeyword(match[1] ?? "", deleting));
    }
  }
}

const TABLE_START = new Set([
  "FROM",
  "JOIN",
  "INTO",
  "UPDATE",
  "DESCRIBE",
  "DESC",
  "STRAIGHT_JOIN",
]);
const TABLE_STOP = new Set([
  "WHERE",
  "SET",
  "GROUP",
  "ORDER",
  "LIMIT",
  "HAVING",
  "WINDOW",
  "ON",
  "USING",
  "VALUES",
]);
const WRITE_TABLE = new Set(["UPDATE", "INTO"]);

type SqlToken =
  | { kind: "word"; value: string }
  | { kind: "dot" }
  | { kind: "lparen" }
  | { kind: "rparen" };

function tokenize(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === undefined || /\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === ".") {
      tokens.push({ kind: "dot" });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    const word = /^[A-Za-z_][\w]*/.exec(sql.slice(i));
    if (word?.[0] !== undefined) {
      tokens.push({ kind: "word", value: word[0] });
      i += word[0].length;
      continue;
    }
    const digits = /^\d+/.exec(sql.slice(i));
    i += digits?.[0]?.length ?? 1;
  }
  return tokens;
}

function scanTableQualifiers(sql: string, refs: Map<string, boolean>, deleting: boolean): void {
  const tokens = tokenize(sql);
  const openers: Array<{ depth: number; word: string }> = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) continue;
    if (token.kind === "lparen") {
      depth++;
      continue;
    }
    if (token.kind === "rparen") {
      depth--;
      while (openers.length > 0 && (openers[openers.length - 1]?.depth ?? 0) > depth) openers.pop();
      continue;
    }
    if (token.kind !== "word") continue;
    const word = token.value.toUpperCase();
    const top = openers[openers.length - 1];
    if (TABLE_STOP.has(word) && top?.depth === depth) {
      openers.pop();
      continue;
    }
    if (TABLE_START.has(word)) {
      if (top?.depth === depth) top.word = word;
      else openers.push({ depth, word });
      continue;
    }
    const dot = tokens[i + 1];
    const objectName = tokens[i + 2];
    if (top?.depth !== depth || dot?.kind !== "dot" || objectName?.kind !== "word") continue;
    const write = WRITE_TABLE.has(top.word) || (top.word === "FROM" && deleting);
    remember(refs, token.value, write);
    i += 2;
  }
}

function maskQuoted(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch !== "'" && ch !== '"') {
      out += ch ?? "";
      i++;
      continue;
    }
    const quote = ch;
    out += " ";
    i++;
    while (i < sql.length) {
      if (sql[i] === "\\" && i + 1 < sql.length) {
        out += "  ";
        i += 2;
        continue;
      }
      if (sql[i] === quote) {
        if (quote === "'" && sql[i + 1] === "'") {
          out += "  ";
          i += 2;
          continue;
        }
        i++;
        break;
      }
      out += " ";
      i++;
    }
  }
  return out;
}

function scanDottedSchemas(sql: string, refs: Map<string, boolean>): void {
  const visible = maskQuoted(sql);
  const system = /\b(mysql|information_schema|performance_schema|sys)\s*\.\s*[A-Za-z_]/gi;
  for (const match of visible.matchAll(system)) remember(refs, match[1] ?? "", false);
  const threePart = /\b([A-Za-z_][\w]*)\s*\.\s*[A-Za-z_][\w]*\s*\.\s*[A-Za-z_][\w]*/gi;
  for (const match of visible.matchAll(threePart)) remember(refs, match[1] ?? "", false);
}

function scanReadRefs(sql: string, refs: Map<string, boolean>): void {
  for (const re of [SHOW_CREATE_QUALIFIED, SHOW_SCHEMA_FROM, SHOW_SECOND_FROM, MAINT_QUALIFIED, MAINT_QUOTED]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(sql)) !== null) {
      remember(refs, match[1] ?? "", false);
    }
  }
}

export function assertSqlSchemasAllowed(
  strippedSql: string,
  allowlist: Allowlist,
  configured: string | undefined,
  writing = false,
  deleting = false,
  rawSql = "",
): { ok: true } | { ok: false; error: string } {
  const refs = new Map<string, boolean>();
  scanKeywordRefs(strippedSql, refs, deleting);
  scanTableQualifiers(strippedSql, refs, deleting);
  scanDottedSchemas(strippedSql, refs);
  scanReadRefs(strippedSql, refs);
  if (rawSql !== "" && rawSql !== strippedSql) {
    scanKeywordRefs(rawSql, refs, deleting);
    scanReadRefs(rawSql, refs);
  }

  if (/\bSHOW\s+DATABASES\b/i.test(strippedSql)) {
    refs.set("__show_databases__", false);
  }

  for (const [schema, writeTarget] of refs) {
    if (schema === "__show_databases__") {
      if (allowlist.kind === "list") return { ok: false, error: ERR_SCHEMA_IN_SQL };
      continue;
    }
    if (SYSTEM_SCHEMAS.has(schema)) {
      return { ok: false, error: ERR_SYSTEM_SCHEMA };
    }
    if (allowlist.kind === "list") {
      let policy: "inherit" | "ro" | "rw" | undefined;
      for (const [key, value] of allowlist.entries) {
        if (key.toLowerCase() === schema) {
          policy = value;
          break;
        }
      }
      if (policy === undefined) return { ok: false, error: ERR_SCHEMA_IN_SQL };
      if (writing && writeTarget && policy === "ro") return { ok: false, error: ERR_SCHEMA_READONLY };
    } else if (configured !== undefined && configured !== "") {
      if (schema !== configured.toLowerCase()) {
        return { ok: false, error: ERR_SCHEMA_NOT_CONFIGURED };
      }
    }
  }

  return { ok: true };
}
