import pg from "pg";
import { getConnectionConfig, pickSslEnv } from "../engine.js";
import { resolveDbSsl } from "../shared/ssl.js";

const { Pool } = pg;

export type PostgresConfig = ReturnType<typeof getPostgresConfig>;

export function getPostgresConfig(env: NodeJS.ProcessEnv = process.env) {
  return getConnectionConfig(env, "postgres");
}

export function createPool(config: ReturnType<typeof getPostgresConfig>, env: NodeJS.ProcessEnv = process.env) {
  const sslResult = resolveDbSsl(pickSslEnv(env, "postgres"));
  if ("error" in sslResult) {
    throw new Error(sslResult.error);
  }

  const ssl = sslResult.ssl
    ? {
        ca: sslResult.ssl.ca,
        cert: sslResult.ssl.cert,
        key: sslResult.ssl.key,
        rejectUnauthorized: sslResult.ssl.rejectUnauthorized,
      }
    : undefined;

  return new Pool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    max: 5,
    ...(ssl ? { ssl } : {}),
  });
}

export type Pool = pg.Pool;
