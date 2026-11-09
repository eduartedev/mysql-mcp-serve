import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadXml(name: string): string {
  return readFileSync(join(process.cwd(), "evaluations", name), "utf8");
}

function extract(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  return [...xml.matchAll(re)].map((m) => (m[1] ?? "").trim());
}

describe("evaluations/mysql.xml", () => {
  const xml = loadXml("mysql.xml");
  const pairs = xml.match(/<qa_pair>/g) ?? [];
  const questions = extract(xml, "question");
  const answers = extract(xml, "answer");

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

describe("evaluations/postgres.xml", () => {
  const xml = loadXml("postgres.xml");
  const pairs = xml.match(/<qa_pair>/g) ?? [];

  it("tiene exactamente 10 pares", () => {
    expect(pairs).toHaveLength(10);
    expect(extract(xml, "question")).toHaveLength(10);
    expect(extract(xml, "answer")).toHaveLength(10);
  });
});
