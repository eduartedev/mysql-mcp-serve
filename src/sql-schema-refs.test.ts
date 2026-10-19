import { assertSqlSchemasAllowed } from "./sql-schema-refs.js";
import { parseAllowlist } from "./schema-permissions.js";

describe("assertSqlSchemasAllowed", () => {
  it("bloquea mysql.user", () => {
    const r = assertSqlSchemasAllowed(
      "SELECT * FROM mysql.user",
      parseAllowlist("app"),
      "app",
    );
    expect(r.ok).toBe(false);
  });
});
