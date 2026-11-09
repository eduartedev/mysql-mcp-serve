import { createPool } from "./mysql/db.js";
import { resolveDbSsl } from "./shared/ssl.js";

const INVALID =
  "DB_SSL no es válido. Usa required o déjalo vacío para desactivar TLS.";
const MTLS = "DB_SSL_CERT y DB_SSL_KEY deben definirse juntos para mTLS.";

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

describe("resolveDbSsl", () => {
  it("sin MYSQL_SSL o vacío no define ssl", () => {
    expect(resolveDbSsl({}, fakeRead)).toEqual({});
    expect(resolveDbSsl({ ssl: "" }, fakeRead)).toEqual({});
    expect(resolveDbSsl({ ssl: "   " }, fakeRead)).toEqual({});
    expect(calls).toEqual([]);
  });

  it("required activa TLS con rejectUnauthorized true y sin ca/cert/key", () => {
    const result = resolveDbSsl({ ssl: " required " }, fakeRead);
    expect(result).toEqual({ ssl: { rejectUnauthorized: true } });
  });

  it("solo el valor exacto false desactiva rejectUnauthorized", () => {
    expect(
      resolveDbSsl(
        { ssl: "required", rejectUnauthorized: "false" },
        fakeRead,
      ),
    ).toEqual({ ssl: { rejectUnauthorized: false } });
    expect(
      resolveDbSsl(
        { ssl: "required", rejectUnauthorized: "FALSE" },
        fakeRead,
      ),
    ).toEqual({ ssl: { rejectUnauthorized: true } });
    expect(
      resolveDbSsl(
        { ssl: "required", rejectUnauthorized: "0" },
        fakeRead,
      ),
    ).toEqual({ ssl: { rejectUnauthorized: true } });
  });

  it("preferred o yes devuelven el error de valor no válido", () => {
    expect(resolveDbSsl({ ssl: "preferred" }, fakeRead)).toEqual({
      error: INVALID,
    });
    expect(resolveDbSsl({ ssl: "yes" }, fakeRead)).toEqual({
      error: INVALID,
    });
  });

  it("lee la CA desde la ruta indicada", () => {
    const result = resolveDbSsl(
      { ssl: "required", ca: "/ca.pem" },
      fakeRead,
    );
    expect(calls).toEqual(["/ca.pem"]);
    expect(result).toEqual({
      ssl: { rejectUnauthorized: true, ca: pem("/ca.pem") },
    });
  });

  it("cert y key juntos habilitan mTLS", () => {
    const result = resolveDbSsl(
      {
        ssl: "required",
        cert: "/client.pem",
        key: "/client.key",
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
      resolveDbSsl(
        { ssl: "required", cert: "/client.pem" },
        fakeRead,
      ),
    ).toEqual({ error: MTLS });
    expect(calls).toEqual([]);
  });

  it("key sin cert es un error", () => {
    expect(
      resolveDbSsl(
        { ssl: "required", key: "/client.key" },
        fakeRead,
      ),
    ).toEqual({ error: MTLS });
  });

  it("si la lectura falla el error incluye la ruta y no el contenido", () => {
    const failing = () => {
      throw new Error("ENOENT: contenido-secreto");
    };
    const result = resolveDbSsl(
      { ssl: "required", ca: "/missing.pem" },
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
