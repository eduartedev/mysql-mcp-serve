/** Identificador SQL entrecomillado para SET search_path (nunca concatenar crudo). */
export function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error("Nombre de schema no válido.");
  }
  return `"${name.replace(/"/g, '""')}"`;
}
