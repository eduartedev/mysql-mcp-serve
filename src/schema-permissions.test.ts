import { authorizeDatabase, parseAllowlist, type Allowlist } from "./schema-permissions.js";

const INSERT = "INSERT INTO t (id) VALUES (1)";
const UPDATE = "UPDATE t SET x = 1 WHERE id = 1";

describe("parseAllowlist", () => {
  it("undefined y vacío son unset", () => {
    expect(parseAllowlist(undefined)).toEqual({ kind: "unset" });
    expect(parseAllowlist("   ")).toEqual({ kind: "unset" });
  });

  it("interpreta inherit, ro y rw", () => {
    const result = parseAllowlist("app,analytics:ro,logs:rw");
    expect(result.kind).toBe("list");
    if (result.kind !== "list") return;
    expect(result.entries.get("app")).toBe("inherit");
    expect(result.entries.get("analytics")).toBe("ro");
    expect(result.entries.get("logs")).toBe("rw");
  });

  it.each(["app:RO", "app-db", "app.db", "app,,", "app,app:ro"])(
    "%s es inválida",
    (raw) => {
      expect(parseAllowlist(raw)).toEqual({ kind: "invalid" });
    },
  );
});

describe("authorizeDatabase con allowlist unset", () => {
  const allowlist: Allowlist = { kind: "unset" };
  const base = { allowlist, sql: "SELECT 1", mode: "readonly" } as const;

  it("sin requested usa configured y no emite USE", () => {
    expect(authorizeDatabase({ ...base, requested: undefined, configured: "app" })).toEqual({
      ok: true,
      useDatabase: undefined,
    });
  });

  it("requested igual a configured es válido", () => {
    expect(authorizeDatabase({ ...base, requested: "app", configured: "app" })).toEqual({
      ok: true,
      useDatabase: "app",
    });
  });

  it("requested distinto de configured se rechaza", () => {
    const result = authorizeDatabase({ ...base, requested: "other", configured: "app" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("MYSQL_ALLOWED_DATABASES");
  });

  it("requested sin configured se rechaza", () => {
    const result = authorizeDatabase({ ...base, requested: "other", configured: undefined });
    expect(result.ok).toBe(false);
  });
});

describe("authorizeDatabase con lista app, analytics:ro y mode readwrite", () => {
  const allowlist = parseAllowlist("app,analytics:ro");
  const base = { allowlist, mode: "readwrite" } as const;

  it("permite SELECT en analytics", () => {
    const result = authorizeDatabase({
      ...base,
      requested: "analytics",
      configured: undefined,
      sql: "SELECT 1",
    });
    expect(result).toEqual({ ok: true, useDatabase: "analytics" });
  });

  it("rechaza una base fuera de la lista", () => {
    const result = authorizeDatabase({
      ...base,
      requested: "secret",
      configured: undefined,
      sql: "SELECT 1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no está permitida");
  });

  it("rechaza INSERT en analytics (:ro) sin sugerir readwrite", () => {
    const result = authorizeDatabase({
      ...base,
      requested: "analytics",
      configured: undefined,
      sql: INSERT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain(":ro");
      // El mensaje :ro menciona MYSQL_ACCESS_MODE=readwrite solo para aclarar que no basta;
      // no debe ser el mensaje del proceso, que pide definirlo.
      expect(result.error).not.toContain("Define MYSQL_ACCESS_MODE=readwrite");
    }
  });

  it("permite INSERT en app (inherit)", () => {
    const result = authorizeDatabase({
      ...base,
      requested: "app",
      configured: undefined,
      sql: INSERT,
    });
    expect(result).toEqual({ ok: true, useDatabase: "app" });
  });

  it("distingue mayúsculas y minúsculas", () => {
    const result = authorizeDatabase({
      ...base,
      requested: "App",
      configured: undefined,
      sql: "SELECT 1",
    });
    expect(result.ok).toBe(false);
  });

  it("aplica :ro a la base configurada cuando requested se omite", () => {
    const result = authorizeDatabase({
      ...base,
      requested: undefined,
      configured: "analytics",
      sql: UPDATE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(":ro");
    expect("useDatabase" in result && result.useDatabase).toBeFalsy();
  });
});

describe("authorizeDatabase con logs:rw y proceso readonly", () => {
  it("rechaza INSERT con el error del proceso, no el de :ro", () => {
    const result = authorizeDatabase({
      requested: "logs",
      configured: undefined,
      allowlist: parseAllowlist("logs:rw"),
      sql: INSERT,
      mode: "readonly",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("MYSQL_ACCESS_MODE=readwrite");
      expect(result.error).not.toContain("(:ro)");
    }
  });
});

describe("authorizeDatabase con entradas inválidas", () => {
  it("allowlist inválida", () => {
    const result = authorizeDatabase({
      requested: "app",
      configured: undefined,
      allowlist: parseAllowlist("app-db"),
      sql: "SELECT 1",
      mode: "readonly",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("no es válida");
  });

  it("nombre efectivo con guion", () => {
    const result = authorizeDatabase({
      requested: "app-db",
      configured: undefined,
      allowlist: { kind: "unset" },
      sql: "SELECT 1",
      mode: "readonly",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("guion bajo");
  });
});
