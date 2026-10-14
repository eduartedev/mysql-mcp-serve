import { gateQuery, resolveAccessMode, toolAnnotations } from "./access-mode.js";

describe("resolveAccessMode", () => {
  it.each([undefined, "", "readonly", "READWRITE", "ReadWrite", "read-write", "true"])(
    "devuelve readonly para %j",
    (raw) => {
      expect(resolveAccessMode(raw)).toBe("readonly");
    }
  );

  it.each(["readwrite", "  readwrite  "])("devuelve readwrite para %j", (raw) => {
    expect(resolveAccessMode(raw)).toBe("readwrite");
  });
});

describe("gateQuery en readonly", () => {
  it.each(["SELECT 1", "SHOW TABLES", "WITH cte AS (SELECT 1) SELECT * FROM cte"])(
    "permite %s",
    (sql) => {
      expect(gateQuery(sql, "readonly").allowed).toBe(true);
    }
  );

  it("rechaza INSERT con mensaje de modo solo lectura", () => {
    const result = gateQuery("INSERT INTO t (id) VALUES (1)", "readonly");
    expect(result.allowed).toBe(false);
    expect(result.error).toContain("MYSQL_ACCESS_MODE=readwrite");
  });

  it.each([
    "UPDATE t SET x = 1 WHERE id = 1",
    "DELETE FROM t WHERE id = 1",
    "WITH cte AS (SELECT 1) UPDATE t SET x = 1 WHERE id = 1",
  ])("rechaza %s", (sql) => {
    const result = gateQuery(sql, "readonly");
    expect(result.allowed).toBe(false);
    expect(result.error).toContain("MYSQL_ACCESS_MODE=readwrite");
  });

  it("DROP devuelve el error destructivo, no el de solo lectura", () => {
    const result = gateQuery("DROP TABLE t", "readonly");
    expect(result.allowed).toBe(false);
    expect(result.error).toContain("no permitidos");
    expect(result.error).not.toContain("MYSQL_ACCESS_MODE");
  });
});

describe("gateQuery en readwrite", () => {
  it("permite INSERT", () => {
    expect(gateQuery("INSERT INTO t (id) VALUES (1)", "readwrite").allowed).toBe(true);
  });

  it("rechaza UPDATE sin WHERE con la regla existente", () => {
    const result = gateQuery("UPDATE t SET x = 1", "readwrite");
    expect(result.allowed).toBe(false);
    expect(result.error).toContain("WHERE");
    expect(result.error).not.toContain("MYSQL_ACCESS_MODE");
  });

  it("rechaza DELETE con WHERE siempre verdadero", () => {
    const result = gateQuery("DELETE FROM t WHERE 1 = 1", "readwrite");
    expect(result.allowed).toBe(false);
    expect(result.error).toContain("siempre verdadera");
  });
});

describe("toolAnnotations", () => {
  it("readonly marca readOnlyHint y no destructiveHint", () => {
    const a = toolAnnotations("readonly");
    expect(a.readOnlyHint).toBe(true);
    expect(a.destructiveHint).toBe(false);
    expect(a.idempotentHint).toBe(false);
    expect(a.openWorldHint).toBe(true);
  });

  it("readwrite marca destructiveHint y no readOnlyHint", () => {
    const a = toolAnnotations("readwrite");
    expect(a.readOnlyHint).toBe(false);
    expect(a.destructiveHint).toBe(true);
    expect(a.idempotentHint).toBe(false);
    expect(a.openWorldHint).toBe(true);
  });
});
