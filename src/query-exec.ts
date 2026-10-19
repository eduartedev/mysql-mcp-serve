import type { AccessMode } from "./access-mode.js";
import { gateQuery } from "./access-mode.js";
import type { Pool } from "./db.js";
import { formatQueryResult, type ResponseFormat } from "./format-result.js";
import { authorizeDatabase, type Allowlist } from "./schema-permissions.js";
import { stripSqlLiteralsAndComments } from "./sql-normalize.js";
import { getMainStatementKeyword } from "./sql-validation.js";
import { toActionableSqlError } from "./sql-error.js";

export type QueryExecInput = {
  pool: Pool;
  query: string;
  useDatabase?: string;
  homeDatabase?: string;
};

export async function executeOnSession(input: QueryExecInput): Promise<unknown> {
  const conn = await input.pool.getConnection();
  try {
    if (input.useDatabase) {
      await conn.query("USE ??", [input.useDatabase]);
    } else if (input.homeDatabase) {
      await conn.query("USE ??", [input.homeDatabase]);
    }
    const [rows] = await conn.query(input.query);
    return rows;
  } finally {
    conn.release();
  }
}

function needsServerRowCap(strippedSql: string): boolean {
  return getMainStatementKeyword(strippedSql) === "SELECT";
}

function wrapWithRowCap(sql: string, maxRows: number): string {
  const trimmed = sql.trim().replace(/;\s*$/, "");
  return `SELECT * FROM (${trimmed}) AS __mcp_cap LIMIT ${maxRows}`;
}

export type MysqlQueryHandlerInput = {
  pool: Pool;
  query: string;
  database?: string;
  limit: number;
  offset: number;
  response_format: ResponseFormat;
  accessMode: AccessMode;
  allowlist: Allowlist;
  configuredDatabase?: string;
  piiColumns: ReadonlySet<string>;
};

export async function handleMysqlQuery(
  input: MysqlQueryHandlerInput,
): Promise<
  | { ok: true; text: string; output: ReturnType<typeof formatQueryResult>["output"] }
  | { ok: false; text: string }
> {
  const validation = gateQuery(input.query, input.accessMode);
  if (!validation.allowed) {
    return { ok: false, text: validation.error ?? "Consulta no permitida." };
  }

  const authorization = authorizeDatabase({
    requested: input.database,
    configured: input.configuredDatabase,
    allowlist: input.allowlist,
    sql: input.query,
    mode: input.accessMode,
  });
  if (!authorization.ok) {
    return { ok: false, text: authorization.error };
  }

  try {
    const stripped = stripSqlLiteralsAndComments(input.query.trim());
    let execSql = input.query;
    if (stripped.ok && needsServerRowCap(stripped.stripped)) {
      execSql = wrapWithRowCap(input.query, input.offset + input.limit + 1);
    }

    const rows = await executeOnSession({
      pool: input.pool,
      query: execSql,
      useDatabase: authorization.useDatabase,
      homeDatabase: input.configuredDatabase,
    });

    const { text, output } = formatQueryResult({
      rows,
      limit: input.limit,
      offset: input.offset,
      responseFormat: input.response_format,
      piiColumns: input.piiColumns,
    });
    return { ok: true, text, output };
  } catch (err) {
    return { ok: false, text: toActionableSqlError(err) };
  }
}
