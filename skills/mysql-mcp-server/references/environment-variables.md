# Environment variables

Prefer `DB_*`. `MYSQL_*` and `POSTGRES_*` remain as fallbacks; when both are set, `DB_*` wins. Values are read at MCP startup — restart the client after changes. Never put PEM contents or secrets inline in skill files; use paths and client env only.

## Shared / engine (`DB_*`)

| Variable | Default | Notes |
|----------|---------|-------|
| `DB_ENGINE` | autodetect / `mysql` | `mysql` or `postgres`. If unset: port `5432` → postgres, `3306` → mysql |
| `DB_HOST` | `localhost` | Wins over `MYSQL_HOST` / `POSTGRES_HOST` |
| `DB_PORT` | 3306 or 5432 | Also drives autodetect |
| `DB_USER` | `root` / `postgres` | |
| `DB_PASSWORD` | empty | |
| `DB_DATABASE` | optional | Connection database |
| `DB_SCHEMA` | `public` | Postgres only (`search_path` + allowlist default) |
| `DB_ACCESS_MODE` | readonly | Only exact `readwrite` enables writes |
| `DB_ALLOWED_DATABASES` | empty | `name`, `name:ro`, `name:rw`. **Postgres = schemas** |
| `DB_PII_COLUMNS` | empty | Extra columns masked as `***` |
| `DB_SSL` | empty | Only `required` enables TLS |
| `DB_SSL_CA` / `CERT` / `KEY` | optional | PEM **file paths on disk** |
| `DB_SSL_REJECT_UNAUTHORIZED` | true | Only `false` disables verify |

Built-in masked columns: `email`, `correo`, `phone`, `telefono`, `password`, `contrasena`, `ssn`, `nss`, `token`.

## Allowlist behaviour

- Empty / unset: tool may use the configured default DB/schema but cannot switch elsewhere.
- `:ro` rejects writes even if the process is `readwrite`.
- `:rw` does **not** override a readonly process.
- Qualified names (`other.table`) are checked against the allowlist.

## MySQL example

```
DB_ENGINE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=app
DB_PASSWORD=your_password
DB_DATABASE=tienda
DB_ACCESS_MODE=readonly
DB_ALLOWED_DATABASES=tienda,analytics:ro
DB_PII_COLUMNS=dni
```

`MYSQL_*` aliases (`MYSQL_HOST`, `MYSQL_PORT`, …) still work for MySQL/MariaDB-only configs.

## PostgreSQL / RDS example

```
DB_ENGINE=postgres
DB_HOST=your-instance.region.rds.amazonaws.com
DB_PORT=5432
DB_USER=app_readonly
DB_PASSWORD=your_password
DB_DATABASE=app
DB_SCHEMA=public
DB_ACCESS_MODE=readonly
DB_ALLOWED_DATABASES=public,reporting:ro
DB_SSL=required
DB_SSL_CA=C:/path/global-bundle.pem
```

If the port is not `5432`, set `DB_ENGINE=postgres` explicitly.

## TLS notes

- Paths only (PEM on disk). Inline certificate text is rejected.
- With `DB_SSL=required`, `DB_SSL_CA` must exist and be readable when used.
- mTLS needs both `CERT` and `KEY`.
- Pool reads SSL config on first connect; change ⇒ restart MCP.