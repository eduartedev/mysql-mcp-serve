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
    .describe("Consulta SQL SELECT únicamente"),
  database: z
    .string()
    .optional()
    .describe("Base de datos a usar (USE ...) antes de ejecutar; opcional si ya tienes MYSQL_DATABASE"),
});

server.registerTool(
  "mysql_query",
  {
    title: "Ejecutar consulta SELECT",
    description:
      "Ejecuta una consulta SQL SELECT. Solo se permiten consultas SELECT. No se permiten SHOW, DESCRIBE, EXPLAIN ni ningún otro comando.",
    inputSchema: QuerySchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
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
