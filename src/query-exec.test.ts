import { executeOnSession, handleMysqlQuery } from "./query-exec.js";
import { parseAllowlist } from "./schema-permissions.js";
import { parsePiiColumns } from "./pii.js";

describe("executeOnSession", () => {
  it("USE y la consulta usan la misma conexión", async () => {
    const calls: string[] = [];
    const conn = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql === "USE ??") calls.push(`USE:${params?.[0]}`);
        else calls.push(sql);
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
  it("envuelve SELECT con LIMIT en MySQL", async () => {
    let sql = "";
    const conn = {
      query: async (q: string) => {
        sql = q;
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
    expect(sql.toUpperCase()).toContain("LIMIT 16");
  });
});
