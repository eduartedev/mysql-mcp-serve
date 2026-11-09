import type { AccessMode } from "../shared/access-mode.js";
import type { Allowlist } from "../shared/allowlist.js";
import { parseAllowlist } from "../shared/allowlist.js";
import { assertSqlSchemasAllowed } from "./sql-schema-refs.js";
import { stripSqlLiteralsAndComments } from "./sql-normalize.js";
import { getMainStatementKeyword, isWriteQuery } from "./sql-validation.js";

export type { Allowlist, SchemaPolicy } from "../shared/allowlist.js";
export { parseAllowlist };

export type AuthorizeResult =
  | { ok: false; error: string }
  | { ok: true; useDatabase: string | undefined };

export interface AuthorizeInput {
  requested: string | undefined;
  configured: string | undefined;
  allowlist: Allowlist;
  sql: string;
  mode: AccessMode;
}

const NAME_PATTERN = /^[A-Za-z0-9_]+$/;

const ERR_INVALID_ALLOWLIST =
  "DB_ALLOWED_DATABASES no es válida. Usa nombre, nombre:ro o nombre:rw, separados por comas.";
const ERR_MISSING_NAME =
  "Indica el argumento database o DB_DATABASE (o MYSQL_DATABASE), incluido en DB_ALLOWED_DATABASES.";
const ERR_INVALID_NAME =
  "Nombre de base no válido. Solo se permiten letras, números y guion bajo.";
const ERR_NOT_ALLOWED_UNSET =
  "La base no está permitida. Añádela a DB_ALLOWED_DATABASES.";
const ERR_NOT_ALLOWED_LIST = "La base no está permitida por DB_ALLOWED_DATABASES.";
const ERR_PROCESS_READONLY =
  "El servidor está en modo solo lectura. Define DB_ACCESS_MODE=readwrite para permitir INSERT, UPDATE y DELETE.";
const ERR_SCHEMA_READONLY =
  "La base está marcada como solo lectura (:ro). DB_ACCESS_MODE=readwrite no habilita escritura en ella.";

function resolvePolicy(
  name: string,
  requested: string | undefined,
  configured: string | undefined,
  allowlist: Exclude<Allowlist, { kind: "invalid" }>,
): { policy: import("../shared/allowlist.js").SchemaPolicy } | { error: string } {
  if (allowlist.kind === "unset") {
    if (requested !== undefined && requested !== "" && requested !== configured) {
      return { error: ERR_NOT_ALLOWED_UNSET };
    }
    return { policy: "inherit" };
  }

  const policy = allowlist.entries.get(name);
  if (policy === undefined) return { error: ERR_NOT_ALLOWED_LIST };
  return { policy };
}

export function authorizeDatabase(input: AuthorizeInput): AuthorizeResult {
  const { requested, configured, allowlist, sql, mode } = input;

  if (allowlist.kind === "invalid") return { ok: false, error: ERR_INVALID_ALLOWLIST };

  const hasRequested = typeof requested === "string" && requested !== "";
  const effective = hasRequested ? requested : configured;
  const useDatabase = hasRequested ? requested : undefined;

  if (effective === undefined || effective === "") {
    if (allowlist.kind !== "unset") return { ok: false, error: ERR_MISSING_NAME };
  } else if (!NAME_PATTERN.test(effective)) {
    return { ok: false, error: ERR_INVALID_NAME };
  }

  let resolved: { policy: import("../shared/allowlist.js").SchemaPolicy } | undefined;
  if (effective !== undefined && effective !== "") {
    const policy = resolvePolicy(effective, requested, configured, allowlist);
    if ("error" in policy) return { ok: false, error: policy.error };
    resolved = policy;
  }

  const strippedResult = stripSqlLiteralsAndComments(sql);
  if (!strippedResult.ok) {
    return { ok: false, error: strippedResult.error };
  }
  const writing = isWriteQuery(strippedResult.policy);
  const schemaCheck = assertSqlSchemasAllowed(
    strippedResult.stripped,
    allowlist,
    effective,
    writing,
    getMainStatementKeyword(strippedResult.policy) === "DELETE",
    sql,
  );
  if (!schemaCheck.ok) return { ok: false, error: schemaCheck.error };

  if (writing) {
    if (mode === "readonly") return { ok: false, error: ERR_PROCESS_READONLY };
    if (resolved?.policy === "ro") return { ok: false, error: ERR_SCHEMA_READONLY };
  }

  return { ok: true, useDatabase };
}
