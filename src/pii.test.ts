import { formatQueryResult } from "./format-result.js";
import { isPiiColumn, parsePiiColumns } from "./pii.js";

const defaults = parsePiiColumns(undefined);

describe("isPiiColumn con nombres por defecto", () => {
  it.each([
    "email",
    "Email",
    "user_email",
    "customerEmail",
    "Teléfono",
    "contraseña",
    "password_hash",
    "ssn",
    "nss",
    "token",
    "email_verified",
    "e_mail",
    "passwd",
  ])("enmascara %s", (column) => {
    expect(isPiiColumn(column, defaults)).toBe(true);
  });

  it.each(["tokenizer", "phones", "name", "notes", "id"])(
    "no enmascara %s",
    (column) => {
      expect(isPiiColumn(column, defaults)).toBe(false);
    },
  );
});

describe("parsePiiColumns", () => {
  it("devuelve solo los nombres integrados si no hay valor", () => {
    for (const raw of [undefined, "  "]) {
      const names = parsePiiColumns(raw);
      expect(names.has("email")).toBe(true);
      expect(names.has("dni")).toBe(false);
    }
  });

  it("agrega nombres personalizados e ignora tokens vacíos", () => {
    const names = parsePiiColumns("dni, curp,");
    expect(names.has("dni")).toBe(true);
    expect(names.has("curp")).toBe(true);
  });

  it("ignora solo el token inválido", () => {
    const names = parsePiiColumns("bad name, rfc");
    expect(names.has("rfc")).toBe(true);
    expect(names.has("email")).toBe(true);
    expect(names.has("bad")).toBe(false);
    expect(names.has("name")).toBe(false);
  });

  it("trata un token con guion bajo como una sola entrada", () => {
    const names = parsePiiColumns("correo_electronico");
    expect(isPiiColumn("correo_electronico", names)).toBe(true);
    expect(isPiiColumn("electronico", names)).toBe(false);
  });
});

describe("formatQueryResult con enmascaramiento", () => {
  const row = { email: "ana@tienda.example", notes: "ana@tienda.example", id: 1 };

  it("enmascara en structuredContent y en markdown", () => {
    const { text, output } = formatQueryResult({
      rows: [row],
      limit: 20,
      offset: 0,
      responseFormat: "markdown",
    });
    expect(output.rows[0]?.email).toBe("***");
    expect(output.rows[0]?.notes).toBe("ana@tienda.example");
    expect(output.rows[0]?.id).toBe(1);
    expect(text).toContain("email");
    expect(text).toContain("| *** | ana@tienda.example | 1 |");
    expect(text.split("ana@tienda.example")).toHaveLength(2);
  });

  it("enmascara el alias de una columna sensible", () => {
    const { output } = formatQueryResult({
      rows: [{ e: "ana@tienda.example" }],
      limit: 20,
      offset: 0,
      responseFormat: "json",
      sql: "SELECT email AS e FROM users",
    });
    expect(output.rows[0]?.e).toBe("***");
  });

  it("no enmascara el alias de la tabla", () => {
    const { output } = formatQueryResult({
      rows: [{ name: "ana" }],
      limit: 20,
      offset: 0,
      responseFormat: "json",
      sql: "SELECT name FROM users AS u",
    });
    expect(output.rows[0]?.name).toBe("ana");
  });

  it("enmascara en el JSON de texto", () => {
    const { text } = formatQueryResult({
      rows: [row],
      limit: 20,
      offset: 0,
      responseFormat: "json",
    });
    const parsed = JSON.parse(text) as { rows: Record<string, unknown>[] };
    expect(parsed.rows[0]?.email).toBe("***");
  });

  it("enmascara null", () => {
    const { output } = formatQueryResult({
      rows: [{ email: null }],
      limit: 20,
      offset: 0,
      responseFormat: "markdown",
    });
    expect(output.rows[0]?.email).toBe("***");
  });

  it("enmascara un bigint en password y conserva el de id", () => {
    const masked = formatQueryResult({
      rows: [{ password: 9007199254740993n }],
      limit: 20,
      offset: 0,
      responseFormat: "json",
    });
    expect(masked.output.rows[0]?.password).toBe("***");

    const plain = formatQueryResult({
      rows: [{ id: 9007199254740993n }],
      limit: 20,
      offset: 0,
      responseFormat: "json",
    });
    expect(plain.output.rows[0]?.id).toBe("9007199254740993");
  });

  it("no enmascara el resultado de una escritura", () => {
    const { output } = formatQueryResult({
      rows: { affectedRows: 1, insertId: 9 },
      limit: 20,
      offset: 0,
      responseFormat: "markdown",
    });
    expect(output.rows[0]).toEqual({ affectedRows: 1, insertId: 9 });
  });

  it("no altera totalCount", () => {
    const { output } = formatQueryResult({
      rows: [{ email: "a@x.example" }, { email: "b@x.example" }],
      limit: 20,
      offset: 0,
      responseFormat: "markdown",
    });
    expect(output.totalCount).toBe(2);
  });

  it("aplica nombres extra de MYSQL_PII_COLUMNS", () => {
    const { output } = formatQueryResult({
      rows: [{ user_dni: "123", notes: "123" }],
      limit: 20,
      offset: 0,
      responseFormat: "markdown",
      piiColumns: parsePiiColumns("dni"),
    });
    expect(output.rows[0]?.user_dni).toBe("***");
    expect(output.rows[0]?.notes).toBe("123");
  });
});
