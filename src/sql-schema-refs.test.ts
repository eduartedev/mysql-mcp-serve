import { assertSqlSchemasAllowed } from "./mysql/sql-schema-refs.js";
import { parseAllowlist } from "./mysql/schema-permissions.js";

describe("assertSqlSchemasAllowed", () => {
  it("bloquea mysql.user", () => {
    const r = assertSqlSchemasAllowed(
      "SELECT * FROM mysql.user",
      parseAllowlist("app"),
      "app",
    );
    expect(r.ok).toBe(false);
  });

  it("bloquea espacios, SHOW CREATE y DESCRIBE", () => {
    const allow = parseAllowlist("app");
    for (const sql of [
      "SELECT * FROM mysql . user",
      "SHOW CREATE TABLE mysql.user",
      "DESCRIBE mysql.user",
    ]) {
      expect(assertSqlSchemasAllowed(sql, allow, "app").ok).toBe(false);
    }
  });

  it("no toma la tabla de SHOW COLUMNS como base", () => {
    const r = assertSqlSchemasAllowed(
      "SHOW COLUMNS FROM users",
      parseAllowlist("app"),
      "app",
    );
    expect(r.ok).toBe(true);
  });

  it("rechaza escribir en una base :ro citada en el SQL", () => {
    const r = assertSqlSchemasAllowed(
      "UPDATE analytics.events SET name = 'x' WHERE id = 1",
      parseAllowlist("tienda,analytics:ro"),
      "tienda",
      true,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(":ro");
  });

  it("bloquea CHECKSUM de una base del sistema", () => {
    const r = assertSqlSchemasAllowed(
      "CHECKSUM TABLE mysql.user",
      parseAllowlist("app"),
      "app",
    );
    expect(r.ok).toBe(false);
  });

  it("bloquea ANALYZE de otra base", () => {
    const r = assertSqlSchemasAllowed(
      "ANALYZE TABLE otra.tabla",
      parseAllowlist("app"),
      "app",
    );
    expect(r.ok).toBe(false);
  });

  it("no toma un texto entre comillas como esquema", () => {
    const sql = 'SELECT * FROM t WHERE note = "mysql.user"';
    const r = assertSqlSchemasAllowed(sql, parseAllowlist("app"), "app", false, false, sql);
    expect(r.ok).toBe(true);
  });

  it("bloquea un nombre entre comillas dobles", () => {
    const sql = 'SELECT * FROM "mysql"."user"';
    const r = assertSqlSchemasAllowed(sql, parseAllowlist("app"), "app", false, false, sql);
    expect(r.ok).toBe(false);
  });

  it("permite copiar desde una base :ro", () => {
    const r = assertSqlSchemasAllowed(
      "INSERT INTO tienda.copia SELECT * FROM analytics.events",
      parseAllowlist("tienda,analytics:ro"),
      "tienda",
      true,
      false,
    );
    expect(r.ok).toBe(true);
  });

  it("bloquea el join por coma, UPDATE IGNORE y SHOW IN", () => {
    const allow = parseAllowlist("app");
    for (const sql of [
      "SELECT * FROM (SELECT 1) d, mysql.user",
      "UPDATE IGNORE other.t SET x = 1 WHERE id = 1",
      "SHOW TABLES IN mysql",
      "SHOW COLUMNS FROM t IN mysql",
      "SELECT mysql.user.Host FROM t",
    ]) {
      expect(assertSqlSchemasAllowed(sql, allow, "app").ok).toBe(false);
    }
  });

  it("no toma t.id ni una asignación como esquema", () => {
    const allow = parseAllowlist("app");
    expect(assertSqlSchemasAllowed("SELECT t.id FROM t WHERE t.id = 1", allow, "app").ok).toBe(true);
    expect(
      assertSqlSchemasAllowed("UPDATE t SET a.x = 1 WHERE id = 1", allow, "app", true).ok,
    ).toBe(true);
  });

  it("permite leer una base :ro", () => {
    const r = assertSqlSchemasAllowed(
      "SELECT * FROM analytics.events",
      parseAllowlist("tienda,analytics:ro"),
      "tienda",
      false,
    );
    expect(r.ok).toBe(true);
  });
});
