import { validateQuery } from "./sql-validation.js";
import { stripSqlLiteralsAndComments } from "./sql-normalize.js";
import { gateQuery } from "./gate-query.js";

describe("postgres validateQuery", () => {
  it("permite SELECT", () => {
    expect(validateQuery("SELECT 1").allowed).toBe(true);
  });

  it("bloquea COPY y pg_sleep", () => {
    expect(validateQuery("COPY t TO STDOUT").allowed).toBe(false);
    expect(validateQuery("SELECT pg_sleep(1)").allowed).toBe(false);
  });

  it("bloquea SET search_path", () => {
    expect(validateQuery("SET search_path TO public").allowed).toBe(false);
  });

  it("dollar-quote oculta punto y coma", () => {
    const r = stripSqlLiteralsAndComments("SELECT $$a;b$$");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.stripped).not.toContain(";");
  });
});

describe("postgres gateQuery readonly", () => {
  it("rechaza UPDATE", () => {
    const r = gateQuery("UPDATE t SET x = 1 WHERE id = 1", "readonly");
    expect(r.allowed).toBe(false);
  });
});
