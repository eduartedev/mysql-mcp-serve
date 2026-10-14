import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPool, getMysqlConfig, type Pool } from "./db.js";
import { formatQueryResult, QueryOutputSchema, type QueryOutput } from "./format-result.js";
import { QuerySchema } from "./query-schema.js";
import { toActionableSqlError } from "./sql-error.js";
import { validateQuery } from "./sql-validation.js";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const config = getMysqlConfig();
    pool = createPool(config);
  }
  return pool;
}

const server = new McpServer({
  name: "mysql-mcp-server",
  version: "1.0.0",
});

server.registerTool(
  "mysql_query",
  {
    title: "Ejecutar consulta SQL",
    description:
      "Ejecuta SQL de lectura (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, ANALYZE, CHECK, CHECKSUM) y escritura controlada (INSERT; UPDATE/DELETE solo con WHERE). Bloquea DDL destructivo, SHOW sensibles y funciones peligrosas.\n\n" +
      "Argumentos: query (una sola sentencia), database (opcional, USE previo), limit (filas por página, 1-100, por defecto 20), offset (filas a saltar, por defecto 0) y response_format ('markdown' o 'json'). limit y offset paginan las filas ya devueltas; no modifican el SQL.\n\n" +
      "Devuelve: totalCount, count, offset, limit, hasMore, nextOffset, truncated y rows. Si hasMore es true, repite la llamada con offset = nextOffset. Las respuestas de más de 25000 caracteres se truncan (truncated = true).\n\n" +
      "Ejemplo: { \"query\": \"SELECT id, name FROM customers ORDER BY id\", \"limit\": 20, \"offset\": 20 }.\n\n" +
      "Si la validación rechaza la consulta, el error nombra la regla incumplida.",
    inputSchema: QuerySchema,
    outputSchema: QueryOutputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({
    query,
    database,
    limit,
    offset,
    response_format,
  }): Promise<{
    content: { type: "text"; text: string }[];
    structuredContent?: QueryOutput;
    isError?: boolean;
  }> => {
    const validation = validateQuery(query);
    if (!validation.allowed) {
      return {
        content: [{ type: "text", text: validation.error ?? "Consulta no permitida." }],
        isError: true,
      };
    }

    try {
      const p = getPool();
      if (database) {
        await p.query("USE ??", [database]);
      }
      const [rows] = await p.query(query);
      const { text, output } = formatQueryResult({
        rows,
        limit,
        offset,
        responseFormat: response_format,
      });
      return {
        content: [{ type: "text", text }],
        structuredContent: output,
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: toActionableSqlError(err) }],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
