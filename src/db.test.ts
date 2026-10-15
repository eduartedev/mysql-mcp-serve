import { createPool, resolveMysqlSsl } from "./db.js";

const INVALID =
  "MYSQL_SSL no es válido. Usa required o déjalo vacío para desactivar TLS.";
const MTLS = "MYSQL_SSL_CERT y MYSQL_SSL_KEY deben definirse juntos para mTLS.";

const pem = (name: string) =>
  `-----BEGIN CERTIFICATE-----\n${name}\n-----END CERTIFICATE-----`;

const calls: string[] = [];
const fakeRead = (path: string) => {
  calls.push(path);
  return pem(path);
};

beforeEach(() => {
  calls.length = 0;
});

describe("resolveMysqlSsl", () => {
  it("sin MYSQL_SSL o vacío no define ssl", () => {
    expect(resolveMysqlSsl({}, fakeRead)).toEqual({});
    expect(resolveMysqlSsl({ MYSQL_SSL: "" }, fakeRead)).toEqual({});
    expect(resolveMysqlSsl({ MYSQL_SSL: "   " }, fakeRead)).toEqual({});
    expect(calls).toEqual([]);
  });

  it("required activa TLS con rejectUnauthorized true y sin ca/cert/key", () => {
    const result = resolveMysqlSsl({ MYSQL_SSL: " required " }, fakeRead);
    expect(result).toEqual({ ssl: { rejectUnauthorized: true } });
  });

  it("solo el valor exacto false desactiva rejectUnauthorized", () => {
    expect(
      resolveMysqlSsl(
        { MYSQL_SSL: "required", MYSQL_SSL_REJECT_UNAUTHORIZED: "false" },
        fakeRead,
      ),
    ).toEqual({ ssl: { rejectUnauthorized: false } });
    expect(
      resolveMysqlSsl(
        { MYSQL_SSL: "required", MYSQL_SSL_REJECT_UNAUTHORIZED: "FALSE" },
        fakeRead,
      ),
    ).toEqual({ ssl: { rejectUnauthorized: true } });
    expect(
      resolveMysqlSsl(
        { MYSQL_SSL: "required", MYSQL_SSL_REJECT_UNAUTHORIZED: "0" },
        fakeRead,
      ),
    ).toEqual({ ssl: { rejectUnauthorized: true } });
  });

  it("preferred o yes devuelven el error de valor no válido", () => {
    expect(resolveMysqlSsl({ MYSQL_SSL: "preferred" }, fakeRead)).toEqual({
      error: INVALID,
    });
    expect(resolveMysqlSsl({ MYSQL_SSL: "yes" }, fakeRead)).toEqual({
      error: INVALID,
    });
  });

  it("lee la CA desde la ruta indicada", () => {
    const result = resolveMysqlSsl(
      { MYSQL_SSL: "required", MYSQL_SSL_CA: "/ca.pem" },
      fakeRead,
    );
    expect(calls).toEqual(["/ca.pem"]);
    expect(result).toEqual({
      ssl: { rejectUnauthorized: true, ca: pem("/ca.pem") },
    });
  });

  it("cert y key juntos habilitan mTLS", () => {
    const result = resolveMysqlSsl(
      {
        MYSQL_SSL: "required",
        MYSQL_SSL_CERT: "/client.pem",
        MYSQL_SSL_KEY: "/client.key",
      },
      fakeRead,
    );
    expect(result).toEqual({
      ssl: {
        rejectUnauthorized: true,
        cert: pem("/client.pem"),
        key: pem("/client.key"),
      },
    });
  });

  it("cert sin key es un error", () => {
    expect(
      resolveMysqlSsl(
        { MYSQL_SSL: "required", MYSQL_SSL_CERT: "/client.pem" },
        fakeRead,
      ),
    ).toEqual({ error: MTLS });
    expect(calls).toEqual([]);
  });

  it("key sin cert es un error", () => {
    expect(
      resolveMysqlSsl(
        { MYSQL_SSL: "required", MYSQL_SSL_KEY: "/client.key" },
        fakeRead,
      ),
    ).toEqual({ error: MTLS });
  });

  it("si la lectura falla el error incluye la ruta y no el contenido", () => {
    const failing = () => {
      throw new Error("ENOENT: contenido-secreto");
    };
    const result = resolveMysqlSsl(
      { MYSQL_SSL: "required", MYSQL_SSL_CA: "/missing.pem" },
      failing,
    );
    expect(result).toEqual({
      error: "No se pudo leer el archivo SSL: /missing.pem",
    });
    expect(JSON.stringify(result)).not.toContain("contenido-secreto");
  });
});

describe("createPool", () => {
  const original = process.env.MYSQL_SSL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MYSQL_SSL;
    } else {
      process.env.MYSQL_SSL = original;
    }
  });

  it("lanza si MYSQL_SSL no es válido", () => {
    process.env.MYSQL_SSL = "preferred";
    expect(() =>
      createPool({ host: "localhost", port: 3306, user: "u", password: "" }),
    ).toThrow(INVALID);
  });
});
