import { readFileSync } from "node:fs";
import { join } from "node:path";

const xml = readFileSync(join(process.cwd(), "evaluations", "mysql.xml"), "utf8");

function extract(tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  return [...xml.matchAll(re)].map((m) => (m[1] ?? "").trim());
}

describe("evaluations/mysql.xml", () => {
  const pairs = xml.match(/<qa_pair>/g) ?? [];
  const questions = extract("question");
  const answers = extract("answer");

  it("tiene exactamente 10 pares", () => {
    expect(pairs).toHaveLength(10);
    expect(questions).toHaveLength(10);
    expect(answers).toHaveLength(10);
  });

  it("tiene las respuestas esperadas en orden", () => {
    expect(answers).toEqual(["3", "LAMP-A", "74000", "Bruno Díaz", "4", "León", "void", "7", "1", "105"]);
  });

  it("ninguna pregunta contiene sentencias de escritura", () => {
    for (const q of questions) {
      expect(q).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|CALL)\b/i);
    }
  });
});
