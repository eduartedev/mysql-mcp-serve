import { resolveEngine, pickEnv, pickAllowlistRaw } from "./engine.js";

describe("resolveEngine", () => {
  it("default mysql sin pistas", () => {
    expect(resolveEngine({})).toBe("mysql");
  });

  it("DB_ENGINE explícito", () => {
    expect(resolveEngine({ DB_ENGINE: "postgres" })).toBe("postgres");
    expect(resolveEngine({ DB_ENGINE: "MySQL" })).toBe("mysql");
  });

  it("autodetect por DB_PORT", () => {
    expect(resolveEngine({ DB_PORT: "5432" })).toBe("postgres");
    expect(resolveEngine({ DB_PORT: "3306" })).toBe("mysql");
    expect(resolveEngine({ DB_PORT: "5433" })).toBe("mysql");
  });

  it("DB_ENGINE gana al puerto", () => {
    expect(resolveEngine({ DB_ENGINE: "postgres", DB_PORT: "3306" })).toBe("postgres");
  });

  it("valor inválido lanza", () => {
    expect(() => resolveEngine({ DB_ENGINE: "sqlite" })).toThrow(/DB_ENGINE/);
  });
});

describe("pickEnv", () => {
  it("DB_* gana sobre MYSQL_*", () => {
    const env = { DB_HOST: "db", MYSQL_HOST: "my" };
    expect(pickEnv(env, "mysql", "HOST")).toBe("db");
  });

  it("MYSQL_* de respaldo", () => {
    expect(pickEnv({ MYSQL_HOST: "my" }, "mysql", "HOST")).toBe("my");
  });
});

describe("pickAllowlistRaw", () => {
  it("DB_ALLOWED_DATABASES gana", () => {
    expect(
      pickAllowlistRaw(
        { DB_ALLOWED_DATABASES: "a", POSTGRES_ALLOWED_SCHEMAS: "b" },
        "postgres",
      ),
    ).toBe("a");
  });
});
