# mysql-mcp-server

MCP server for querying and controlled modification of a local MySQL database. Designed for use from Cursor or another MCP client.

**Languages:** [English](README.md) · [Español](README.es.md)

## Requirements

- Node.js >= 18
- Accessible MySQL (e.g. Laragon, XAMPP, or a standalone MySQL install)

## Installation

```bash
npm install
```

## Configuration

Connection is configured via environment variables. On startup, a `.env` file in the working directory is loaded (not committed to Git). Only `MYSQL_*` keys that are not already set in the process environment are applied.

| Variable         | Default | Description |
|------------------|---------|-------------|
| `MYSQL_HOST`     | localhost | MySQL server host |
| `MYSQL_PORT`     | 3306 | Port |
| `MYSQL_USER`     | root | Username |
| `MYSQL_PASSWORD` | (empty) | Password |
| `MYSQL_DATABASE` | (optional) | Default database |
| `MYSQL_ACCESS_MODE` | readonly | Only the exact value `readwrite` enables `INSERT`, `UPDATE`, and `DELETE`. Any other value, or an unset variable, is read-only |
| `MYSQL_ALLOWED_DATABASES` | (empty) | Empty or unset: the tool may use `MYSQL_DATABASE` but cannot switch to another database. Comma-separated list of `name`, `name:ro`, or `name:rw` |
| `MYSQL_PII_COLUMNS` | (empty) | Extra column names, comma-separated. `email`, `correo`, `phone`, `telefono`, `password`, `contrasena`, `ssn`, `nss`, and `token` are already masked. A token with spaces or punctuation is ignored; the rest still apply. |
| `MYSQL_SSL` | (empty) | Only the exact value `required` enables TLS. Any other non-empty value is an error. Empty or unset: no TLS |
| `MYSQL_SSL_CA` | (optional) | Path to a PEM file with the CA. With `MYSQL_SSL=required`, the file must exist and be readable |
| `MYSQL_SSL_CERT` | (optional) | Client certificate path (mTLS). Requires `MYSQL_SSL_KEY` as well |
| `MYSQL_SSL_KEY` | (optional) | Client private key path (mTLS). Requires `MYSQL_SSL_CERT` as well |
| `MYSQL_SSL_REJECT_UNAUTHORIZED` | true | Only the exact value `false` disables server certificate verification. Any other value keeps it enabled |

`MYSQL_SSL*` variables accept file paths to PEM files on disk only, never inline certificate content. They are read once when the connection pool is created (on the first query after the server starts); changing them requires restarting the MCP. `rejectUnauthorized` defaults to `true` when TLS is enabled. MariaDB uses the same mysql2 client, so configuration is identical.

Example `.env`:

```
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=my_database
MYSQL_ACCESS_MODE=readonly
MYSQL_ALLOWED_DATABASES=
MYSQL_PII_COLUMNS=
```

## Using in Cursor

### Without cloning the repository (npm + npx)

With Node.js >= 18 installed, in **Cursor Settings** → **MCP**:

```json
{
  "mcpServers": {
    "mysql": {
      "command": "npx",
      "args": ["-y", "@eduartedev/mysql-mcp-server"],
      "env": {
        "MYSQL_HOST": "localhost",
        "MYSQL_USER": "root",
        "MYSQL_PASSWORD": "",
        "MYSQL_DATABASE": "your_database",
        "MYSQL_ACCESS_MODE": "readonly",
        "MYSQL_ALLOWED_DATABASES": "",
        "MYSQL_PII_COLUMNS": ""
      }
    }
  }
}
```

The first time, `npx` downloads the package from the registry; you do not need the repo on disk. Restart Cursor or reload MCP after saving.

### Local development (clone the repo)

1. **Build** (optional if you use `tsx` in step 2):

   ```bash
   npm run build
   ```

2. **Add the MCP** in Cursor configuration:
   - Open **Cursor Settings** → **MCP** (or your MCP config file).
   - Add a **stdio** server, for example:

   **Option A – with tsx (no build):**

   ```json
   {
     "mcpServers": {
       "mysql": {
         "command": "npx",
         "args": ["tsx", "c:/laragon/www/mysql-mcp-serve/src/index.ts"],
         "env": {
           "MYSQL_HOST": "localhost",
           "MYSQL_USER": "root",
           "MYSQL_PASSWORD": "",
           "MYSQL_DATABASE": "your_database",
           "MYSQL_ACCESS_MODE": "readonly",
           "MYSQL_ALLOWED_DATABASES": "",
           "MYSQL_PII_COLUMNS": "ssn"
         }
       }
     }
   }
   ```

   **Option B – with build (node):**

   ```json
   {
     "mcpServers": {
       "mysql": {
         "command": "node",
         "args": ["c:/laragon/www/mysql-mcp-serve/dist/index.js"],
         "env": {
           "MYSQL_HOST": "localhost",
           "MYSQL_USER": "root",
           "MYSQL_PASSWORD": "",
           "MYSQL_DATABASE": "your_database",
           "MYSQL_ACCESS_MODE": "readonly",
           "MYSQL_ALLOWED_DATABASES": "",
           "MYSQL_PII_COLUMNS": "ssn"
         }
       }
     }
   }
   ```

   Adjust the path (`c:/laragon/www/mysql-mcp-serve`) to the real project path on your machine.

3. Restart Cursor or reload MCP so it picks up the server. `MYSQL_ACCESS_MODE`, `MYSQL_ALLOWED_DATABASES`, and `MYSQL_PII_COLUMNS` are read at startup; changes do not apply until you restart.

## Available tools

- **mysql_query**: runs a validated SQL query.
  - `query`: query text.
  - `database`: (optional) database to use; defaults to `MYSQL_DATABASE`.
  - `limit`: (optional) rows per page, default 20, max 100.
  - `offset`: (optional) rows to skip before the page, default 0, max 100000.
  - `response_format`: (optional) `markdown` (default) or `json`.
- **mysql_catalog**: reads view, trigger, function, and procedure definitions from `information_schema`.
  - `kind`: `view`, `trigger`, `function`, or `procedure`.
  - `name`: (optional) object name; letters, numbers, and underscore only. If omitted, lists all objects of that type. The server passes it as a parameter; it is not concatenated into SQL.
  - `database`: (optional) database to query; must be allowed by `MYSQL_ALLOWED_DATABASES`. Defaults to `MYSQL_DATABASE`.
  - `limit`, `offset`, and `response_format`: same as `mysql_query`.

A `SELECT` without its own `LIMIT` is executed with `LIMIT offset, count`. If the query already has `LIMIT`, ends with a line comment, or uses `FOR UPDATE` / `LOCK IN SHARE MODE`, MySQL returns at most `offset + limit + 1` rows and pagination is applied here. Other commands are paginated in memory.

Structured response fields (`structuredContent`):

| Field | Description |
|-------|-------------|
| `totalCount` | For a `SELECT` with `LIMIT` added here: offset plus rows MySQL returned (includes one extra row when another page exists). Otherwise, rows returned before slicing the page |
| `count` | Rows on this page |
| `offset` | Applied offset |
| `limit` | Applied limit |
| `hasMore` | `true` if rows remain after this page |
| `nextOffset` | Offset for the next page, or `null` if none |
| `truncated` | `true` if text exceeded 25000 characters and was cut |
| `rows` | Page rows (plain objects) |

Text responses longer than 25000 characters are truncated and marked `truncated`.

### Allowed commands

| Type | Commands |
|------|----------|
| Read | `SELECT`, `WITH`, `SHOW`, `DESCRIBE` / `DESC`, `EXPLAIN`, `ANALYZE`, `CHECK`, `CHECKSUM` |
| Write | `INSERT` · `UPDATE` / `DELETE` (require `WHERE`) |

Allowed `SHOW` examples: `SHOW TABLES`, `SHOW DATABASES`, `SHOW COLUMNS`, `SHOW INDEX`, `SHOW CREATE TABLE`, `SHOW TABLE STATUS`, `SHOW STATUS`, `SHOW CHARACTER SET`, `SHOW COLLATION`, `SHOW ENGINES`, `SHOW WARNINGS`, `SHOW ERRORS`, `SHOW OPEN TABLES`, `SHOW TRIGGERS`, `SHOW FUNCTION STATUS`, `SHOW PROCEDURE STATUS`, `SHOW CREATE VIEW`, `SHOW CREATE TRIGGER`, `SHOW CREATE FUNCTION`, `SHOW CREATE PROCEDURE`.

### Security restrictions

- The server is read-only by default. Writes (`INSERT`, `UPDATE`, `DELETE`) require `MYSQL_ACCESS_MODE=readwrite`; the value is read at startup, so changing it requires restarting the MCP.
- A database marked `:ro` in `MYSQL_ALLOWED_DATABASES` rejects writes even with `MYSQL_ACCESS_MODE=readwrite`. That includes a qualified name (`analytics.table`) used from another database. Marking a database `:rw` does not override a read-only process. The list is read at startup.
- A qualified name (`other_db.table`, with spaces, backticks, or double quotes) is checked against `MYSQL_ALLOWED_DATABASES`. Same for `SHOW CREATE`, `DESCRIBE`, `SHOW TABLES FROM`, `ANALYZE TABLE`, `CHECK TABLE`, and `CHECKSUM TABLE`.
- `mysql_catalog` only reads `information_schema`. It does not run `CALL` or `CREATE`. Object names are not concatenated into SQL.
- Columns `email`, `correo`, `phone`, `telefono`, `password`, `contrasena`, `ssn`, `nss`, and `token`, plus those in `MYSQL_PII_COLUMNS`, are returned as `***`. This applies to text and `structuredContent`. A column like `notes` is not inspected even if the value looks like an email.
- When writes are enabled, `UPDATE` and `DELETE` **must** include a `WHERE` clause.
- Always-true `WHERE` clauses are rejected (`WHERE 1=1`, `WHERE (1=1)`, `WHERE TRUE`, `WHERE 1`, `WHERE 'a'='a'`, `OR 1=1`). Before `UPDATE` or `DELETE`, the connection enables `sql_safe_updates`.
- Multiple statements in a single query are not allowed.
- Destructive commands are blocked: `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `REPLACE`, `RENAME`, `GRANT`, `REVOKE`, `LOAD DATA`, `FLUSH`, `RESET`, `PREPARE`, etc.
- Sensitive `SHOW` variants are blocked: `SHOW GRANTS`, `SHOW VARIABLES`, `SHOW PROCESSLIST`, `SHOW MASTER/SLAVE/REPLICA STATUS`, `SHOW BINARY LOGS`, etc.
- Dangerous functions are blocked: `SLEEP()`, `BENCHMARK()`, `LOAD_FILE()`, `INTO OUTFILE`, `INTO DUMPFILE`.

## Project commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript |
| `npm start` | Run (uses `dist/`) |
| `npm run dev` | Run with tsx (no build) |
| `npm test` | Run unit tests |

## License

MIT
