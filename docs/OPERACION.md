# Operación de la copia de pruebas

## Recursos exclusivos

| Recurso | Identificador |
| --- | --- |
| Proyecto Railway | `00fabb15-6621-46c3-8946-1710ed082a2e` |
| Entorno production | `1e4224ee-ecfa-4a2b-af3f-86311a9d2394` |
| Web polacos-demo | `ba6d92f3-6ed8-4681-8738-2a9c0d5c3a2b` |
| Postgres | `35812964-3a7e-46b0-abcc-dda99fa17bb0` |
| URL | https://polacos-demo-production.up.railway.app/ |
| Repositorio | https://github.com/KutexVT/polacos-demo |

Esta instalación tiene su propia base. No apuntar a la base de Polacos original. `seedDemo()` rechaza grupos preexistentes sin el marcador de la copia. La muestra se genera solo una vez y conserva cambios entre despliegues.

## Publicar y comprobar

```sh
cd /home/kutex/project/polacos-demo
railway link --project 00fabb15-6621-46c3-8946-1710ed082a2e --environment production --service polacos-demo
railway status
railway up --service polacos-demo --detach
railway deployment list --service polacos-demo --json
railway logs --service polacos-demo --lines 100
curl --fail https://polacos-demo-production.up.railway.app/api/health
```

Comprobar los tres botones, contraseña administrativa, acceso directo de dueño/trabajador, clientes y catálogo, preferencias y caja. Un healthcheck no sustituye estas comprobaciones. `VERIFY_REDEPLOY=1 npm run test:e2e` redespliega realmente el servicio de esta copia y solo debe usarse contra una instalación QA con las credenciales y conexión de esa misma instalación.

## Persistencia y privacidad de la demo

Los perfiles Dueño y Polaco son públicos y compartidos. Sus clientes, compras, mensajes, preferencias y demás operaciones persisten. No cargar información personal o financiera real. La sesión opaca conserva los permisos del perfil; elegir Dueño no identifica al dueño de un negocio real.

Los cierres y movimientos permanecen inmutables. La papelera conserva sus reglas de recuperación y purga de 30 días. No hay un borrado automático total ni una restauración automática de la muestra. Si un perfil principal se retira puede restaurarse desde la administración; si se purga no se recrea al reiniciar.

Los adjuntos se guardan en PostgreSQL. No se configuró un respaldo programado para esta copia ni se verificó una restauración de volumen. Se creó para probar funciones con registros ficticios, no para operar un negocio.

No se abrió un proxy TCP público para PostgreSQL. El servicio web usa la red privada de Railway. `.env`, `.local`, logs, sesiones y contraseñas quedan fuera de Git y del paquete de despliegue.
