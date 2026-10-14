import { z } from "zod";
import { CHARACTER_LIMIT } from "./constants.js";

export const QueryOutputSchema = z
  .object({
    totalCount: z.number().int(),
    count: z.number().int(),
    offset: z.number().int(),
    limit: z.number().int(),
    hasMore: z.boolean(),
    nextOffset: z.number().int().nullable(),
    truncated: z.boolean(),
    rows: z.array(z.record(z.unknown())),
  })
  .strict();

export type QueryOutput = z.infer<typeof QueryOutputSchema>;

export type ResponseFormat = "markdown" | "json";

export interface FormatQueryInput {
  rows: unknown;
  limit: number;
  offset: number;
  responseFormat: ResponseFormat;
}

export interface FormattedQueryResult {
  text: string;
  output: QueryOutput;
}

const TRUNCATION_NOTICE = "\n\nRespuesta truncada. Baja limit o sube offset.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function toPlainRow(value: unknown): Record<string, unknown> {
  const source: Record<string, unknown> =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value };
  const plain: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    const entry = source[key];
    if (typeof entry === "function") continue;
    plain[key] = entry;
  }
  return plain;
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function sanitizeCell(value: unknown): string {
  const raw = typeof value === "bigint" ? value.toString() : String(value);
  return raw.replace(/\|/g, " ").replace(/\r\n|\r|\n/g, " ");
}

function buildMarkdown(output: QueryOutput, firstRowIsPlain: boolean): string {
  if (output.rows.length === 0) {
    return "Sin filas.";
  }
  const lines = [
    "# Resultado",
    "",
    `- Total: ${output.totalCount}`,
    `- Offset: ${output.offset}`,
    `- Filas: ${output.count}`,
  ];
  if (firstRowIsPlain) {
    const columns = Object.keys(output.rows[0] ?? {});
    if (columns.length > 0) {
      lines.push("");
      lines.push(`| ${columns.map(sanitizeCell).join(" | ")} |`);
      lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
      for (const row of output.rows) {
        lines.push(`| ${columns.map((c) => sanitizeCell(row[c])).join(" | ")} |`);
      }
    }
  }
  return lines.join("\n");
}

export function formatQueryResult(input: FormatQueryInput): FormattedQueryResult {
  const { rows, limit, offset, responseFormat } = input;
  const all: unknown[] = Array.isArray(rows) ? rows : [rows];
  const totalCount = all.length;
    const rawPage = all.slice(offset, offset + limit);
  const firstRowIsPlain = rawPage.length > 0 && isPlainObject(rawPage[0]);
  const page = rawPage.map(toPlainRow);
  const count = page.length;
  const hasMore = offset + count < totalCount;

  const base: QueryOutput = {
    totalCount,
    count,
    offset,
    limit,
    hasMore,
    nextOffset: hasMore ? offset + count : null,
    truncated: false,
    rows: page,
  };

  let text =
    responseFormat === "json"
      ? JSON.stringify(base, bigintReplacer, 2)
      : buildMarkdown(base, firstRowIsPlain);

  let truncated = false;
  if (text.length > CHARACTER_LIMIT) {
    text = text.slice(0, CHARACTER_LIMIT) + TRUNCATION_NOTICE;
    truncated = true;
  }

  const output: QueryOutput = JSON.parse(
    JSON.stringify({ ...base, truncated }, bigintReplacer),
  ) as QueryOutput;

  return { text, output };
}
