const BUILT_IN_PII_COLUMNS = [
  "email",
  "correo",
  "phone",
  "telefono",
  "password",
  "contrasena",
  "ssn",
  "nss",
  "token",
] as const;

const CUSTOM_TOKEN_PATTERN = /^[A-Za-z0-9_]+$/;

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function columnKeys(column: string): string[] {
  const spaced = column.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  const normalized = stripAccents(spaced).toLowerCase();
  const parts = normalized.split(/[^a-z0-9]+/).filter((part) => part.length > 0);
  return parts.length > 1 ? [...parts, parts.join("_")] : parts;
}

export function parsePiiColumns(raw: string | undefined): ReadonlySet<string> {
  const names = new Set<string>(BUILT_IN_PII_COLUMNS);
  if (raw === undefined || raw.trim() === "") {
    return names;
  }
  for (const token of raw.split(",")) {
    const trimmed = token.trim();
    if (trimmed === "") continue;
    const plain = stripAccents(trimmed);
    if (!CUSTOM_TOKEN_PATTERN.test(plain)) continue;
    names.add(plain.toLowerCase());
  }
  return names;
}

export function isPiiColumn(column: string, names: ReadonlySet<string>): boolean {
  return columnKeys(column).some((key) => names.has(key));
}
