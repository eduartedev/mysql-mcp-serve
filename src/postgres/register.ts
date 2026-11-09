import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveAccessMode, toolAnnotations } from "../shared/access-mode.js";
import { formatQueryResult, QueryOutputSchema } from "../shared/format-result.js";
import { parsePiiColumns } from "../shared/pii.js";
import {
  pickAccessModeRaw,
  pickAllowlistRaw,
  pickEnv,
  pickPiiColumnsRaw,
} from "../engine.js";
import { createPool, getPostgresConfig } from "./db.js";
import { handlePostgresQuery } from "./query-exec.js";
import { QuerySchema } from "./query-schema.js";
import { CatalogSchema, prepareCatalog } from "./catalog.js";
import { toActionableSqlError } from "./sql-error.js";
import { quoteIdent } from "./quote-ident.js";
import { parseAllowlist } from "./schema-permissions.js";

export type PostgresRuntime = {
  pool: ReturnType<typeof createPool>;
  accessMode: ReturnType<typeof resolveAccessMode>;
  allowlist: ReturnType<typeof parseAllowlist>;
  piiColumns: ReadonlySet<string>;
  configuredSchema?: string;
};

export function createPostgresRuntime(env: NodeJS.ProcessEnv = process.env): PostgresRuntime {
  const accessMode = resolveAccessMode(pickAccessModeRaw(env, "postgres"));
  const allowlist = parseAllowlist(pickAllowlistRaw(env, "postgres"));
  const piiColumns = parsePiiColumns(pickPiiColumnsRaw(env, "postgres"));
  const configuredSchema = pickEnv(env, "postgres", "SCHEMA") ?? "public";
  const pool = createPool(getPostgresConfig(env), env);
  return { pool, accessMode, allowlist, piiColumns, configuredSchema };
}

export function registerPostgresTools(server: McpServer, runtime: PostgresRuntime): void {
  const { pool, accessMode, allowlist, piiColumns, configuredSchema } = runtime;

  server.registerTool(
    "postgres_query",
    {
      title: "Ejecutar consulta SQL (PostgreSQL)",
      description:
        "Ejecuta SQL de lectura (SELECT, WITH, EXPLAIN) y escritura controlada (INSERT; UPDATE/DELETE solo con WHERE). Bloquea DDL, COPY, funciones admin y SET search_path en el texto SQL.\n\n" +
        "Argumento schema: ajusta search_path antes de ejecutar. Allowlist DB_ALLOWED_DATABASES aplica a nombres de schema.",
      inputSchema: QuerySchema,
      outputSchema: QueryOutputSchema,
      annotations: toolAnnotations(accessMode),
    },
    async ({ query, schema, limit, offset, response_format }) => {
      const result = await handlePostgresQuery({
        pool,
        query,
        schema,
        limit,
        offset,
        response_format,
        accessMode,
        allowlist,
        configuredSchema,
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
    "postgres_catalog",
    {
      title: "Consultar catálogo PostgreSQL",
      description:
        "Devuelve definiciones de vistas, triggers, funciones o procedimientos vía pg_catalog.",
      inputSchema: CatalogSchema,
      outputSchema: QueryOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ kind, name, schema, limit, offset, response_format }) => {
      const prepared = prepareCatalog({
        kind,
        name,
        schema,
        configuredSchema,
        allowlist,
        mode: accessMode,
      });
      if (!prepared.ok) {
        return { content: [{ type: "text", text: prepared.error }], isError: true };
      }

      try {
        const client = await pool.connect();
        try {
          if (prepared.useSchema) {
            const ident = quoteIdent(prepared.useSchema);
            await client.query(`SET search_path TO ${ident}, public`);
          }
          const result = await client.query(prepared.sql, prepared.params);
          const { text, output } = formatQueryResult({
            rows: result.rows,
            limit,
            offset,
            responseFormat: response_format,
            piiColumns,
          });
          return { content: [{ type: "text", text }], structuredContent: output };
        } finally {
          client.release();
        }
      } catch (err) {
        return { content: [{ type: "text", text: toActionableSqlError(err) }], isError: true };
      }
    },
  );
}
