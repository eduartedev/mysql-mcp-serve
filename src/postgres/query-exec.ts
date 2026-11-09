import type { AccessMode } from "../shared/access-mode.js";
import { gateQuery } from "./gate-query.js";
import type { Pool } from "./db.js";
import { formatQueryResult, type ResponseFormat } from "../shared/format-result.js";
import { authorizeSchema, type Allowlist } from "./schema-permissions.js";
import { stripSqlLiteralsAndComments } from "./sql-normalize.js";
import { QUERY_TIMEOUT_MS } from "../shared/constants.js";
import { getMainStatementKeyword } from "./sql-validation.js";
import { toActionableSqlError } from "./sql-error.js";
import { quoteIdent } from "./quote-ident.js";

export type QueryExecInput = {
  pool: Pool;
  query: string;
  useSchema?: string;
  homeSchema?: string;
};

function planSelect(
  sql: string,
  offset: number,
  limit: number,
): { sql: string; paged: boolean } {
  const body = sql.trim().replace(/;\s*$/, "");
  if (!Number.isInteger(offset) || !Number.isInteger(limit) || offset < 0 || limit < 1) {
    return { sql: body, paged: false };
  }
  const stripped = stripSqlLiteralsAndComments(body);
  if (!stripped.ok) return { sql: body, paged: false };
  const keepSessionCap =
    /\bLIMIT\b/i.test(stripped.stripped) ||
    /\bFOR\s+UPDATE\b/i.test(stripped.stripped) ||
    /\bFOR\s+SHARE\b/i.test(stripped.stripped) ||
    stripped.endsInLineComment;
  if (!keepSessionCap) {
    return { sql: `${body} LIMIT ${limit + 1} OFFSET ${offset}`, paged: true };
  }
  const cap = offset + limit + 1;
  return {
    sql: `SELECT * FROM (${body}) AS _mcp_cap LIMIT ${cap}`,
    paged: false,
  };
}

export async function executeOnSession(input: QueryExecInput): Promise<unknown> {
  const client = await input.pool.connect();
  try {
    await client.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);
    const schema = input.useSchema ?? input.homeSchema;
    if (schema) {
      const ident = quoteIdent(schema);
      await client.query(`SET search_path TO ${ident}, public`);
    }
    const result = await client.query(input.query);
    return result.rows;
  } finally {
    client.release();
  }
}

function needsServerRowCap(strippedSql: string): boolean {
  return getMainStatementKeyword(strippedSql) === "SELECT";
}

export type PostgresQueryHandlerInput = {
  pool: Pool;
  query: string;
  schema?: string;
  limit: number;
  offset: number;
  response_format: ResponseFormat;
  accessMode: AccessMode;
  allowlist: Allowlist;
  configuredSchema?: string;
  piiColumns: ReadonlySet<string>;
};

export async function handlePostgresQuery(
  input: PostgresQueryHandlerInput,
): Promise<
  | { ok: true; text: string; output: ReturnType<typeof formatQueryResult>["output"] }
  | { ok: false; text: string }
> {
  const validation = gateQuery(input.query, input.accessMode);
  if (!validation.allowed) {
    return { ok: false, text: validation.error ?? "Consulta no permitida." };
  }

  const authorization = authorizeSchema({
    requested: input.schema,
    configured: input.configuredSchema,
    allowlist: input.allowlist,
    sql: input.query,
    mode: input.accessMode,
  });
  if (!authorization.ok) {
    return { ok: false, text: authorization.error };
  }

  try {
    const stripped = stripSqlLiteralsAndComments(input.query.trim());
    if (!stripped.ok) return { ok: false, text: stripped.error };
    const select = needsServerRowCap(stripped.policy);
    const plan = select
      ? planSelect(input.query, input.offset, input.limit)
      : { sql: input.query, paged: false };

    const rows = await executeOnSession({
      pool: input.pool,
      query: plan.sql,
      useSchema: authorization.useSchema,
      homeSchema: input.configuredSchema,
    });

    const { text, output } = formatQueryResult({
      rows,
      limit: input.limit,
      offset: input.offset,
      responseFormat: input.response_format,
      piiColumns: input.piiColumns,
      paged: plan.paged,
      sql: stripped.stripped,
    });
    return { ok: true, text, output };
  } catch (err) {
    return { ok: false, text: toActionableSqlError(err) };
  }
}
