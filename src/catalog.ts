import { z } from "zod";
import type { AccessMode } from "./access-mode.js";
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from "./constants.js";
import { authorizeDatabase, type Allowlist } from "./schema-permissions.js";

export type CatalogKind = "view" | "trigger" | "function" | "procedure";

const OBJECT_NAME_PATTERN = /^[A-Za-z0-9_]+$/;

const ERR_INVALID_OBJECT_NAME =
  "Nombre de objeto no válido. Solo se permiten letras, números y guion bajo.";
const ERR_MISSING_SCHEMA =
  "Indica el argumento database o MYSQL_DATABASE, incluido en MYSQL_ALLOWED_DATABASES.";

export const CatalogSchema = z
  .object({
    kind: z
      .enum(["view", "trigger", "function", "procedure"])
      .describe("Tipo de objeto: view, trigger, function o procedure."),
    name: z
      .string()
      .regex(OBJECT_NAME_PATTERN, ERR_INVALID_OBJECT_NAME)
      .optional()
      .describe("Nombre del objeto. Si se omite, lista todos los objetos de ese tipo."),
    database: z
      .string()
      .optional()
      .describe("Base a consultar. Opcional si MYSQL_DATABASE ya está definida."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_LIMIT)
      .default(DEFAULT_PAGE_LIMIT)
      .describe("Filas de esta página. Entre 1 y 100. Por defecto 20."),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("Filas a saltar antes de esta página. Por defecto 0."),
    response_format: z
      .enum(["markdown", "json"])
      .default("markdown")
      .describe("markdown para lectura humana, json para datos estructurados."),
  })
  .strict();

export type CatalogInput = z.infer<typeof CatalogSchema>;

const VIEW_LIST =
  "SELECT TABLE_NAME, VIEW_DEFINITION, CHECK_OPTION, IS_UPDATABLE, DEFINER, SECURITY_TYPE FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?";
const VIEW_ONE = `${VIEW_LIST} AND TABLE_NAME = ?`;

const TRIGGER_LIST =
  "SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_TIMING, ACTION_STATEMENT, DEFINER FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?";
const TRIGGER_ONE = `${TRIGGER_LIST} AND TRIGGER_NAME = ?`;

const FUNCTION_LIST =
  "SELECT ROUTINE_NAME, ROUTINE_TYPE, DATA_TYPE, ROUTINE_DEFINITION, IS_DETERMINISTIC, SQL_DATA_ACCESS, SECURITY_TYPE, DEFINER FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'FUNCTION'";
const FUNCTION_ONE = `${FUNCTION_LIST} AND ROUTINE_NAME = ?`;

const PROCEDURE_LIST =
  "SELECT ROUTINE_NAME, ROUTINE_TYPE, DATA_TYPE, ROUTINE_DEFINITION, IS_DETERMINISTIC, SQL_DATA_ACCESS, SECURITY_TYPE, DEFINER FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = 'PROCEDURE'";
const PROCEDURE_ONE = `${PROCEDURE_LIST} AND ROUTINE_NAME = ?`;

const SQL_BY_KIND: Record<CatalogKind, { list: string; one: string }> = {
  view: { list: VIEW_LIST, one: VIEW_ONE },
  trigger: { list: TRIGGER_LIST, one: TRIGGER_ONE },
  function: { list: FUNCTION_LIST, one: FUNCTION_ONE },
  procedure: { list: PROCEDURE_LIST, one: PROCEDURE_ONE },
};

export interface PrepareCatalogInput {
  kind: CatalogKind;
  name: string | undefined;
  database: string | undefined;
  configured: string | undefined;
  allowlist: Allowlist;
  mode: AccessMode;
}

export type PrepareCatalogResult =
  | { ok: true; sql: string; params: string[] }
  | { ok: false; error: string };

export function prepareCatalog(input: PrepareCatalogInput): PrepareCatalogResult {
  const { kind, name, database, configured, allowlist, mode } = input;

  const authorization = authorizeDatabase({
    requested: database,
    configured,
    allowlist,
    sql: "SELECT 1",
    mode,
  });
  if (!authorization.ok) return { ok: false, error: authorization.error };

  const schema =
    typeof database === "string" && database !== "" ? database : configured;
  if (schema === undefined || schema === "") {
    return { ok: false, error: ERR_MISSING_SCHEMA };
  }

  const hasName = typeof name === "string" && name !== "";
  if (hasName && !OBJECT_NAME_PATTERN.test(name)) {
    return { ok: false, error: ERR_INVALID_OBJECT_NAME };
  }

  const queries = SQL_BY_KIND[kind];
  return hasName
    ? { ok: true, sql: queries.one, params: [schema, name] }
    : { ok: true, sql: queries.list, params: [schema] };
}
