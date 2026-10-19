export type StripResult =
  | { ok: true; stripped: string; endsInLineComment: boolean }
  | { ok: false; error: string };

const UNCLOSED =
  "La consulta contiene una cadena o comentario sin cerrar. No se puede validar.";
const EXECUTABLE_COMMENT =
  "La consulta contiene un comentario ejecutable (/*! */). MySQL lo correría.";

export function stripSqlLiteralsAndComments(sql: string): StripResult {
  let out = "";
  let i = 0;
  let endsInLineComment = false;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "'" || ch === '"') {
      const quote = ch;
      out += " ";
      i++;
      let closed = false;
      while (i < n) {
        if (sql[i] === "\\" && i + 1 < n) {
          i += 2;
          continue;
        }
        if (sql[i] === quote) {
          if (quote === "'" && i + 1 < n && sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) return { ok: false, error: UNCLOSED };
      continue;
    }

    if (ch === "`") {
      i++;
      let closed = false;
      while (i < n) {
        if (sql[i] === "`") {
          if (sql[i + 1] === "`") {
            out += "`";
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        out += sql[i];
        i++;
      }
      if (!closed) return { ok: false, error: UNCLOSED };
      continue;
    }

    if (ch === "-" && next === "-") {
      endsInLineComment = true;
      i += 2;
      while (i < n && sql[i] !== "\n" && sql[i] !== "\r") i++;
      continue;
    }

    if (ch === "#") {
      endsInLineComment = true;
      i++;
      while (i < n && sql[i] !== "\n" && sql[i] !== "\r") i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
      if (sql[i] === "!") return { ok: false, error: EXECUTABLE_COMMENT };
      out += " ";
      let closed = false;
      while (i < n) {
        if (sql[i] === "*" && i + 1 < n && sql[i + 1] === "/") {
          i += 2;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) return { ok: false, error: UNCLOSED };
      continue;
    }

    if (ch === "\n" || ch === "\r") endsInLineComment = false;
    out += ch;
    i++;
  }

  return { ok: true, stripped: out.replace(/\s+/g, " ").trim(), endsInLineComment };
}
