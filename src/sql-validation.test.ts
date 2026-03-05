import {
  validateQuery,
  isReadOnlyCommand,
  isSelectQuery,
  hasDestructiveKeyword,
  hasSensitiveShow,
  hasDangerousFunction,
  isWriteQuery,
} from "./sql-validation.js";

describe("isReadOnlyCommand", () => {
  it.each(["SELECT 1", "SHOW TABLES", "DESCRIBE users", "DESC users", "EXPLAIN SELECT 1"])(
    "acepta: %s",
    (sql) => expect(isReadOnlyCommand(sql)).toBe(true),
  );

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
  it("no detecta SELECT", () => expect(isWriteQuery("SELECT 1")).toBe(false));
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
  it("no marca SHOW CREATE TABLE (excepción segura)", () => expect(hasDestructiveKeyword("SHOW CREATE TABLE users")).toBe(false));
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
  describe("consultas permitidas", () => {
    it.each([
      "SELECT * FROM users",
      "SELECT COUNT(*) FROM orders WHERE status = 'active'",
      "  SELECT 1  ",
      "SHOW TABLES",
      "SHOW DATABASES",
      "SHOW COLUMNS FROM users",
      "SHOW INDEX FROM users",
      "SHOW CREATE TABLE users",
      "SHOW TABLE STATUS",
      "DESCRIBE users",
      "DESC users",
      "EXPLAIN SELECT * FROM users",
    ])("permite: %s", (sql) => {
      const result = validateQuery(sql);
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
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

  describe("comandos destructivos", () => {
    it.each([
      "DROP TABLE users",
      "TRUNCATE TABLE users",
      "ALTER TABLE users ADD COLUMN x INT",
      "CREATE TABLE evil (id INT)",
      "RENAME TABLE users TO old_users",
    ])("bloquea: %s", (sql) => {
      const result = validateQuery(sql);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("no permitidos");
    });
  });

  describe("comandos de escritura", () => {
    it.each([
      "INSERT INTO users VALUES (1, 'admin')",
      "UPDATE users SET role='admin' WHERE id=1",
      "DELETE FROM users WHERE id=1",
    ])("bloquea: %s", (sql) => {
      const result = validateQuery(sql);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain("INSERT");
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

  describe("funciones peligrosas en SELECT", () => {
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
