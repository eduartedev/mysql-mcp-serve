import { QUERY_TIMEOUT_MS } from "./constants.js";
import { executeOnSession, handleMysqlQuery } from "./query-exec.js";
import { parseAllowlist } from "./schema-permissions.js";
import { parsePiiColumns } from "./pii.js";

type QueryArg = string | { sql: string; values?: unknown[]; timeout?: number };

function sqlOf(arg: QueryArg): { sql: string; values?: unknown[]; timeout?: number } {
  return typeof arg === "string" ? { sql: arg } : arg;
}

describe("executeOnSession", () => {
  it("USE y la consulta usan la misma conexión", async () => {
    const calls: string[] = [];
    const conn = {
      query: async (arg: QueryArg) => {
        const q = sqlOf(arg);
        expect(q.timeout).toBe(QUERY_TIMEOUT_MS);
        if (q.sql === "USE ??") calls.push(`USE:${q.values?.[0]}`);
        else calls.push(q.sql);
        return [[{ ok: 1 }]];
      },
      release: () => undefined,
    };
    await executeOnSession({
      pool: { getConnection: async () => conn } as never,
      query: "SELECT 1",
      useDatabase: "analytics",
      homeDatabase: "app",
    });
    expect(calls).toEqual(["USE:analytics", "SELECT 1"]);
  });
});

describe("handleMysqlQuery", () => {
  it("añade LIMIT al SELECT y no recorta otra vez el offset", async () => {
    const calls: string[] = [];
    const conn = {
      query: async (arg: QueryArg) => {
        calls.push(sqlOf(arg).sql);
        return [[{ id: 1 }]];
      },
      release: () => undefined,
    };
    const r = await handleMysqlQuery({
      pool: { getConnection: async () => conn } as never,
      query: "SELECT id FROM users",
      limit: 10,
      offset: 5,
      response_format: "json",
      accessMode: "readonly",
      allowlist: parseAllowlist(undefined),
      configuredDatabase: "app",
      piiColumns: parsePiiColumns(undefined),
    });
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["USE ??", "SELECT id FROM users LIMIT 5, 11"]);
    if (r.ok) {
      expect(r.output.offset).toBe(5);
      expect(r.output.rows).toEqual([{ id: 1 }]);
    }
  });

  it("un SELECT que ya trae LIMIT usa el tope de sesión", async () => {
    const calls: string[] = [];
    const conn = {
      query: async (arg: QueryArg) => {
        calls.push(sqlOf(arg).sql);
        return [[{ id: 1 }]];
      },
      release: () => undefined,
    };
    await handleMysqlQuery({
      pool: { getConnection: async () => conn } as never,
      query: "SELECT id FROM users LIMIT 3",
      limit: 10,
      offset: 5,
      response_format: "json",
      accessMode: "readonly",
      allowlist: parseAllowlist(undefined),
      configuredDatabase: "app",
      piiColumns: parsePiiColumns(undefined),
    });
    expect(calls).toEqual([
      "USE ??",
      "SET SESSION sql_select_limit = 16",
      "SELECT id FROM users LIMIT 3",
      "SET SESSION sql_select_limit = DEFAULT",
    ]);
  });

  it("un SELECT FOR UPDATE no añade LIMIT al final", async () => {
    const calls: string[] = [];
    const conn = {
      query: async (arg: QueryArg) => {
        calls.push(sqlOf(arg).sql);
        return [[{ id: 1 }]];
      },
      release: () => undefined,
    };
    await handleMysqlQuery({
      pool: { getConnection: async () => conn } as never,
      query: "SELECT id FROM users WHERE id = 1 FOR UPDATE",
      limit: 10,
      offset: 0,
      response_format: "json",
      accessMode: "readonly",
      allowlist: parseAllowlist(undefined),
      configuredDatabase: "app",
      piiColumns: parsePiiColumns(undefined),
    });
    expect(calls).toEqual([
      "USE ??",
      "SET SESSION sql_select_limit = 11",
      "SELECT id FROM users WHERE id = 1 FOR UPDATE",
      "SET SESSION sql_select_limit = DEFAULT",
    ]);
  });

  it("un UPDATE activa sql_safe_updates y no envuelve el SQL", async () => {
    const calls: string[] = [];
    const conn = {
      query: async (arg: QueryArg) => {
        calls.push(sqlOf(arg).sql);
        return [[{ affectedRows: 1 }]];
      },
      release: () => undefined,
    };
    const r = await handleMysqlQuery({
      pool: { getConnection: async () => conn } as never,
      query: "UPDATE users SET name = 'a' WHERE id = 1",
      limit: 10,
      offset: 0,
      response_format: "json",
      accessMode: "readwrite",
      allowlist: parseAllowlist(undefined),
      configuredDatabase: "app",
      piiColumns: parsePiiColumns(undefined),
    });
    expect(r.ok).toBe(true);
    expect(calls).toEqual([
      "USE ??",
      "SET SESSION sql_safe_updates = 1",
      "UPDATE users SET name = 'a' WHERE id = 1",
    ]);
  });
});
