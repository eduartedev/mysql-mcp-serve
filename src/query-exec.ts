import type { AccessMode } from "./access-mode.js";
import { gateQuery } from "./access-mode.js";
import type { Pool } from "./db.js";
import { formatQueryResult, type ResponseFormat } from "./format-result.js";
import { authorizeDatabase, type Allowlist } from "./schema-permissions.js";
import { stripSqlLiteralsAndComments } from "./sql-normalize.js";
import { QUERY_TIMEOUT_MS } from "./constants.js";
import { getMainStatementKeyword, isWriteQuery } from "./sql-validation.js";
import { toActionableSqlError } from "./sql-error.js";

function timed(sql: string, values?: unknown[]): { sql: string; timeout: number; values?: unknown[] } {
  return values === undefined
    ? { sql, timeout: QUERY_TIMEOUT_MS }
    : { sql, values, timeout: QUERY_TIMEOUT_MS };
}

export type QueryExecInput = {
  pool: Pool;
  query: string;
  useDatabase?: string;
  homeDatabase?: string;
  safeUpdates?: boolean;
  maxRows?: number;
};

type QueryArg = string | { sql: string; timeout?: number; values?: unknown[] };

type SessionConn = {
  query: (sql: QueryArg, params?: unknown[]) => Promise<[unknown, unknown]>;
  release: () => void;
  destroy?: () => void;
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
    /\bLOCK\s+IN\s+SHARE\s+MODE\b/i.test(stripped.stripped) ||
    stripped.endsInLineComment;
  if (keepSessionCap) return { sql: body, paged: false };
  return { sql: `${body} LIMIT ${offset}, ${limit + 1}`, paged: true };
}

export async function executeOnSession(input: QueryExecInput): Promise<unknown> {
  const conn = (await input.pool.getConnection()) as SessionConn;
  let capped = false;
  try {
    if (input.useDatabase) {
      await conn.query(timed("USE ??", [input.useDatabase]));
    } else if (input.homeDatabase) {
      await conn.query(timed("USE ??", [input.homeDatabase]));
    }
    if (input.safeUpdates) {
      await conn.query(timed("SET SESSION sql_safe_updates = 1"));
    }
    if (input.maxRows !== undefined) {
      if (!Number.isSafeInteger(input.maxRows) || input.maxRows < 1) {
        throw new Error("maxRows no es válido.");
      }
      await conn.query(timed(`SET SESSION sql_select_limit = ${input.maxRows}`));
      capped = true;
    }
    const [rows] = await conn.query(timed(input.query));
    return rows;
  } finally {
    let dropped = false;
    if (capped) {
      try {
        await conn.query(timed("SET SESSION sql_select_limit = DEFAULT"));
      } catch {
        if (typeof conn.destroy === "function") {
          conn.destroy();
          dropped = true;
        }
      }
    }
    if (!dropped) conn.release();
  }
}

function needsServerRowCap(strippedSql: string): boolean {
  return getMainStatementKeyword(strippedSql) === "SELECT";
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
    if (!stripped.ok) return { ok: false, text: stripped.error };
    const select = needsServerRowCap(stripped.stripped);
    const plan = select ? planSelect(input.query, input.offset, input.limit) : { sql: input.query, paged: false };
    const maxRows = input.offset + input.limit + 1;
    if (select && !plan.paged && !Number.isSafeInteger(maxRows)) {
      return { ok: false, text: "offset es demasiado grande." };
    }

    const rows = await executeOnSession({
      pool: input.pool,
      query: plan.sql,
      useDatabase: authorization.useDatabase,
      homeDatabase: input.configuredDatabase,
      safeUpdates: isWriteQuery(stripped.stripped),
      maxRows: select && !plan.paged ? maxRows : undefined,
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
