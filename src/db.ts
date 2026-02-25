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

export function createPool(config: MysqlConfig) {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });
}

export type Pool = mysql.Pool;
