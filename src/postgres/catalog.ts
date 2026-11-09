import { z } from "zod";
import type { AccessMode } from "../shared/access-mode.js";
import { DEFAULT_PAGE_LIMIT, MAX_OFFSET, MAX_PAGE_LIMIT } from "../shared/constants.js";
import { authorizeSchema, type Allowlist } from "./schema-permissions.js";

export type CatalogKind = "view" | "trigger" | "function" | "procedure";

const OBJECT_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

const ERR_INVALID_OBJECT_NAME =
  "Nombre de objeto no válido. Solo se permiten letras, números y guion bajo.";
const ERR_MISSING_SCHEMA =
  "Indica el argumento schema o DB_DATABASE, incluido en DB_ALLOWED_DATABASES.";

export const CatalogSchema = z
  .object({
    kind: z.enum(["view", "trigger", "function", "procedure"]),
    name: z
      .string()
      .regex(OBJECT_NAME_PATTERN, ERR_INVALID_OBJECT_NAME)
      .optional(),
    schema: z.string().optional(),
    limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
    offset: z.number().int().min(0).max(MAX_OFFSET).default(0),
    response_format: z.enum(["markdown", "json"]).default("markdown"),
  })
  .strict();

const VIEW_LIST = `
SELECT c.relname AS object_name, pg_get_viewdef(c.oid, true) AS definition
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v' AND n.nspname = $1`;

const VIEW_ONE = `${VIEW_LIST} AND c.relname = $2`;

const TRIGGER_LIST = `
SELECT t.tgname AS object_name, pg_get_triggerdef(t.oid, true) AS definition
FROM pg_catalog.pg_trigger t
JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname = $1`;

const TRIGGER_ONE = `${TRIGGER_LIST} AND t.tgname = $2`;

const FUNCTION_LIST = `
SELECT p.proname AS object_name, pg_get_functiondef(p.oid) AS definition
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = $1 AND p.prokind = 'f'`;

const FUNCTION_ONE = `${FUNCTION_LIST} AND p.proname = $2`;

const PROCEDURE_LIST = `
SELECT p.proname AS object_name, pg_get_functiondef(p.oid) AS definition
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = $1 AND p.prokind = 'p'`;

const PROCEDURE_ONE = `${PROCEDURE_LIST} AND p.proname = $2`;

const SQL_BY_KIND: Record<CatalogKind, { list: string; one: string }> = {
  view: { list: VIEW_LIST, one: VIEW_ONE },
  trigger: { list: TRIGGER_LIST, one: TRIGGER_ONE },
  function: { list: FUNCTION_LIST, one: FUNCTION_ONE },
  procedure: { list: PROCEDURE_LIST, one: PROCEDURE_ONE },
};

export interface PrepareCatalogInput {
  kind: CatalogKind;
  name: string | undefined;
  schema: string | undefined;
  configuredSchema: string | undefined;
  allowlist: Allowlist;
  mode: AccessMode;
}

export type PrepareCatalogResult =
  | { ok: true; sql: string; params: string[]; useSchema?: string }
  | { ok: false; error: string };

export function prepareCatalog(input: PrepareCatalogInput): PrepareCatalogResult {
  const { kind, name, schema, configuredSchema, allowlist, mode } = input;

  const authorization = authorizeSchema({
    requested: schema,
    configured: configuredSchema,
    allowlist,
    sql: "SELECT 1",
    mode,
  });
  if (!authorization.ok) return { ok: false, error: authorization.error };

  const effectiveSchema =
    typeof schema === "string" && schema !== "" ? schema : configuredSchema;
  if (effectiveSchema === undefined || effectiveSchema === "") {
    return { ok: false, error: ERR_MISSING_SCHEMA };
  }

  const hasName = typeof name === "string" && name !== "";
  if (hasName && !OBJECT_NAME_PATTERN.test(name)) {
    return { ok: false, error: ERR_INVALID_OBJECT_NAME };
  }

  const queries = SQL_BY_KIND[kind];
  return hasName
    ? {
        ok: true,
        sql: queries.one,
        params: [effectiveSchema, name],
        useSchema: authorization.useSchema,
      }
    : {
        ok: true,
        sql: queries.list,
        params: [effectiveSchema],
        useSchema: authorization.useSchema,
      };
}
