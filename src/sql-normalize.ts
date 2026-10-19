export type StripResult =
  | { ok: true; stripped: string }
  | { ok: false; error: string };

const UNCLOSED =
  "La consulta contiene una cadena o comentario sin cerrar. No se puede validar.";

export function stripSqlLiteralsAndComments(sql: string): StripResult {
  let out = "";
  let i = 0;
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
      out += " ";
      i++;
      while (i < n && sql[i] !== "`") i++;
      if (i >= n) return { ok: false, error: UNCLOSED };
      i++;
      continue;
    }

    if (ch === "-" && next === "-") {
      i += 2;
      while (i < n && sql[i] !== "\n" && sql[i] !== "\r") i++;
      continue;
    }

    if (ch === "#") {
      i++;
      while (i < n && sql[i] !== "\n" && sql[i] !== "\r") i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      i += 2;
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

    out += ch;
    i++;
  }

  return { ok: true, stripped: out.replace(/\s+/g, " ").trim() };
}
