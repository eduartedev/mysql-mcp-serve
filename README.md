# mysql-mcp-server

Servidor MCP para consultar y modificar de forma controlada una base de datos MySQL local. Pensado para usarse desde Cursor u otro cliente MCP.

## Requisitos

- Node.js >= 18
- MySQL accesible (por ejemplo Laragon, XAMPP, o MySQL instalado)

## Instalación

```bash
npm install
```

## Configuración

Conexión mediante variables de entorno. Puedes crear un `.env` en la raíz (no se sube a Git) o definirlas donde arranques el MCP.

| Variable         | Por defecto | Descripción              |
|------------------|-------------|--------------------------|
| `MYSQL_HOST`     | localhost   | Host del servidor MySQL  |
| `MYSQL_PORT`     | 3306        | Puerto                   |
| `MYSQL_USER`     | root        | Usuario                  |
| `MYSQL_PASSWORD` | (vacío)     | Contraseña               |
| `MYSQL_DATABASE` | (opcional)  | Base de datos por defecto|
| `MYSQL_ACCESS_MODE` | readonly | Solo el valor exacto `readwrite` habilita `INSERT`, `UPDATE` y `DELETE`. Cualquier otro valor, o la variable ausente, es solo lectura |

Ejemplo `.env`:

```
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=tu_password
MYSQL_DATABASE=mi_base
MYSQL_ACCESS_MODE=readonly
```

## Uso en Cursor

1. **Compilar** (opcional si usas `tsx` en el paso 2):

   ```bash
   npm run build
   ```

2. **Añadir el MCP** en la configuración de Cursor:
   - Abre **Cursor Settings** → **MCP** (o el archivo de configuración MCP que uses).
   - Añade un servidor con **stdio**, por ejemplo:

   **Opción A – con tsx (sin compilar):**

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
           "MYSQL_DATABASE": "tu_base",
           "MYSQL_ACCESS_MODE": "readonly"
         }
       }
     }
   }
   ```

   **Opción B – con build (node):**

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
           "MYSQL_DATABASE": "tu_base",
           "MYSQL_ACCESS_MODE": "readonly"
         }
       }
     }
   }
   ```

   Ajusta la ruta (`c:/laragon/www/mysql-mcp-serve`) a la ruta real del proyecto en tu máquina.

3. Reinicia Cursor o recarga MCP para que detecte el servidor.

## Herramienta disponible

- **mysql_query**: ejecuta una consulta SQL validada.
  - `query`: texto de la consulta.
  - `database`: (opcional) nombre de la base a usar; si no se indica, se usa `MYSQL_DATABASE`.
  - `limit`: (opcional) filas por página, por defecto 20, máximo 100.
  - `offset`: (opcional) filas a saltar antes de la página, por defecto 0.
  - `response_format`: (opcional) `markdown` (por defecto) o `json`.

`limit` y `offset` paginan las filas que ya devolvió MySQL; no reescriben el SQL.

Campos estructurados de la respuesta (`structuredContent`):

| Campo | Descripción |
|-------|-------------|
| `totalCount` | Filas devueltas por MySQL antes de paginar |
| `count` | Filas de esta página |
| `offset` | Offset aplicado |
| `limit` | Límite aplicado |
| `hasMore` | `true` si quedan filas después de esta página |
| `nextOffset` | Offset de la siguiente página, o `null` si no hay más |
| `truncated` | `true` si el texto superó los 25000 caracteres y se cortó |
| `rows` | Filas de la página (objetos planos) |

Una respuesta de texto de más de 25000 caracteres se corta y se marca como `truncated`.

### Comandos permitidos

| Tipo | Comandos |
|------|----------|
| Lectura | `SELECT`, `WITH`, `SHOW`, `DESCRIBE` / `DESC`, `EXPLAIN`, `ANALYZE`, `CHECK`, `CHECKSUM` |
| Escritura | `INSERT` · `UPDATE` / `DELETE` (requieren `WHERE`) |

Ejemplos de `SHOW` permitidos: `SHOW TABLES`, `SHOW DATABASES`, `SHOW COLUMNS`, `SHOW INDEX`, `SHOW CREATE TABLE`, `SHOW TABLE STATUS`, `SHOW STATUS`, `SHOW CHARACTER SET`, `SHOW COLLATION`, `SHOW ENGINES`, `SHOW WARNINGS`, `SHOW ERRORS`, `SHOW OPEN TABLES`.

### Restricciones de seguridad

- El servidor es de solo lectura por defecto. Las escrituras (`INSERT`, `UPDATE`, `DELETE`) requieren `MYSQL_ACCESS_MODE=readwrite`; el valor se lee al arrancar, así que cambiarlo exige reiniciar el MCP.
- Con las escrituras activadas, `UPDATE` y `DELETE` **deben** incluir una cláusula `WHERE`.
- Se rechazan `WHERE` siempre verdaderos (`WHERE 1=1`, `WHERE TRUE`, `WHERE 1`, `WHERE 'a'='a'`).
- No se permiten múltiples sentencias en una sola consulta.
- Se bloquean comandos destructivos: `DROP`, `TRUNCATE`, `ALTER`, `CREATE`, `REPLACE`, `RENAME`, `GRANT`, `REVOKE`, `LOAD DATA`, `FLUSH`, `RESET`, `PREPARE`, etc.
- Se bloquean variantes sensibles de `SHOW`: `SHOW GRANTS`, `SHOW VARIABLES`, `SHOW PROCESSLIST`, `SHOW MASTER/SLAVE/REPLICA STATUS`, `SHOW BINARY LOGS`, etc.
- Se bloquean funciones peligrosas: `SLEEP()`, `BENCHMARK()`, `LOAD_FILE()`, `INTO OUTFILE`, `INTO DUMPFILE`.

## Comandos del proyecto

| Comando         | Descripción                    |
|-----------------|--------------------------------|
| `npm install`   | Instalar dependencias          |
| `npm run build` | Compilar TypeScript            |
| `npm start`     | Ejecutar (usa `dist/`)         |
| `npm run dev`   | Ejecutar con tsx (sin build)   |
| `npm test`      | Ejecutar tests unitarios       |

## Licencia

MIT
