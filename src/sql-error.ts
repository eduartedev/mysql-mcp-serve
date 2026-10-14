const MESSAGES: Record<string, string> = {
  ER_NO_SUCH_TABLE:
    "Error SQL (ER_NO_SUCH_TABLE): la tabla no existe. Ejecuta SHOW TABLES para ver las tablas disponibles.",
  ER_BAD_FIELD_ERROR:
    "Error SQL (ER_BAD_FIELD_ERROR): columna desconocida. Ejecuta DESCRIBE sobre la tabla para ver sus columnas.",
  ER_BAD_DB_ERROR:
    "Error SQL (ER_BAD_DB_ERROR): la base de datos no existe. Revisa el argumento database o ejecuta SHOW DATABASES.",
  ER_PARSE_ERROR:
    "Error SQL (ER_PARSE_ERROR): sintaxis inválida. Solo se permite una única sentencia por consulta; revisa la sintaxis.",
  ER_ACCESS_DENIED_ERROR:
    "Error SQL (ER_ACCESS_DENIED_ERROR): el usuario o la contraseña fueron rechazados. Revisa MYSQL_USER y MYSQL_PASSWORD.",
  ECONNREFUSED:
    "Error SQL (ECONNREFUSED): no se pudo conectar. MYSQL_HOST y MYSQL_PORT no son alcanzables; verifica que MySQL esté en ejecución.",
};

function readCode(err: unknown): string | undefined {
  if (err !== null && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Za-z0-9_]{1,64}$/.test(code)) {
      return code;
    }
  }
  return undefined;
}

/**
 * Convierte un error del driver en un mensaje accionable en español.
 * Nunca incluye stack, mensaje crudo del driver ni variables de entorno:
 * el código del error basta para que el agente corrija la consulta.
 */
export function toActionableSqlError(err: unknown): string {
  const code = readCode(err);
  if (code !== undefined && Object.hasOwn(MESSAGES, code)) {
    return MESSAGES[code] as string;
  }
  return `Error SQL (${code ?? "desconocido"}). Revisa la sentencia e intenta una consulta más acotada.`;
}
