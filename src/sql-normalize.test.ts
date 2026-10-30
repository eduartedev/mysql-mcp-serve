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

  it("no mete el texto del identificador en la política", () => {
    const r = stripSqlLiteralsAndComments("WITH `) SELECT` AS x DELETE FROM t WHERE id = 1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.policy).toBe("WITH AS x DELETE FROM t WHERE id = 1");
  });

  it("solo trata -- como comentario si MySQL lo haría", () => {
    const code = stripSqlLiteralsAndComments("SELECT 1--SLEEP(0)");
    expect(code.ok).toBe(true);
    if (!code.ok) return;
    expect(code.policy).toBe("SELECT 1--SLEEP(0)");

    const comment = stripSqlLiteralsAndComments("SELECT 1-- SLEEP(0)");
    expect(comment.ok).toBe(true);
    if (!comment.ok) return;
    expect(comment.policy).toBe("SELECT 1");
    expect(comment.endsInLineComment).toBe(true);
  });
});
