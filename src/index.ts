#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPool, getMysqlConfig, type Pool } from "./db.js";
import { formatQueryResult, QueryOutputSchema, type QueryOutput } from "./format-result.js";
import { handleMysqlQuery } from "./query-exec.js";
import { QuerySchema } from "./query-schema.js";
import { CatalogSchema, prepareCatalog } from "./catalog.js";
import { toActionableSqlError } from "./sql-error.js";
import { resolveAccessMode, toolAnnotations } from "./access-mode.js";
import { parseAllowlist } from "./schema-permissions.js";
import { parsePiiColumns } from "./pii.js";
import { QUERY_TIMEOUT_MS } from "./constants.js";
import { loadMysqlEnvFile } from "./load-env.js";

loadMysqlEnvFile();

const accessMode = resolveAccessMode(process.env.MYSQL_ACCESS_MODE);
const allowlist = parseAllowlist(process.env.MYSQL_ALLOWED_DATABASES);
const piiColumns = parsePiiColumns(process.env.MYSQL_PII_COLUMNS);
const configuredDatabase = getMysqlConfig().database;

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
      "Argumentos: query (una sola sentencia), database (opcional, USE previo), limit (filas por página, 1-100, por defecto 20), offset (filas a saltar, 0-100000, por defecto 0) y response_format ('markdown' o 'json'). Un SELECT sin LIMIT propio se ejecuta con LIMIT offset, count. Si ya trae LIMIT, acaba en un comentario de línea, o usa FOR UPDATE / LOCK IN SHARE MODE, MySQL devuelve como mucho offset+limit+1 filas.\n\n" +
      "Devuelve: totalCount, count, offset, limit, hasMore, nextOffset, truncated y rows. Si hasMore es true, repite la llamada con offset = nextOffset. Las respuestas de más de 25000 caracteres se truncan (truncated = true).\n\n" +
      "Ejemplo: { \"query\": \"SELECT id, name FROM customers ORDER BY id\", \"limit\": 20, \"offset\": 20 }.\n\n" +
      "Si la validación rechaza la consulta, el error nombra la regla incumplida.\n\n" +
      "Si MYSQL_ACCESS_MODE no es exactamente readwrite, INSERT, UPDATE y DELETE se rechazan.\n\n" +
      "El argumento database debe estar permitido por MYSQL_ALLOWED_DATABASES, y una base marcada :ro rechaza las escrituras. " +
      "Las columnas email, correo, phone, telefono, password, contrasena, ssn, nss y token, más las de MYSQL_PII_COLUMNS, se devuelven como ***. El texto de otras columnas no se inspecciona.",
    inputSchema: QuerySchema,
    outputSchema: QueryOutputSchema,
    annotations: toolAnnotations(accessMode),
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
    const result = await handleMysqlQuery({
      pool: getPool(),
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
      return {
        content: [{ type: "text", text: result.text }],
        isError: true,
      };
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
      "Devuelve metadatos y la definición de una vista, trigger, función o procedimiento desde information_schema.\n\n" +
      "Argumentos: kind ('view', 'trigger', 'function' o 'procedure'), name (opcional; si se omite, lista todos los objetos de ese tipo), database (opcional), limit (1-100, por defecto 20), offset (por defecto 0) y response_format ('markdown' o 'json').\n\n" +
      "El argumento database sigue MYSQL_ALLOWED_DATABASES. El nombre del objeto no se escribe en el texto SQL: viaja como parámetro. No se aceptan CALL ni CREATE.\n\n" +
      "Ejemplo: { \"kind\": \"view\", \"name\": \"clientes_activos\" }.",
    inputSchema: CatalogSchema,
    outputSchema: QueryOutputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({
    kind,
    name,
    database,
    limit,
    offset,
    response_format,
  }): Promise<{
    content: { type: "text"; text: string }[];
    structuredContent?: QueryOutput;
    isError?: boolean;
  }> => {
    const prepared = prepareCatalog({
      kind,
      name,
      database,
      configured: configuredDatabase,
      allowlist,
      mode: accessMode,
    });
    if (!prepared.ok) {
      return {
        content: [{ type: "text", text: prepared.error }],
        isError: true,
      };
    }

    try {
      const conn = await getPool().getConnection();
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
        return {
          content: [{ type: "text", text }],
          structuredContent: output,
        };
      } finally {
        conn.release();
      }
    } catch (err) {
      return {
        content: [{ type: "text", text: toActionableSqlError(err) }],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
