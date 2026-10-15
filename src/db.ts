import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";

export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
}

const DEFAULT_PORT = 3306;

export function getMysqlConfig(): MysqlConfig {
  const host = process.env.MYSQL_HOST ?? "localhost";
  const port = parseInt(process.env.MYSQL_PORT ?? String(DEFAULT_PORT), 10);
  const user = process.env.MYSQL_USER ?? "root";
  const password = process.env.MYSQL_PASSWORD ?? "";
  const database = process.env.MYSQL_DATABASE;

  return { host, port, user, password, database };
}

export type SslEnv = {
  MYSQL_SSL?: string;
  MYSQL_SSL_CA?: string;
  MYSQL_SSL_CERT?: string;
  MYSQL_SSL_KEY?: string;
  MYSQL_SSL_REJECT_UNAUTHORIZED?: string;
};

export type SslResolution = { ssl?: mysql.SslOptions } | { error: string };

const SSL_INVALID_ERROR =
  "MYSQL_SSL no es válido. Usa required o déjalo vacío para desactivar TLS.";
const SSL_MTLS_ERROR =
  "MYSQL_SSL_CERT y MYSQL_SSL_KEY deben definirse juntos para mTLS.";

function readPemFile(path: string): string {
  return readFileSync(path, "utf8");
}

export function resolveMysqlSsl(
  env: SslEnv,
  readFile: (path: string) => string = readPemFile,
): SslResolution {
  const mode = (env.MYSQL_SSL ?? "").trim();
  if (mode === "") {
    return {};
  }
  if (mode !== "required") {
    return { error: SSL_INVALID_ERROR };
  }

  const caPath = (env.MYSQL_SSL_CA ?? "").trim();
  const certPath = (env.MYSQL_SSL_CERT ?? "").trim();
  const keyPath = (env.MYSQL_SSL_KEY ?? "").trim();

  if ((certPath === "") !== (keyPath === "")) {
    return { error: SSL_MTLS_ERROR };
  }

  const ssl: mysql.SslOptions = {
    rejectUnauthorized:
      (env.MYSQL_SSL_REJECT_UNAUTHORIZED ?? "").trim() !== "false",
  };

  const files: Array<[keyof mysql.SslOptions, string]> = [
    ["ca", caPath],
    ["cert", certPath],
    ["key", keyPath],
  ];
  for (const [option, path] of files) {
    if (path === "") {
      continue;
    }
    try {
      ssl[option as "ca" | "cert" | "key"] = readFile(path);
    } catch {
      return { error: `No se pudo leer el archivo SSL: ${path}` };
    }
  }

  return { ssl };
}

export function createPool(config: MysqlConfig) {
  const env = process.env;
  const sslResult = resolveMysqlSsl({
    MYSQL_SSL: env.MYSQL_SSL,
    MYSQL_SSL_CA: env.MYSQL_SSL_CA,
    MYSQL_SSL_CERT: env.MYSQL_SSL_CERT,
    MYSQL_SSL_KEY: env.MYSQL_SSL_KEY,
    MYSQL_SSL_REJECT_UNAUTHORIZED: env.MYSQL_SSL_REJECT_UNAUTHORIZED,
  });
  if ("error" in sslResult) {
    throw new Error(sslResult.error);
  }

  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    ...(sslResult.ssl ? { ssl: sslResult.ssl } : {}),
  });
}

export type Pool = mysql.Pool;
