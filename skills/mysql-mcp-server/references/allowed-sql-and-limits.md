# Allowed SQL and limits

Applies to `@eduartedev/mysql-mcp-server` tools. Engine-specific dialect differences exist; the security model is the same.

## Tools

| Engine | Query | Catalog |
|--------|-------|---------|
| MySQL/MariaDB | `mysql_query` | `mysql_catalog` |
| PostgreSQL | `postgres_query` | `postgres_catalog` |

### Query args

| Arg | Notes |
|-----|-------|
| `query` | Single statement |
| `database` / `schema` | MySQL uses `database`; Postgres uses `schema` (`search_path`) |
| `limit` | Default 20, max 100 |
| `offset` | Default 0, max 100000 |
| `response_format` | `markdown` (default) or `json` |

### Catalog args

| Arg | Notes |
|-----|-------|
| `kind` | `view`, `trigger`, `function`, `procedure` |
| `name` | Optional; letters, numbers, underscore only. Bound as a parameter — never concatenated into SQL |
| `database` / `schema` | Must be allowlisted when switching |

## Allowed commands (MySQL-oriented surface)

| Type | Commands |
|------|----------|
| Read | `SELECT`, `WITH`, `SHOW`, `DESCRIBE` / `DESC`, `EXPLAIN`, `ANALYZE`, `CHECK`, `CHECKSUM` |
| Write | `INSERT`; `UPDATE` / `DELETE` (require a real `WHERE`) |

Postgres supports the same read/write intent (`SELECT`/`WITH`/`EXPLAIN`/`INSERT`/`UPDATE`/`DELETE`) with Postgres dialect checks; DDL and admin paths stay blocked.

## Pagination / response caps

- `SELECT` without its own `LIMIT` gets server-side `LIMIT offset, count` (MySQL) or equivalent paging.
- Structured fields: `totalCount`, `count`, `offset`, `limit`, `hasMore`, `nextOffset`, `truncated`, `rows`.
- Text longer than **25000** characters is truncated and marked `truncated`.

## Writes

- Process must be `DB_ACCESS_MODE=readwrite` (or `MYSQL_ACCESS_MODE=readwrite`).
- Allowlist `:ro` still blocks writes.
- Always-true `WHERE` rejected (`1=1`, `TRUE`, `'a'='a'`, `OR 1=1`, …).
- MySQL enables `sql_safe_updates` before `UPDATE`/`DELETE`.

## Blocked

- Multi-statement queries
- DDL / destructive: `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `REPLACE`, `RENAME`, `GRANT`, `REVOKE`, `LOAD DATA`, `FLUSH`, `RESET`, `PREPARE`, …
- Sensitive `SHOW` (MySQL): `SHOW GRANTS`, `SHOW VARIABLES`, `SHOW PROCESSLIST`, replication/binary log status, …
- Dangerous functions (MySQL): `SLEEP()`, `BENCHMARK()`, `LOAD_FILE()`, `INTO OUTFILE` / `DUMPFILE`
- Catalog tools only read metadata — no `CALL` / `CREATE`

## PII

Columns `email`, `correo`, `phone`, `telefono`, `password`, `contrasena`, `ssn`, `nss`, `token`, plus `DB_PII_COLUMNS` / `MYSQL_PII_COLUMNS`, are returned as `***` in text and `structuredContent`. Masking is by column name, not by inspecting free-text values.