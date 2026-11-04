export type DbEngine = "mysql" | "postgres";

const INVALID_ENGINE =
  "DB_ENGINE no es válido. Usa mysql o postgres, o déjalo vacío (por defecto mysql).";

export function resolveEngine(env: NodeJS.ProcessEnv = process.env): DbEngine {
  const explicit = env.DB_ENGINE?.trim();
  if (explicit !== undefined && explicit !== "") {
    const lower = explicit.toLowerCase();
    if (lower === "mysql" || lower === "postgres") return lower;
    throw new Error(INVALID_ENGINE);
  }
  const port = env.DB_PORT?.trim();
  if (port === "5432") return "postgres";
  if (port === "3306") return "mysql";
  return "mysql";
}

function dialectPrefix(engine: DbEngine): "MYSQL" | "POSTGRES" {
  return engine === "postgres" ? "POSTGRES" : "MYSQL";
}

/** Primer valor no vacío: DB_<field>, luego <DIALECT>_<field>. */
export function pickEnv(
  env: NodeJS.ProcessEnv,
  engine: DbEngine,
  field: string,
): string | undefined {
  const dbKey = `DB_${field}`;
  const vDb = env[dbKey]?.trim();
  if (vDb !== undefined && vDb !== "") return vDb;
  const dialectKey = `${dialectPrefix(engine)}_${field}`;
  const vDialect = env[dialectKey]?.trim();
  if (vDialect !== undefined && vDialect !== "") return vDialect;
  return undefined;
}

export function pickAllowlistRaw(env: NodeJS.ProcessEnv, engine: DbEngine): string | undefined {
  const generic = env.DB_ALLOWED_DATABASES?.trim();
  if (generic) return generic;
  if (engine === "postgres") {
    const pg = env.POSTGRES_ALLOWED_SCHEMAS?.trim();
    if (pg) return pg;
  } else {
    const my = env.MYSQL_ALLOWED_DATABASES?.trim();
    if (my) return my;
  }
  return undefined;
}

export function pickAccessModeRaw(env: NodeJS.ProcessEnv, engine: DbEngine): string | undefined {
  return pickEnv(env, engine, "ACCESS_MODE");
}

export function pickPiiColumnsRaw(env: NodeJS.ProcessEnv, engine: DbEngine): string | undefined {
  return pickEnv(env, engine, "PII_COLUMNS");
}

export function pickPort(env: NodeJS.ProcessEnv, engine: DbEngine): number {
  const raw = pickEnv(env, engine, "PORT");
  if (raw !== undefined) {
    const port = parseInt(raw, 10);
    if (!Number.isNaN(port)) return port;
  }
  return engine === "postgres" ? 5432 : 3306;
}

export function pickSslEnv(env: NodeJS.ProcessEnv, engine: DbEngine) {
  return {
    ssl: pickEnv(env, engine, "SSL"),
    ca: pickEnv(env, engine, "SSL_CA"),
    cert: pickEnv(env, engine, "SSL_CERT"),
    key: pickEnv(env, engine, "SSL_KEY"),
    rejectUnauthorized: pickEnv(env, engine, "SSL_REJECT_UNAUTHORIZED"),
  };
}

export interface ConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
}

export function getConnectionConfig(env: NodeJS.ProcessEnv, engine: DbEngine): ConnectionConfig {
  return {
    host: pickEnv(env, engine, "HOST") ?? "localhost",
    port: pickPort(env, engine),
    user: pickEnv(env, engine, "USER") ?? (engine === "postgres" ? "postgres" : "root"),
    password: pickEnv(env, engine, "PASSWORD") ?? "",
    database: pickEnv(env, engine, "DATABASE"),
  };
}
