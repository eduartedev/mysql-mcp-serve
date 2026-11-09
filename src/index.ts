#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveEngine } from "./engine.js";
import { loadDbEnvFile } from "./shared/load-env.js";
import { SERVER_NAME, SERVER_VERSION } from "./shared/constants.js";
import { createMysqlRuntime, registerMysqlTools } from "./mysql/register.js";
import { createPostgresRuntime, registerPostgresTools } from "./postgres/register.js";

loadDbEnvFile();

const engine = resolveEngine(process.env);

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

if (engine === "mysql") {
  registerMysqlTools(server, createMysqlRuntime(process.env));
} else {
  registerPostgresTools(server, createPostgresRuntime(process.env));
}

const transport = new StdioServerTransport();
await server.connect(transport);
