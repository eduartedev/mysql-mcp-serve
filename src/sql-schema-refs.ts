import type { Allowlist } from "./schema-permissions.js";

const SYSTEM_SCHEMAS = new Set([
  "mysql",
  "information_schema",
  "performance_schema",
  "sys",
]);

const QUALIFIED_REF =
  /\b(?:FROM|JOIN|INTO|UPDATE)\s+`?([A-Za-z0-9_]+)`?\.`?[A-Za-z0-9_]+`?/gi;

const SHOW_FROM = /\bSHOW\s+(?:\w+\s+)*FROM\s+`?([A-Za-z0-9_]+)`?/gi;

const ERR_SCHEMA_IN_SQL =
  "La consulta referencia una base no permitida por MYSQL_ALLOWED_DATABASES.";
const ERR_SYSTEM_SCHEMA =
  "La consulta referencia una base del sistema (mysql, information_schema, etc.).";
const ERR_SCHEMA_NOT_CONFIGURED =
  "La consulta referencia otra base distinta de MYSQL_DATABASE.";

export function assertSqlSchemasAllowed(
  strippedSql: string,
  allowlist: Allowlist,
  configured: string | undefined,
): { ok: true } | { ok: false; error: string } {
  const refs = new Set<string>();
  for (const re of [QUALIFIED_REF, SHOW_FROM]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(strippedSql)) !== null) {
      refs.add(match[1].toLowerCase());
    }
  }
  if (/\bSHOW\s+DATABASES\b/i.test(strippedSql)) {
    refs.add("__show_databases__");
  }

  for (const schema of refs) {
    if (schema === "__show_databases__") {
      if (allowlist.kind === "list") return { ok: false, error: ERR_SCHEMA_IN_SQL };
      continue;
    }
    if (SYSTEM_SCHEMAS.has(schema)) {
      return { ok: false, error: ERR_SYSTEM_SCHEMA };
    }
    if (allowlist.kind === "list") {
      let allowed = false;
      for (const key of allowlist.entries.keys()) {
        if (key.toLowerCase() === schema) {
          allowed = true;
          break;
        }
      }
      if (!allowed) return { ok: false, error: ERR_SCHEMA_IN_SQL };
    } else if (configured !== undefined && configured !== "") {
      if (schema !== configured.toLowerCase()) {
        return { ok: false, error: ERR_SCHEMA_NOT_CONFIGURED };
      }
    }
  }

  return { ok: true };
}
