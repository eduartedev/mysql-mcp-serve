import { CatalogSchema, prepareCatalog, type CatalogKind } from "./catalog.js";
import { parseAllowlist } from "./schema-permissions.js";

const OBJECT_NAME_ERROR =
  "Nombre de objeto no válido. Solo se permiten letras, números y guion bajo.";

const allowlist = parseAllowlist("tienda,analytics:ro");

function prepare(
  overrides: Partial<{
    kind: CatalogKind;
    name: string | undefined;
    database: string | undefined;
    configured: string | undefined;
    mode: "readonly" | "readwrite";
  }> = {},
) {
  return prepareCatalog({
    kind: "view",
    name: undefined,
    database: "tienda",
    configured: undefined,
    allowlist,
    mode: "readonly",
    ...overrides,
  });
}

describe("prepareCatalog", () => {
  it("vista con nombre: placeholders y parámetros, sin nombre ni base en el SQL", () => {
    const result = prepare({ kind: "view", name: "clientes_activos", database: "tienda" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sql).toContain("information_schema.VIEWS");
    expect(result.sql).toContain("TABLE_NAME = ?");
    expect(result.sql).not.toContain("clientes_activos");
    expect(result.sql).not.toContain("tienda");
    expect(result.params).toEqual(["tienda", "clientes_activos"]);
  });

  it("vista sin nombre ni database usa configured y lista todo", () => {
    const result = prepare({ kind: "view", name: undefined, database: undefined, configured: "tienda" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params).toEqual(["tienda"]);
    expect(result.sql).not.toContain("TABLE_NAME = ?");
  });

  it("trigger con nombre usa information_schema.TRIGGERS", () => {
    const result = prepare({ kind: "trigger", name: "trg_audit" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sql).toContain("information_schema.TRIGGERS");
    expect(result.sql).toContain("TRIGGER_NAME = ?");
    expect(result.sql).not.toContain("trg_audit");
    expect(result.params).toEqual(["tienda", "trg_audit"]);
  });

  it("función con nombre filtra por FUNCTION y no menciona PROCEDURE", () => {
    const result = prepare({ kind: "function", name: "calcular_iva" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sql).toContain("ROUTINE_TYPE = 'FUNCTION'");
    expect(result.sql).toContain("ROUTINE_NAME = ?");
    expect(result.sql).not.toContain("PROCEDURE");
    expect(result.sql).not.toContain("calcular_iva");
  });

  it("procedimiento sin nombre filtra por PROCEDURE y lista todo", () => {
    const result = prepare({ kind: "procedure", name: undefined });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sql).toContain("ROUTINE_TYPE = 'PROCEDURE'");
    expect(result.sql).not.toContain("ROUTINE_NAME = ?");
    expect(result.params).toEqual(["tienda"]);
  });

  it.each(["clientes-activos", "clientes activos", "tienda.v"])(
    "rechaza el nombre %s",
    (name) => {
      const result = prepare({ name });
      expect(result).toEqual({ ok: false, error: OBJECT_NAME_ERROR });
      expect("sql" in result).toBe(false);
    },
  );

  it("rechaza una base fuera de la allowlist con el error de authorizeDatabase", () => {
    const result = prepare({ database: "otra" });
    expect(result).toEqual({
      ok: false,
      error: "La base no está permitida por MYSQL_ALLOWED_DATABASES.",
    });
  });

  it("una base :ro se puede leer aunque el proceso sea readwrite", () => {
    const result = prepare({ database: "analytics", mode: "readwrite" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.params).toEqual(["analytics"]);
  });

  it("sin configured ni database exige MYSQL_DATABASE", () => {
    const result = prepare({ database: undefined, configured: undefined });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("MYSQL_DATABASE");
  });

  it("sin allowlist y sin base devuelve el error de base faltante", () => {
    const result = prepareCatalog({
      kind: "view",
      name: undefined,
      database: undefined,
      configured: undefined,
      allowlist: parseAllowlist(undefined),
      mode: "readonly",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("MYSQL_DATABASE");
  });
});

describe("CatalogSchema", () => {
  it("rechaza un kind desconocido", () => {
    expect(CatalogSchema.safeParse({ kind: "table" }).success).toBe(false);
  });

  it("rechaza propiedades extra", () => {
    expect(CatalogSchema.safeParse({ kind: "view", extra: 1 }).success).toBe(false);
  });

  it("rechaza un name inválido", () => {
    expect(CatalogSchema.safeParse({ kind: "view", name: "a-b" }).success).toBe(false);
  });

  it("acepta { kind: 'view' } con valores por defecto", () => {
    const parsed = CatalogSchema.safeParse({ kind: "view" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.limit).toBe(20);
    expect(parsed.data.offset).toBe(0);
    expect(parsed.data.response_format).toBe("markdown");
  });
});
