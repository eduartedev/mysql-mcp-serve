export type StripResult =
  | { ok: true; stripped: string; policy: string; endsInLineComment: boolean }
  | { ok: false; error: string };

const UNCLOSED =
  "La consulta contiene una cadena o comentario sin cerrar. No se puede validar.";

function emit(out: string[], policy: string[], text: string): void {
  out.push(text);
  policy.push(text);
}

function startsLineComment(third: string | undefined): boolean {
  if (third === undefined) return false;
  const code = third.charCodeAt(0);
  return code <= 32 || code === 127;
}

function readDollarTag(sql: string, start: number): { tag: string; end: number } | null {
  if (sql[start] !== "$") return null;
  let j = start + 1;
  while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j] ?? "")) j++;
  if (sql[j] !== "$") return null;
  const tag = sql.slice(start, j + 1);
  return { tag, end: j + 1 };
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

    if (ch === "$") {
      const opened = readDollarTag(sql, i);
      if (opened !== null) {
        emit(out, policy, " ");
        const close = opened.tag;
        i = opened.end;
        const closeIdx = sql.indexOf(close, i);
        if (closeIdx === -1) return { ok: false, error: UNCLOSED };
        i = closeIdx + close.length;
        continue;
      }
    }

    if (ch === "'") {
      emit(out, policy, " ");
      i++;
      let closed = false;
      while (i < n) {
        if (sql[i] === "'") {
          if (i + 1 < n && sql[i + 1] === "'") {
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

    if (ch === '"') {
      policy.push(" ");
      i++;
      let closed = false;
      while (i < n) {
        if (sql[i] === '"') {
          if (i + 1 < n && sql[i + 1] === '"') {
            out.push('"');
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
      if (startsLineComment(third)) {
        endsInLineComment = true;
        i += 2;
        while (i < n && sql[i] !== "\n" && sql[i] !== "\r") i++;
        continue;
      }
      if (third === undefined) endsInLineComment = true;
    }

    if (ch === "/" && next === "*") {
      i += 2;
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
