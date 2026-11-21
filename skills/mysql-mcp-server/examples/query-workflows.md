# Query workflows

Follow discovery → query → (optional) write. Prefer MCP tools over shell clients.

## 1) Schema discovery (MySQL)

```text
User: Show tables in inventory and describe products.
Agent:
  1. mysql_query: SHOW TABLES  (database=inventory if needed)
  2. mysql_query: DESCRIBE products
  3. Report with Summary / Findings / Data sample / Next steps
```

Optional deeper logic:

```text
mysql_catalog kind=trigger name=  database=inventory
mysql_catalog kind=view name=products_view
```

## 2) Paginated SELECT

```text
mysql_query / postgres_query:
  query: SELECT id, sku, name, price FROM products ORDER BY id
  limit: 20
  offset: 0
```

If `hasMore` is true, call again with `offset: nextOffset` until done or the user stops.

Keep pages small; do not raise `limit` past 100.

## 3) PostgreSQL schema scope

```text
postgres_query:
  schema: reporting
  query: SELECT * FROM daily_sales ORDER BY day DESC
  limit: 20
```

Use `postgres_catalog` for views/triggers/functions/procedures via `pg_catalog`.

## 4) Guarded write (only if user asks)

Preconditions:

- User explicitly requested a write
- MCP env has `DB_ACCESS_MODE=readwrite` and MCP was restarted
- Target DB/schema is not `:ro` on the allowlist

```text
UPDATE products SET status = 'active' WHERE id = 42
DELETE FROM products WHERE id = 42 AND status = 'deleted'
```

Never propose `WHERE 1=1` / `WHERE TRUE`. Preview with `SELECT` first when destructive.

## 5) Failure handling

| Symptom | Check |
|---------|-------|
| Connection refused | `DB_HOST` / `DB_PORT`, DB process up |
| Database/schema not allowed | `DB_ALLOWED_DATABASES` |
| Write rejected | mode readonly, `:ro` allowlist, missing `WHERE` |
| TLS / RDS errors | `DB_SSL=required`, `DB_SSL_CA` path exists |
| Truncated text | raise pagination; respect 25000 char text cap |

## Anti-patterns

- Running `mysql` / `psql` CLI for routine SELECT when MCP is configured
- Guessing columns without `DESCRIBE` / information_schema / catalog
- Dumping unbounded result sets into chat
- Enabling write mode “just in case”