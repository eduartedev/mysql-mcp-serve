import { applyMysqlEnv, loadMysqlEnvFile } from "./load-env.js";

describe("applyMysqlEnv", () => {
  it("rellena solo MYSQL_* que faltan y no pisa las que ya existen", () => {
    const env: NodeJS.ProcessEnv = { MYSQL_USER: "root", MYSQL_PASSWORD: "" };
    applyMysqlEnv(
      [
        "# comentario",
        "",
        "MYSQL_USER=app",
        'MYSQL_PASSWORD="secret"',
        "MYSQL_DATABASE=tienda",
        "OTRO=1",
        "MYSQL_PORT=",
      ].join("\n"),
      env,
    );
    expect(env.MYSQL_USER).toBe("root");
    expect(env.MYSQL_PASSWORD).toBe("");
    expect(env.MYSQL_DATABASE).toBe("tienda");
    expect(env.MYSQL_PORT).toBe("");
    expect(env.OTRO).toBeUndefined();
  });

  it("quita un par de comillas", () => {
    const env: NodeJS.ProcessEnv = {};
    applyMysqlEnv("MYSQL_HOST='localhost'", env);
    expect(env.MYSQL_HOST).toBe("localhost");
  });
});

describe("loadMysqlEnvFile", () => {
  it("un archivo ausente no lanza", () => {
    const env: NodeJS.ProcessEnv = {};
    expect(() =>
      loadMysqlEnvFile(".env", env, () => {
        throw new Error("no está");
      }),
    ).not.toThrow();
    expect(env.MYSQL_USER).toBeUndefined();
  });
});
