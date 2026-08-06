import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPool, getMysqlConfig, type Pool } from "./db.js";
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

const QuerySchema = z.object({
  query: z
    .string()
    .min(1, "query es obligatoria")
    .max(16 * 1024)
    .describe(
      "SQL permitido: SELECT/WITH/SHOW/DESCRIBE/EXPLAIN/ANALYZE/CHECK/CHECKSUM, INSERT, y UPDATE/DELETE (estos últimos requieren WHERE)",
    ),
  database: z
    .string()
    .optional()
    .describe("Base de datos a usar (USE ...) antes de ejecutar; opcional si ya tienes MYSQL_DATABASE"),
});

server.registerTool(
  "mysql_query",
  {
    title: "Ejecutar consulta SQL",
    description:
      "Ejecuta SQL de lectura (SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, ANALYZE, CHECK, CHECKSUM) y escritura controlada (INSERT; UPDATE/DELETE solo con WHERE). Bloquea DDL destructivo, SHOW sensibles y funciones peligrosas.",
    inputSchema: QuerySchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  },
  async ({ query, database }) => {
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
      const arr = Array.isArray(rows) ? rows : [rows];
      const text =
        arr.length === 0
          ? "Sin filas."
          : JSON.stringify(arr, null, 2);
      return {
        content: [{ type: "text", text }],
        structuredContent: { rowCount: arr.length, rows: arr },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error SQL: ${msg}` }],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
