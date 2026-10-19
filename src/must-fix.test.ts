import { executeOnSession, handleMysqlQuery } from "./query-exec.js";
import { parseAllowlist, authorizeDatabase } from "./schema-permissions.js";
import { parsePiiColumns } from "./pii.js";
import { validateQuery } from "./sql-validation.js";
import { stripSqlLiteralsAndComments } from "./sql-normalize.js";

describe("must-fix audit", () => {
  it("1 USE y query en la misma conexión", async () => {
    const calls: string[] = [];
    const conn = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql === "USE ??") calls.push(`USE:${params?.[0]}`);
        else calls.push(sql);
        return [[]];
      },
      release: () => undefined,
    };
    await executeOnSession({
      pool: { getConnection: async () => conn } as never,
      query: "SELECT 1",
      useDatabase: "db",
    });
    expect(calls).toEqual(["USE:db", "SELECT 1"]);
  });

  it("2 bloquea comentario ejecutable y INTO OUTFILE pegado", () => {
    expect(validateQuery("SELECT/*!50000 LOAD_FILE('C:/Windows/win.ini') */").allowed).toBe(false);
    expect(validateQuery("SELECT * FROM t) INTO/**/OUTFILE 'C:/tmp/x.csv' --").allowed).toBe(false);
  });

  it("3 bloquea UPDATE sin WHERE real", () => {
    expect(validateQuery("UPDATE t SET x = 'WHERE'").allowed).toBe(false);
  });

  it("4 bloquea mysql.user", () => {
    const r = authorizeDatabase({
      requested: undefined,
      configured: "app",
      allowlist: parseAllowlist("app"),
      sql: "SELECT * FROM mysql.user",
      mode: "readonly",
    });
    expect(r.ok).toBe(false);
  });

  it("5 SELECT lleva LIMIT en el SQL", async () => {
    let sql = "";
    const conn = {
      query: async (q: string) => {
        sql = q;
        return [[{ n: 1 }]];
      },
      release: () => undefined,
    };
    await handleMysqlQuery({
      pool: { getConnection: async () => conn } as never,
      query: "SELECT n FROM t",
      limit: 5,
      offset: 0,
      response_format: "json",
      accessMode: "readonly",
      allowlist: parseAllowlist(undefined),
      piiColumns: parsePiiColumns(undefined),
    });
    expect(sql).toMatch(/LIMIT 6/i);
  });

  it("strip separa un comentario con un espacio", () => {
    const r = stripSqlLiteralsAndComments("SELECT SLE/**/EP(5)");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.stripped.toUpperCase()).toBe("SELECT SLE EP(5)");
  });

  it("bloquea mysql.user con comillas, espacios o comentario", () => {
    const base = {
      requested: "app" as const,
      configured: "app",
      allowlist: parseAllowlist("app"),
      mode: "readonly" as const,
    };
    for (const sql of [
      "SELECT * FROM `mysql`.`user`",
      "SELECT * FROM mysql . user",
      "SELECT * FROM/**/mysql.user",
      'SELECT * FROM "mysql"."user"',
    ]) {
      expect(authorizeDatabase({ ...base, sql }).ok).toBe(false);
    }
  });

  it("bloquea UPDATE a una base :ro por el nombre calificado", () => {
    const r = authorizeDatabase({
      requested: "tienda",
      configured: "tienda",
      allowlist: parseAllowlist("tienda,analytics:ro"),
      sql: "UPDATE analytics.events SET name = 'x' WHERE id = 1",
      mode: "readwrite",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(":ro");
  });
});
