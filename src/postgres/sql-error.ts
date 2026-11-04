const MESSAGES: Record<string, string> = {
  "42P01":
    "Error SQL (42P01): la tabla no existe. Consulta information_schema.tables o el catálogo postgres_catalog.",
  "42703":
    "Error SQL (42703): columna desconocida. Revisa los nombres de columna en information_schema.columns.",
  "28P01":
    "Error SQL (28P01): el usuario o la contraseña fueron rechazados. Revisa DB_USER y DB_PASSWORD.",
  "3D000":
    "Error SQL (3D000): la base de datos no existe. Revisa DB_DATABASE.",
  "42601":
    "Error SQL (42601): sintaxis inválida. Solo se permite una única sentencia por consulta.",
  ECONNREFUSED:
    "Error SQL (ECONNREFUSED): no se pudo conectar. DB_HOST y DB_PORT no son alcanzables.",
};

function readCode(err: unknown): string | undefined {
  if (err !== null && typeof err === "object") {
    if ("code" in err) {
      const code = (err as { code?: unknown }).code;
      if (typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code)) return code;
    }
  }
  return undefined;
}

export function toActionableSqlError(err: unknown): string {
  const code = readCode(err);
  if (code !== undefined && Object.hasOwn(MESSAGES, code)) {
    return MESSAGES[code] as string;
  }
  return `Error SQL (${code ?? "desconocido"}). Revisa la sentencia e intenta una consulta más acotada.`;
}
