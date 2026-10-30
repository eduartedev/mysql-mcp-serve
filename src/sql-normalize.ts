export type StripResult =
  | { ok: true; stripped: string; policy: string; endsInLineComment: boolean }
  | { ok: false; error: string };

const UNCLOSED =
  "La consulta contiene una cadena o comentario sin cerrar. No se puede validar.";
const EXECUTABLE_COMMENT =
  "La consulta contiene un comentario ejecutable (/*! */). MySQL lo correría.";

function emit(out: string[], policy: string[], text: string): void {
  out.push(text);
  policy.push(text);
}

function startsMysqlLineComment(third: string | undefined): boolean {
  if (third === undefined) return false;
  const code = third.charCodeAt(0);
  return code <= 32 || code === 127;
}

export function stripSqlLiteralsAndComments(sql: string): StripResult {
  const out: string[] = [];
  const policy: string[] = [];
  let i = 0;
  let endsInLineComment = false;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "'" || ch === '"') {
      const quote = ch;
      emit(out, policy, " ");
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
      policy.push(" ");
      i++;
      let closed = false;
      while (i < n) {
        if (sql[i] === "`") {
          if (sql[i + 1] === "`") {
            out.push("`");
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        out.push(sql[i]);
        i++;
      }
      if (!closed) return { ok: false, error: UNCLOSED };
      continue;
    }

    if (ch === "-" && next === "-") {
      const third = i + 2 < n ? sql[i + 2] : undefined;
      if (startsMysqlLineComment(third)) {
        endsInLineComment = true;
        i += 2;
        while (i < n && sql[i] !== "\n" && sql[i] !== "\r") i++;
        continue;
      }
      // `--` al final: añadir " LIMIT" metería un espacio y MySQL comentaría el tope.
      if (third === undefined) endsInLineComment = true;
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
      emit(out, policy, " ");
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
    emit(out, policy, ch);
    i++;
  }

  const collapse = (parts: string[]) => parts.join("").replace(/\s+/g, " ").trim();
  return {
    ok: true,
    stripped: collapse(out),
    policy: collapse(policy),
    endsInLineComment,
  };
}
