# Publicar en Cursor Marketplace y cursor.directory

Este repositorio incluye el layout de **Cursor Plugin** / **Open Plugins** para listarse en ambos sitios.

## Archivos del plugin

| Archivo | Uso |
|---------|-----|
| `.cursor-plugin/plugin.json` | Manifiesto para [Cursor Marketplace](https://cursor.com/marketplace) (variables en Customize → Configure) |
| `mcp.json` | MCP del plugin en Cursor (`${DB_*}` sustituidos por variables del plugin) |
| `plugin.json` | Manifiesto [Agent Plugins](https://agent-plugins.org) (estándar abierto) |
| `.mcp.json` | Auto-detección en [cursor.directory](https://cursor.directory) |
| `skills/mysql-mcp-server/` | Skill opcional para agentes |

## 1. Probar en local (obligatorio antes de enviar)

1. Copia el contenido del repo (o clónalo) en:

   `Windows`: `%USERPROFILE%\.cursor\plugins\local\mysql-mcp-server`

2. En ese directorio deben estar `.cursor-plugin/plugin.json`, `mcp.json`, `skills/`, etc.
3. **Developer: Reload Window** en Cursor.
4. Abre **Customize** → comprueba el plugin y configura las variables (`DB_HOST`, `DB_USER`, `DB_DATABASE`, contraseña).
5. Activa el MCP y ejecuta una consulta de prueba en solo lectura.

## 2. cursor.directory (comunidad, más rápido)

1. Sube los cambios a GitHub (`https://github.com/eduartedev/mysql-mcp-serve`) — repo **público**.
2. Inicia sesión con GitHub o Google en [cursor.directory/plugins/new](https://cursor.directory/plugins/new?type=mcp_server).
3. Pega la URL del repositorio y envía.
4. Un escaneo automático revisa el código; si marca `safe`, el listado se publica sin cola manual.
5. Tras cada actualización relevante, vuelve a enviar o usa la opción de re-index en el panel del plugin (si aparece).

Detectará `.mcp.json`, `plugin.json` y `skills/`.

## 3. Cursor Marketplace (oficial)

1. Asegúrate de que el repo público tenga todo lo anterior y un `README` claro (MIT visible).
2. Con tu cuenta de Cursor, abre [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish).
3. Envía la URL del repositorio.
4. Acepta los [términos de publicador](https://cursor.com/marketplace-publisher-terms).
5. Espera la revisión manual (seguridad, calidad, manejo de datos). Cada actualización se vuelve a revisar.

## 4. Enlace “Add to Cursor” (sin esperar listados)

Configuración mínima en solo lectura (sin contraseñas en el enlace):

[Add to Cursor](https://cursor.com/install-mcp?name=mysql-mcp-server&config=eyJtY3BTZXJ2ZXJzIjp7Im15c3FsLW1jcC1zZXJ2ZXIiOnsiY29tbWFuZCI6Im5weCIsImFyZ3MiOlsiLXkiLCJAZWR1YXJ0ZWRldi9teXNxbC1tY3Atc2VydmVyIl0sImVudiI6eyJEQl9IT1NUIjoibG9jYWxob3N0IiwiREJfQUNDRVNTX01PREUiOiJyZWFkb25seSJ9fX19)

Para regenerar el Base64 con tus valores (sin secretos):

```bash
node scripts/gen-install-link.mjs
```

**No** metas contraseñas ni API keys en el parámetro `config`; cualquiera con el enlace puede leerlo.

## Checklist

- [ ] Probado en `~/.cursor/plugins/local/mysql-mcp-server`
- [ ] Repo público en GitHub actualizado
- [ ] Envío a cursor.directory
- [ ] Envío a cursor.com/marketplace/publish
- [ ] NPM `@eduartedev/mysql-mcp-server` alineado en versión con `plugin.json` si publicaste en npm