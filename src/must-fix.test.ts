import { handleMysqlQuery } from "./query-exec.js";
import { parseAllowlist, authorizeDatabase } from "./schema-permissions.js";
import { parsePiiColumns } from "./pii.js";
import { validateQuery } from "./sql-validation.js";
import { stripSqlLiteralsAndComments } from "./sql-normalize.js";

type QueryArg = string | { sql: string; values?: unknown[] };

function sqlOf(arg: QueryArg): { sql: string; values?: unknown[] } {
  return typeof arg === "string" ? { sql: arg } : arg;
}

describe("must-fix audit", () => {
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

  it("5 un SELECT sin LIMIT propio lleva el límite en el SQL", async () => {
    const calls: string[] = [];
    const conn = {
      query: async (arg: QueryArg) => {
        calls.push(sqlOf(arg).sql);
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
    expect(calls).toEqual(["SELECT n FROM t LIMIT 0, 6"]);
  });

  it("un SELECT que acaba en comentario usa el tope de sesión", async () => {
    const calls: string[] = [];
    const conn = {
      query: async (arg: QueryArg) => {
        calls.push(sqlOf(arg).sql);
        return [[{ n: 1 }]];
      },
      release: () => undefined,
    };
    await handleMysqlQuery({
      pool: { getConnection: async () => conn } as never,
      query: "SELECT n FROM t -- nota",
      limit: 5,
      offset: 0,
      response_format: "json",
      accessMode: "readonly",
      allowlist: parseAllowlist(undefined),
      piiColumns: parsePiiColumns(undefined),
    });
    expect(calls).toEqual([
      "SET SESSION sql_select_limit = 6",
      "SELECT n FROM t -- nota",
      "SET SESSION sql_select_limit = DEFAULT",
    ]);
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
