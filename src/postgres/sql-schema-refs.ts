import type { Allowlist } from "../shared/allowlist.js";

const SYSTEM_SCHEMAS = new Set(["pg_catalog", "information_schema", "pg_toast"]);

const QUALIFIED_REF =
  /\b(FROM|JOIN|INTO|UPDATE)\s+([A-Za-z0-9_]+)\s*\.\s*[A-Za-z0-9_]+/gi;

const QUOTED_REF =
  /\b(FROM|JOIN|INTO|UPDATE)\s+"([A-Za-z0-9_]+)"\s*\.\s*"[A-Za-z0-9_]+"/gi;

const ERR_SCHEMA_IN_SQL =
  "La consulta referencia un schema no permitido por DB_ALLOWED_DATABASES.";
const ERR_SYSTEM_SCHEMA =
  "La consulta referencia un schema del sistema (pg_catalog, information_schema, etc.).";
const ERR_SCHEMA_NOT_CONFIGURED =
  "La consulta referencia otro schema distinto del configurado en DB_DATABASE / argumento schema.";
const ERR_SCHEMA_READONLY =
  "El schema está marcado como solo lectura (:ro). DB_ACCESS_MODE=readwrite no habilita escritura en él.";

function remember(refs: Map<string, boolean>, schema: string, write: boolean): void {
  const key = schema.toLowerCase();
  refs.set(key, (refs.get(key) ?? false) || write);
}

function scanKeywordRefs(sql: string, refs: Map<string, boolean>, deleting: boolean): void {
  for (const re of [QUALIFIED_REF, QUOTED_REF]) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(sql)) !== null) {
      const kw = (match[1] ?? "").toUpperCase();
      const write = kw === "UPDATE" || kw === "INTO" || (kw === "FROM" && deleting);
      remember(refs, match[2] ?? "", write);
    }
  }
}

export function assertSqlSchemasAllowed(
  strippedSql: string,
  allowlist: Allowlist,
  configured: string | undefined,
  writing = false,
  deleting = false,
): { ok: true } | { ok: false; error: string } {
  const refs = new Map<string, boolean>();
  scanKeywordRefs(strippedSql, refs, deleting);

  for (const [schema, writeTarget] of refs) {
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
