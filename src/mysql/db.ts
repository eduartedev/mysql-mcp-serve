import mysql from "mysql2/promise";
import { getConnectionConfig, pickSslEnv } from "../engine.js";
import { resolveDbSsl } from "../shared/ssl.js";

export type MysqlConfig = ReturnType<typeof getMysqlConfig>;

export function getMysqlConfig(env: NodeJS.ProcessEnv = process.env) {
  return getConnectionConfig(env, "mysql");
}

export function createPool(config: ReturnType<typeof getMysqlConfig>, env: NodeJS.ProcessEnv = process.env) {
  const sslResult = resolveDbSsl(pickSslEnv(env, "mysql"));
  if ("error" in sslResult) {
    throw new Error(sslResult.error);
  }

  const mysqlSsl = sslResult.ssl
    ? {
        ca: sslResult.ssl.ca,
        cert: sslResult.ssl.cert,
        key: sslResult.ssl.key,
        rejectUnauthorized: sslResult.ssl.rejectUnauthorized,
      }
    : undefined;

  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    ...(mysqlSsl ? { ssl: mysqlSsl } : {}),
  });
}

export type Pool = mysql.Pool;
