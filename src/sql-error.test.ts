import { toActionableSqlError } from "./sql-error.js";

function driverError(code: string, message = "driver message"): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

describe("toActionableSqlError", () => {
  it("ER_NO_SUCH_TABLE sugiere SHOW TABLES", () => {
    const msg = toActionableSqlError(driverError("ER_NO_SUCH_TABLE"));
    expect(msg).toContain("SHOW TABLES");
    expect(msg).toContain("ER_NO_SUCH_TABLE");
    expect(msg).not.toContain("at ");
  });

  it("ER_BAD_FIELD_ERROR sugiere DESCRIBE", () => {
    expect(toActionableSqlError(driverError("ER_BAD_FIELD_ERROR"))).toContain("DESCRIBE");
  });

  it("ER_BAD_DB_ERROR sugiere SHOW DATABASES", () => {
    expect(toActionableSqlError(driverError("ER_BAD_DB_ERROR"))).toContain("SHOW DATABASES");
  });

  it("ER_PARSE_ERROR menciona una única sentencia", () => {
    expect(toActionableSqlError(driverError("ER_PARSE_ERROR"))).toContain("única sentencia");
  });

  it("ER_ACCESS_DENIED_ERROR no filtra la contraseña del mensaje", () => {
    const msg = toActionableSqlError(
      driverError("ER_ACCESS_DENIED_ERROR", "Access denied for user 'u' (using password: s3cret-password)"),
    );
    expect(msg).not.toContain("s3cret-password");
    expect(msg).toContain("ER_ACCESS_DENIED_ERROR");
  });

  it("ECONNREFUSED menciona MYSQL_HOST", () => {
    expect(toActionableSqlError(driverError("ECONNREFUSED"))).toContain("MYSQL_HOST");
  });

  it("no filtra líneas de stack", () => {
    const err = driverError("ER_UNKNOWN_THING", "boom\n    at secret (C:\\private\\file.js:1:1)");
    err.stack = "Error: boom\n    at secret (C:\\private\\file.js:1:1)";
    const msg = toActionableSqlError(err);
    expect(msg).not.toMatch(/^\s*at /m);
    expect(msg).not.toContain("private");
  });

  it("un código desconocido no incluye el mensaje del driver", () => {
    const msg = toActionableSqlError(driverError("ER_WEIRD", "SELECT secret FROM /var/lib/x"));
    expect(msg).toContain("ER_WEIRD");
    expect(msg).not.toContain("/var/lib/x");
  });

  it("un valor no-Error devuelve la frase de código desconocido", () => {
    expect(toActionableSqlError("boom")).toBe(
      "Error SQL (desconocido). Revisa la sentencia e intenta una consulta más acotada.",
    );
  });
});
