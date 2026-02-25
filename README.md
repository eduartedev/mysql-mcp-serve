# mysql-mcp-server

Servidor MCP para ejecutar consultas **SELECT** en una base de datos MySQL local. Pensado para usarse desde Cursor u otro cliente MCP.

## Requisitos

- Node.js >= 18
- MySQL accesible (por ejemplo Laragon, XAMPP, o MySQL instalado)

## Instalación

```bash
npm install
```

## Configuración

Conexión mediante variables de entorno. Puedes crear un `.env` en la raíz (no se sube a Git) o definirlas donde arranques el MCP.

| Variable           | Por defecto  | Descripción                    |
|--------------------|-------------|---------------------------------|
| `MYSQL_HOST`       | localhost   | Host del servidor MySQL         |
| `MYSQL_PORT`       | 3306        | Puerto                          |
| `MYSQL_USER`       | root        | Usuario                         |
| `MYSQL_PASSWORD`   | (vacío)     | Contraseña                      |
| `MYSQL_DATABASE`   | (opcional)  | Base de datos por defecto       |

Ejemplo `.env`:

```
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=tu_password
MYSQL_DATABASE=mi_base
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
           "MYSQL_DATABASE": "tu_base"
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
           "MYSQL_DATABASE": "tu_base"
         }
       }
     }
   }
   ```

   Ajusta la ruta (`c:/laragon/www/mysql-mcp-serve`) a la ruta real del proyecto en tu máquina.

3. Reinicia Cursor o recarga MCP para que detecte el servidor.

## Herramienta disponible

- **mysql_query**: ejecuta una consulta SQL **SELECT**.
  - `query`: texto de la consulta (solo SELECT).
  - `database`: (opcional) nombre de la base a usar; si no se indica, se usa `MYSQL_DATABASE`.

No se permiten INSERT, UPDATE, DELETE, SHOW, DESCRIBE ni otros comandos; solo SELECT.

## Comandos del proyecto

| Comando       | Descripción              |
|---------------|--------------------------|
| `npm install` | Instalar dependencias    |
| `npm run build` | Compilar TypeScript   |
| `npm start`   | Ejecutar (usa `dist/`)   |
| `npm run dev` | Ejecutar con tsx (sin build) |

## Licencia

MIT
