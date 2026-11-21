---
name: mysql-mcp-server
description: >
  Use when connecting an agent to MySQL, MariaDB, or PostgreSQL via MCP;
  configuring @eduartedev/mysql-mcp-server; discovering schema; running safe
  paginated queries; or enabling guarded writes. Triggers include mysql mcp,
  postgres mcp, mysql_query, postgres_query, PII masking, DB_ACCESS_MODE.
---

# mysql-mcp-server

Guide agents that use `@eduartedev/mysql-mcp-server` to configure MCP safely, discover schema first, then query with pagination and guardrails.

## Progressive disclosure

| Need | Open |
|------|------|
| Env vars / TLS / allowlist | `references/environment-variables.md` |
| Allowed SQL, caps, blocked ops | `references/allowed-sql-and-limits.md` |
| Cursor MCP JSON samples | `examples/mcp-config.example.json` |
| Discovery → query → write flow | `examples/query-workflows.md` |
| Full product docs | `README.md` / `README.es.md` |

## Rules

1. Prefer `DB_*` keys. Treat `MYSQL_*` / `POSTGRES_*` as fallbacks (`DB_*` wins).
2. Never put real passwords, PEM contents, or tokens in chat or skill files. Use client env / `.env` on disk.
3. Default to `DB_ACCESS_MODE=readonly`. Enable writes only if the user explicitly asks.
4. Prefer `npx -y @eduartedev/mysql-mcp-server` unless the user is developing the package locally.
5. After any MCP env change, tell the user to restart / reload MCP.
6. Do not use the `mysql`/`psql` shell for routine work when the MCP tools are available.

## Engine and tools

| Engine | How selected | Query | Catalog | Scope arg |
|--------|--------------|-------|---------|-----------|
| MySQL/MariaDB | `DB_ENGINE=mysql` or port `3306` | `mysql_query` | `mysql_catalog` | `database` |
| PostgreSQL | `DB_ENGINE=postgres` or port `5432` | `postgres_query` | `postgres_catalog` | `schema` |

## Workflow

1. **Configure** — Propose the smallest env block from `references/environment-variables.md`.
2. **Discover** — List tables / describe columns / use catalog tools before complex SQL.
3. **Query** — Prefer read-only statements. Paginate with `limit`/`offset`; if `hasMore`, use `nextOffset`.
4. **Write (optional)** — Only after explicit user confirmation and `DB_ACCESS_MODE=readwrite`.