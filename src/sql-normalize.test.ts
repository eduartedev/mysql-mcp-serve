import { stripSqlLiteralsAndComments } from "./sql-normalize.js";

describe("stripSqlLiteralsAndComments", () => {
  it("un comentario es un espacio, no pega los tokens", () => {
    const r = stripSqlLiteralsAndComments("SELECT SLE/**/EP(5)");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stripped.toUpperCase()).toBe("SELECT SLE EP(5)");
  });

  it("rechaza un comentario ejecutable", () => {
    const r = stripSqlLiteralsAndComments("SELECT/*!50000 LOAD_FILE('C:/Windows/win.ini') */");
    expect(r.ok).toBe(false);
  });

  it("conserva el identificador entre comillas invertidas", () => {
    const r = stripSqlLiteralsAndComments("SELECT * FROM `mysql`.`user`");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.stripped).toBe("SELECT * FROM mysql.user");
  });
});
