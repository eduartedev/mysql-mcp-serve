import { stripSqlLiteralsAndComments } from "./sql-normalize.js";

describe("stripSqlLiteralsAndComments", () => {
  it("une SLEEP tras quitar comentario", () => {
    const r = stripSqlLiteralsAndComments("SELECT SLE/**/EP(5)");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stripped.toUpperCase()).toContain("SLEEP(5)");
  });
});
