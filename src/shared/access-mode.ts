export type AccessMode = "readonly" | "readwrite";

/** Solo el valor exacto "readwrite" (tras trim) habilita escrituras; todo lo demás es solo lectura. */
export function resolveAccessMode(raw: string | undefined): AccessMode {
  return raw?.trim() === "readwrite" ? "readwrite" : "readonly";
}

export function toolAnnotations(mode: AccessMode): {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
} {
  const readonly = mode === "readonly";
  return {
    readOnlyHint: readonly,
    destructiveHint: !readonly,
    idempotentHint: false,
    openWorldHint: true,
  };
}
