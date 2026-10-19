import {
  validateQuery,
  isReadOnlyCommand,
  isSelectQuery,
  hasDestructiveKeyword,
  hasSensitiveShow,
  hasDangerousFunction,
  isWriteQuery,
  hasWhereClause,
  hasAlwaysTrueWhere,
  requiresWhereClause,
  hasMultipleStatements,
} from "./sql-validation.js";
import { stripSqlLiteralsAndComments } from "./sql-normalize.js";

function stripped(sql: string): string {
  const r = stripSqlLiteralsAndComments(sql);
  if (!r.ok) throw new Error(r.error);
  return r.stripped;
}

describe("isReadOnlyCommand", () => {
  it.each([
    "SELECT 1",
    "SHOW TABLES",
    "DESCRIBE users",
    "DESC users",
    "EXPLAIN SELECT 1",
    "WITH cte AS (SELECT 1) SELECT * FROM cte",
    "ANALYZE TABLE users",
    "CHECK TABLE users",
    "CHECKSUM TABLE users",
  ])("acepta: %s", (sql) => expect(isReadOnlyCommand(sql)).toBe(true));

  it.each(["INSERT INTO t VALUES(1)", "UPDATE t SET x=1", "DELETE FROM t", "DROP TABLE t"])(
    "rechaza: %s",
    (sql) => expect(isReadOnlyCommand(sql)).toBe(false),
  );
});

describe("isSelectQuery", () => {
  it("acepta SELECT", () => expect(isSelectQuery("SELECT * FROM users")).toBe(true));
  it("rechaza SHOW", () => expect(isSelectQuery("SHOW TABLES")).toBe(false));
});

describe("isWriteQuery", () => {
  it("detecta INSERT", () => expect(isWriteQuery("INSERT INTO t VALUES(1)")).toBe(true));
  it("detecta UPDATE", () => expect(isWriteQuery("UPDATE t SET x=1")).toBe(true));
  it("detecta DELETE", () => expect(isWriteQuery("DELETE FROM t")).toBe(true));
  it("detecta WITH + UPDATE", () =>
    expect(isWriteQuery("WITH c AS (SELECT 1) UPDATE t SET x=1 WHERE id=1")).toBe(true),
  );
  it("no detecta SELECT", () => expect(isWriteQuery("SELECT 1")).toBe(false));
  it("no detecta WITH + SELECT", () =>
    expect(isWriteQuery("WITH c AS (SELECT 1) SELECT * FROM c")).toBe(false),
  );
  it("no marca WITH insert AS SELECT", () => {
    expect(
      isWriteQuery(stripped("WITH insert AS (SELECT 1) SELECT * FROM insert")),
    ).toBe(false);
  });
});

describe("hasWhereClause / requiresWhereClause / hasAlwaysTrueWhere", () => {
  it("detecta WHERE", () => expect(hasWhereClause("UPDATE t SET x=1 WHERE id=1")).toBe(true));
  it("no detecta sin WHERE", () => expect(hasWhereClause("UPDATE t SET x=1")).toBe(false));

  it("UPDATE requiere WHERE", () => expect(requiresWhereClause("UPDATE t SET x=1")).toBe(true));
  it("DELETE requiere WHERE", () => expect(requiresWhereClause("DELETE FROM t")).toBe(true));
  it("INSERT no requiere WHERE", () => expect(requiresWhereClause("INSERT INTO t VALUES(1)")).toBe(false));

  it.each(["WHERE 1=1", "WHERE TRUE", "WHERE 1", "WHERE 'a'='a'"])(
    "detecta WHERE siempre verdadero: %s",
    (clause) => {
      const sql = `DELETE FROM t ${clause}`;
      expect(hasAlwaysTrueWhere(sql, stripped(sql))).toBe(true);
    },
  );

  it("detecta WHERE 2=2", () => {
    const sql = "DELETE FROM t WHERE 2=2";
    expect(hasAlwaysTrueWhere(sql, stripped(sql))).toBe(true);
  });

  it("no marca WHERE real", () => {
    const sql = "DELETE FROM t WHERE id = 5";
    expect(hasAlwaysTrueWhere(sql, stripped(sql))).toBe(false);
  });
});

describe("hasMultipleStatements", () => {
  it("detecta múltiples", () =>
    expect(hasMultipleStatements("SELECT 1; DROP TABLE users")).toBe(true),
  );
  it("permite punto y coma final", () =>
    expect(hasMultipleStatements("SELECT 1;")).toBe(false),
  );
  it("permite una sola sentencia", () =>
    expect(hasMultipleStatements("SELECT 1")).toBe(false),
  );
});

describe("hasDestructiveKeyword", () => {
  it.each([
    "DROP TABLE users",
    "TRUNCATE TABLE users",
    "ALTER TABLE users ADD col INT",
    "CREATE TABLE t (id INT)",
    "RENAME TABLE a TO b",
    "GRANT ALL ON *.* TO 'root'",
    "REVOKE ALL ON *.* FROM 'root'",
    "SHUTDOWN",
    "KILL 123",
    "LOAD DATA INFILE '/tmp/a.csv'",
    "PREPARE stmt FROM 'SELECT 1'",
    "SET GLOBAL max_connections=100",
    "FLUSH PRIVILEGES",
    "RESET MASTER",
    "PURGE BINARY LOGS BEFORE '2025-01-01'",
  ])("detecta destructivo: %s", (sql) => expect(hasDestructiveKeyword(sql)).toBe(true));

  it("no marca SELECT normal", () => expect(hasDestructiveKeyword("SELECT * FROM users")).toBe(false));
  it("no marca SHOW TABLES", () => expect(hasDestructiveKeyword("SHOW TABLES")).toBe(false));
  it("no marca SHOW CREATE TABLE (excepción segura)", () =>
    expect(hasDestructiveKeyword("SHOW CREATE TABLE users")).toBe(false),
  );
});

describe("hasSensitiveShow", () => {
  it.each([
    "SHOW GRANTS",
    "SHOW GRANTS FOR 'root'@'localhost'",
    "SHOW MASTER STATUS",
    "SHOW SLAVE STATUS",
    "SHOW REPLICA STATUS",
    "SHOW VARIABLES",
    "SHOW GLOBAL VARIABLES",
    "SHOW PROCESSLIST",
    "SHOW FULL PROCESSLIST",
    "SHOW ENGINE INNODB STATUS",
    "SHOW BINARY LOGS",
    "SHOW BINARY LOG",
    "SHOW BINLOG EVENTS",
  ])("bloquea: %s", (sql) => expect(hasSensitiveShow(sql)).toBe(true));

  it.each([
    "SHOW TABLES",
    "SHOW DATABASES",
    "SHOW COLUMNS FROM users",
    "SHOW INDEX FROM users",
    "SHOW CREATE TABLE users",
    "SHOW TABLE STATUS",
    "SHOW STATUS",
    "SHOW CHARACTER SET",
    "SHOW COLLATION",
    "SHOW ENGINES",
    "SHOW WARNINGS",
    "SHOW ERRORS",
    "SHOW OPEN TABLES",
  ])("permite: %s", (sql) => expect(hasSensitiveShow(sql)).toBe(false));
});

describe("hasDangerousFunction", () => {
  it.each([
    "SELECT SLEEP(10)",
    "SELECT BENCHMARK(1000000, SHA1('x'))",
    "SELECT LOAD_FILE('/etc/passwd')",
    "SELECT * FROM users INTO OUTFILE '/tmp/dump.csv'",
    "SELECT * FROM users INTO DUMPFILE '/tmp/dump.bin'",
  ])("detecta: %s", (sql) => expect(hasDangerousFunction(sql)).toBe(true));

  it("no marca SELECT normal", () => expect(hasDangerousFunction("SELECT * FROM users")).toBe(false));
  it("no marca SHOW", () => expect(hasDangerousFunction("SHOW TABLES")).toBe(false));
});

describe("validateQuery", () => {
  describe("consultas de lectura permitidas", () => {
    it.each([
      "SELECT * FROM users",
      "SELECT COUNT(*) FROM orders WHERE status = 'active'",
      "  SELECT 1  ",
      "WITH cte AS (SELECT id FROM users) SELECT * FROM cte",
      "SHOW TABLES",
      "SHOW DATABASES",
      "SHOW COLUMNS FROM users",
      "SHOW INDEX FROM users",
      "SHOW CREATE TABLE users",
      "SHOW TABLE STATUS",
      "SHOW STATUS",
      "SHOW CHARACTER SET",
      "SHOW COLLATION",
      "SHOW ENGINES",
      "SHOW WARNINGS",
      "SHOW ERRORS",
      "SHOW OPEN TABLES",
      "SHOW TRIGGERS",
      "SHOW FUNCTION STATUS",
      "SHOW PROCEDURE STATUS",
      "SHOW CREATE VIEW v",
      "SHOW CREATE TRIGGER tr",
      "SHOW CREATE FUNCTION f",
      "SHOW CREATE PROCEDURE p",
      "DESCRIBE users",
      "DESC users",
      "EXPLAIN SELECT * FROM users",
      "ANALYZE TABLE users",
      "CHECK TABLE users",
      "CHECKSUM TABLE users",
    ])("permite: %s", (sql) => {
      const result = validateQuery(sql);
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe("escritura controlada permitida", () => {
    it.each([
      "INSERT INTO users (name) VALUES ('ana')",
      "INSERT INTO users SET name = 'ana'",
      "UPDATE users SET role = 'admin' WHERE id = 1",
      "DELETE FROM users WHERE id = 1",
      "DELETE FROM users WHERE email = 'x@y.com' AND active = 0",
      "WITH cte AS (SELECT id FROM users WHERE active=0) DELETE FROM users WHERE id IN (SELECT id FROM cte)",
    ])("permite: %s", (sql) => {
      const result = validateQuery(sql);
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe("escritura sin WHERE o con WHERE peligroso", () => {
    it.each([
      "UPDATE users SET role = 'admin'",
      "DELETE FROM users",
      "UPDATE users SET x = 1 WHERE 1=1",
      "DELETE FROM users WHERE TRUE",
      "DELETE FROM users WHERE 1",
      "UPDATE users SET x = 1 WHERE 'a'='a'",
      "SELECT * FROM t) INTO/**/OUTFILE 'C:/tmp/x.csv' --",
      "SELECT/*!50000 LOAD_FILE('C:/Windows/win.ini') */",
    ])("bloquea: %s", (sql) => {
      const result = validateQuery(sql);
      expect(result.allowed).toBe(false);
    });
  });

  describe("consulta vacía", () => {
    it("rechaza cadena vacía", () => {
      const result = validateQuery("");
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("vacía");
    });

    it("rechaza solo espacios", () => {
      const result = validateQuery("   ");
      expect(result.allowed).toBe(false);
    });
  });

  describe("múltiples sentencias", () => {
    it("bloquea SELECT + DROP", () => {
      const result = validateQuery("SELECT 1; DROP TABLE users");
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("múltiples");
    });
  });

  describe("comandos destructivos", () => {
    it.each([
      "DROP TABLE users",
      "TRUNCATE TABLE users",
      "ALTER TABLE users ADD COLUMN x INT",
      "CREATE TABLE evil (id INT)",
      "RENAME TABLE users TO old_users",
      "REPLACE INTO users VALUES (1)",
      "CALL p()",
      "CALL p",
    ])("bloquea: %s", (sql) => {
      const result = validateQuery(sql);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("no permitidos");
    });
  });

  describe("SHOW sensibles", () => {
    it.each([
      "SHOW GRANTS",
      "SHOW VARIABLES",
      "SHOW GLOBAL VARIABLES",
      "SHOW PROCESSLIST",
      "SHOW FULL PROCESSLIST",
      "SHOW MASTER STATUS",
      "SHOW BINARY LOGS",
    ])("bloquea: %s", (sql) => {
      const result = validateQuery(sql);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("SHOW");
    });
  });

  describe("funciones peligrosas", () => {
    it.each([
      "SELECT SLEEP(10)",
      "SELECT BENCHMARK(10000000, SHA1('x'))",
      "SELECT LOAD_FILE('/etc/passwd')",
      "SELECT * FROM users INTO OUTFILE '/tmp/out.csv'",
      "SELECT * FROM users INTO DUMPFILE '/tmp/out.bin'",
    ])("bloquea: %s", (sql) => {
      const result = validateQuery(sql);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("funciones no permitidas");
    });
  });

  describe("comandos no reconocidos", () => {
    it("bloquea USE directo", () => {
      const result = validateQuery("USE mydb");
      expect(result.allowed).toBe(false);
    });

    it("bloquea SET", () => {
      const result = validateQuery("SET @var = 1");
      expect(result.allowed).toBe(false);
    });
  });
});
