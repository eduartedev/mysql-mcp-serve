import { z } from "zod";
import { DEFAULT_PAGE_LIMIT, MAX_OFFSET, MAX_PAGE_LIMIT } from "./constants.js";

export const QuerySchema = z
  .object({
    query: z
      .string()
      .min(1, "query es obligatoria")
      .max(16 * 1024)
      .describe(
        "Una sola sentencia. Lectura: SELECT, WITH, SHOW, DESCRIBE, EXPLAIN, ANALYZE, CHECK, CHECKSUM. Escritura: INSERT, o UPDATE/DELETE con WHERE.",
      ),
    database: z
      .string()
      .optional()
      .describe("Base a seleccionar con USE antes de ejecutar. Opcional si MYSQL_DATABASE ya está definida."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_LIMIT)
      .default(DEFAULT_PAGE_LIMIT)
      .describe("Filas de esta página. Entre 1 y 100. Por defecto 20."),
    offset: z
      .number()
      .int()
      .min(0)
      .max(MAX_OFFSET)
      .default(0)
      .describe("Filas a saltar antes de esta página. Entre 0 y 100000. Por defecto 0."),
    response_format: z
      .enum(["markdown", "json"])
      .default("markdown")
      .describe("markdown para lectura humana, json para datos estructurados."),
  })
  .strict();

export type QueryInput = z.infer<typeof QuerySchema>;
