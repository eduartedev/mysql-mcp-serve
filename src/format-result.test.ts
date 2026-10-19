import { CHARACTER_LIMIT } from "./constants.js";
import { formatQueryResult, QueryOutputSchema } from "./format-result.js";
import { QuerySchema } from "./query-schema.js";

const fiveRows = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `n${i + 1}` }));

describe("formatQueryResult", () => {
  it("pagina la primera página", () => {
    const { output } = formatQueryResult({
      rows: fiveRows,
      limit: 2,
      offset: 0,
      responseFormat: "markdown",
    });
    expect(output.count).toBe(2);
    expect(output.totalCount).toBe(5);
    expect(output.hasMore).toBe(true);
    expect(output.nextOffset).toBe(2);
  });

  it("pagina la última página", () => {
    const { output } = formatQueryResult({
      rows: fiveRows,
      limit: 2,
      offset: 4,
      responseFormat: "markdown",
    });
    expect(output.count).toBe(1);
    expect(output.hasMore).toBe(false);
    expect(output.nextOffset).toBeNull();
  });

  it("offset fuera de rango devuelve Sin filas.", () => {
    const { output, text } = formatQueryResult({
      rows: fiveRows,
      limit: 2,
      offset: 10,
      responseFormat: "markdown",
    });
    expect(output.count).toBe(0);
    expect(output.hasMore).toBe(false);
    expect(text).toBe("Sin filas.");
  });

  it("markdown incluye encabezado y nombre de columna", () => {
    const { text } = formatQueryResult({
      rows: fiveRows,
      limit: 2,
      offset: 0,
      responseFormat: "markdown",
    });
    expect(text).toContain("Resultado");
    expect(text).toContain("name");
  });

  it("markdown reemplaza | y saltos de línea en celdas", () => {
    const { text } = formatQueryResult({
      rows: [{ v: "a|b\nc" }],
      limit: 20,
      offset: 0,
      responseFormat: "markdown",
    });
    expect(text).toContain("| a b c |");
  });

  it("json produce texto parseable con hasMore", () => {
    const { text } = formatQueryResult({
      rows: fiveRows,
      limit: 2,
      offset: 0,
      responseFormat: "json",
    });
    const parsed = JSON.parse(text) as { hasMore: boolean };
    expect(parsed.hasMore).toBe(true);
  });

  it("trunca cuando el texto supera CHARACTER_LIMIT", () => {
    const big = [{ blob: "x".repeat(CHARACTER_LIMIT + 100) }];
    const { output, text } = formatQueryResult({
      rows: big,
      limit: 20,
      offset: 0,
      responseFormat: "markdown",
    });
    expect(output.truncated).toBe(true);
    expect(output.rows).toEqual([]);
    expect(text).toContain("Respuesta truncada");
  });

  it("no marca truncated en respuestas pequeñas", () => {
    const { output } = formatQueryResult({
      rows: fiveRows,
      limit: 20,
      offset: 0,
      responseFormat: "json",
    });
    expect(output.truncated).toBe(false);
  });

  it("serializa bigint como cadena decimal sin lanzar", () => {
    const rows = [{ big: 9007199254740993n }];
    let result: ReturnType<typeof formatQueryResult> | undefined;
    expect(() => {
      result = formatQueryResult({ rows, limit: 20, offset: 0, responseFormat: "json" });
    }).not.toThrow();
    expect(result?.text).toContain('"9007199254740993"');
    expect(result?.output.rows[0]?.big).toBe("9007199254740993");
    expect(() => JSON.stringify(result?.output)).not.toThrow();
  });

  it("convierte una cabecera no-array en una fila plana", () => {
    const { output } = formatQueryResult({
      rows: { affectedRows: 1, insertId: 9 },
      limit: 20,
      offset: 0,
      responseFormat: "markdown",
    });
    expect(output.totalCount).toBe(1);
    expect(output.rows).toEqual([{ affectedRows: 1, insertId: 9 }]);
  });

  it("descarta propiedades función y acepta el outputSchema", () => {
    class Header {
      affectedRows = 2;
      helper = () => 1;
    }
    const { output } = formatQueryResult({
      rows: new Header(),
      limit: 20,
      offset: 0,
      responseFormat: "json",
    });
    expect(output.rows).toEqual([{ affectedRows: 2 }]);
    expect(QueryOutputSchema.safeParse(output).success).toBe(true);
  });

  it("muestra affectedRows e insertId de una instancia en markdown", () => {
    class Header {
      affectedRows = 1;
      insertId = 7;
    }
    const { text } = formatQueryResult({
      rows: new Header(),
      limit: 20,
      offset: 0,
      responseFormat: "markdown",
    });
    expect(text).toContain("affectedRows");
    expect(text).toContain("insertId");
    expect(text).toContain("| 1 | 7 |");
  });

  it("con paged no vuelve a saltar el offset", () => {
    const { output } = formatQueryResult({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
      limit: 2,
      offset: 10,
      responseFormat: "json",
      paged: true,
    });
    expect(output.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(output.offset).toBe(10);
    expect(output.hasMore).toBe(true);
    expect(output.nextOffset).toBe(12);
    expect(output.totalCount).toBe(13);
  });
});

describe("QuerySchema", () => {
  it("aplica valores por defecto", () => {
    const parsed = QuerySchema.parse({ query: "SELECT 1" });
    expect(parsed.limit).toBe(20);
    expect(parsed.offset).toBe(0);
    expect(parsed.response_format).toBe("markdown");
  });

  it("rechaza propiedades extra (strict)", () => {
    expect(QuerySchema.safeParse({ query: "SELECT 1", extra: true }).success).toBe(false);
  });

  it.each([0, 101])("rechaza limit %i", (limit) => {
    expect(QuerySchema.safeParse({ query: "SELECT 1", limit }).success).toBe(false);
  });

  it("rechaza response_format xml", () => {
    expect(QuerySchema.safeParse({ query: "SELECT 1", response_format: "xml" }).success).toBe(false);
  });

  it("rechaza offset negativo", () => {
    expect(QuerySchema.safeParse({ query: "SELECT 1", offset: -1 }).success).toBe(false);
  });
});
