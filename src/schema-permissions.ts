import type { AccessMode } from "./access-mode.js";
import { isWriteQuery } from "./sql-validation.js";

export type SchemaPolicy = "inherit" | "ro" | "rw";

export type Allowlist =
  | { kind: "unset" }
  | { kind: "invalid" }
  | { kind: "list"; entries: ReadonlyMap<string, SchemaPolicy> };

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
  "MYSQL_ALLOWED_DATABASES no es válida. Usa nombre, nombre:ro o nombre:rw, separados por comas.";
const ERR_MISSING_NAME =
  "Indica el argumento database o MYSQL_DATABASE, incluido en MYSQL_ALLOWED_DATABASES.";
const ERR_INVALID_NAME =
  "Nombre de base no válido. Solo se permiten letras, números y guion bajo.";
const ERR_NOT_ALLOWED_UNSET =
  "La base no está permitida. Añádela a MYSQL_ALLOWED_DATABASES.";
const ERR_NOT_ALLOWED_LIST = "La base no está permitida por MYSQL_ALLOWED_DATABASES.";
const ERR_PROCESS_READONLY =
  "El servidor está en modo solo lectura. Define MYSQL_ACCESS_MODE=readwrite para permitir INSERT, UPDATE y DELETE.";
const ERR_SCHEMA_READONLY =
  "La base está marcada como solo lectura (:ro). MYSQL_ACCESS_MODE=readwrite no habilita escritura en ella.";

const INVALID: Allowlist = { kind: "invalid" };

export function parseAllowlist(raw: string | undefined): Allowlist {
  if (raw === undefined || raw.trim() === "") return { kind: "unset" };

  const entries = new Map<string, SchemaPolicy>();
  for (const rawToken of raw.split(",")) {
    const token = rawToken.trim();
    if (token === "") return INVALID;

    const colon = token.indexOf(":");
    const name = colon === -1 ? token : token.slice(0, colon);
    const suffix = colon === -1 ? undefined : token.slice(colon + 1);

    if (!NAME_PATTERN.test(name)) return INVALID;
    if (entries.has(name)) return INVALID;

    let policy: SchemaPolicy;
    if (suffix === undefined) policy = "inherit";
    else if (suffix === "ro") policy = "ro";
    else if (suffix === "rw") policy = "rw";
    else return INVALID;

    entries.set(name, policy);
  }

  return { kind: "list", entries };
}

function resolvePolicy(
  name: string,
  requested: string | undefined,
  configured: string | undefined,
  allowlist: Exclude<Allowlist, { kind: "invalid" }>,
): { policy: SchemaPolicy } | { error: string } {
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
    if (allowlist.kind === "unset") return { ok: true, useDatabase: undefined };
    return { ok: false, error: ERR_MISSING_NAME };
  }

  if (!NAME_PATTERN.test(effective)) return { ok: false, error: ERR_INVALID_NAME };

  const resolved = resolvePolicy(effective, requested, configured, allowlist);
  if ("error" in resolved) return { ok: false, error: resolved.error };

  if (isWriteQuery(sql)) {
    if (mode === "readonly") return { ok: false, error: ERR_PROCESS_READONLY };
    if (resolved.policy === "ro") return { ok: false, error: ERR_SCHEMA_READONLY };
  }

  return { ok: true, useDatabase };
}
