import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AccessMode } from "../shared/access-mode.js";
import { resolveAccessMode, toolAnnotations } from "../shared/access-mode.js";
import { QUERY_TIMEOUT_MS, SERVER_NAME, SERVER_VERSION } from "../shared/constants.js";
import { formatQueryResult, QueryOutputSchema, type QueryOutput } from "../shared/format-result.js";
import { parsePiiColumns } from "../shared/pii.js";
import {
  getConnectionConfig,
  pickAccessModeRaw,
  pickAllowlistRaw,
  pickPiiColumnsRaw,
} from "../engine.js";
import { createPool, getMysqlConfig, type Pool } from "./db.js";
import { handleMysqlQuery } from "./query-exec.js";
import { QuerySchema } from "./query-schema.js";
import { CatalogSchema, prepareCatalog } from "./catalog.js";
import { toActionableSqlError } from "./sql-error.js";
import { parseAllowlist } from "./schema-permissions.js";

export type MysqlRuntime = {
  pool: Pool;
  accessMode: AccessMode;
  allowlist: ReturnType<typeof parseAllowlist>;
  piiColumns: ReadonlySet<string>;
  configuredDatabase?: string;
};

export function createMysqlRuntime(env: NodeJS.ProcessEnv = process.env): MysqlRuntime {
  const accessMode = resolveAccessMode(pickAccessModeRaw(env, "mysql"));
  const allowlist = parseAllowlist(pickAllowlistRaw(env, "mysql"));
  const piiColumns = parsePiiColumns(pickPiiColumnsRaw(env, "mysql"));
  const configuredDatabase = getConnectionConfig(env, "mysql").database;
  const pool = createPool(getMysqlConfig(env), env);
  return { pool, accessMode, allowlist, piiColumns, configuredDatabase };
}

export function registerMysqlTools(server: McpServer, runtime: MysqlRuntime): void {
  const { pool, accessMode, allowlist, piiColumns, configuredDatabase } = runtime;

  server.registerTool(
    "mysql_query",
    {
      title: "Ejecutar consulta SQL",
      description:
        "Ejecuta SQL de lectura (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, ANALYZE, CHECK, CHECKSUM) y escritura controlada (INSERT; UPDATE/DELETE solo con WHERE). Bloquea DDL destructivo, SHOW sensibles y funciones peligrosas.\n\n" +
        "Argumentos: query (una sola sentencia), database (opcional, USE previo), limit, offset y response_format. Un SELECT sin LIMIT propio se ejecuta con LIMIT offset, count.\n\n" +
        "Si DB_ACCESS_MODE no es exactamente readwrite, INSERT, UPDATE y DELETE se rechazan. El argumento database debe estar permitido por DB_ALLOWED_DATABASES.",
      inputSchema: QuerySchema,
      outputSchema: QueryOutputSchema,
      annotations: toolAnnotations(accessMode),
    },
    async ({ query, database, limit, offset, response_format }) => {
      const result = await handleMysqlQuery({
        pool,
        query,
        database,
        limit,
        offset,
        response_format,
        accessMode,
        allowlist,
        configuredDatabase,
        piiColumns,
      });
      if (!result.ok) {
        return { content: [{ type: "text", text: result.text }], isError: true };
      }
      return {
        content: [{ type: "text", text: result.text }],
        structuredContent: result.output,
      };
    },
  );

  server.registerTool(
    "mysql_catalog",
    {
      title: "Consultar catálogo",
      description:
        "Devuelve metadatos y definición de vistas, triggers, funciones o procedimientos desde information_schema.",
      inputSchema: CatalogSchema,
      outputSchema: QueryOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ kind, name, database, limit, offset, response_format }) => {
      const prepared = prepareCatalog({
        kind,
        name,
        database,
        configured: configuredDatabase,
        allowlist,
        mode: accessMode,
      });
      if (!prepared.ok) {
        return { content: [{ type: "text", text: prepared.error }], isError: true };
      }

      try {
        const conn = await pool.getConnection();
        try {
          if (prepared.useDatabase) {
            await conn.query({ sql: "USE ??", values: [prepared.useDatabase], timeout: QUERY_TIMEOUT_MS });
          } else if (configuredDatabase) {
            await conn.query({ sql: "USE ??", values: [configuredDatabase], timeout: QUERY_TIMEOUT_MS });
          }
          const [rows] = await conn.query({
            sql: prepared.sql,
            values: prepared.params,
            timeout: QUERY_TIMEOUT_MS,
          });
          const { text, output } = formatQueryResult({
            rows,
            limit,
            offset,
            responseFormat: response_format,
            piiColumns,
          });
          return { content: [{ type: "text", text }], structuredContent: output };
        } finally {
          conn.release();
        }
      } catch (err) {
        return { content: [{ type: "text", text: toActionableSqlError(err) }], isError: true };
      }
    },
  );
}

export { SERVER_NAME, SERVER_VERSION };
