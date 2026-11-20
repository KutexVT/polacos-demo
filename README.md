# Polacos · Pruebas

Copia independiente de [Polacos](https://github.com/KutexVT/polacos) para explorar la aplicación con datos ficticios. Sigue el patrón de acceso directo de Gestión Neutral y conserva las paletas, modo claro/oscuro y funciones de Polacos.

**Demo:** https://polacos-demo-production.up.railway.app/

**Código:** https://github.com/KutexVT/polacos-demo

## Entrada

- **Administrador:** abre el acceso con usuario y contraseña. Solo consulta estadísticas y administra grupos/cuentas. Las credenciales se configuran en Railway y no están en el repositorio.
- **Dueño:** entra directamente en el dueño del equipo de demostración.
- **Polaco:** entra directamente en el trabajador principal del mismo equipo.

Dueño y Polaco son perfiles públicos compartidos. Cualquier visitante puede cambiar sus datos ficticios. No son una identificación personal ni un espacio privado. No usar clientes, teléfonos, documentos, contraseñas reutilizadas ni operaciones reales dentro de esos perfiles.

La edición original mantiene su autenticación y su base separadas. Esta copia no se conecta a esa base ni importa sus clientes, operaciones o conversaciones.

## Datos de ejemplo

La primera ejecución crea 2 grupos, 8 cuentas de demostración, 60 productos, 104 clientes, 208 compras, pagos por efectivo/SINPE/tarjeta/mixtos, solicitudes de precio y acceso, 16 chats con 160 mensajes, movimientos y 6 cierres de caja. Hay compras pagadas, activas, pendientes y canceladas con calendarios y saldos coherentes.

Los datos se generan una sola vez en una transacción. Reiniciar o desplegar conserva las ediciones y no duplica la muestra. No hay reinicio automático ni botón de borrado. La siembra rechaza una base con grupos existentes que no tenga el marcador de esta demo.

## Funciones conservadas

Clientes y catálogo en cuadrículas, inventario con reservas, aprobación de precios, compras a crédito, calendarios, cuotas y abonos, permisos entre trabajadores, chats internos y adjuntos, notificaciones, reportes, papelera, grupos/cupos, estadísticas de uso, contador de efectivo y cierres revisados por el dueño. Dinero en CRC y zona `America/Costa_Rica`.

Las preferencias de color y modo pertenecen al perfil compartido. Cambiarlas también cambia lo que verá el siguiente visitante de ese mismo perfil. Soporte técnico continúa retirado, igual que en la versión original actual.

## Desarrollo

Node.js 24 y PostgreSQL 16 o superior. Crear una base exclusiva y copiar `.env.example` a `.env`. Configurar una contraseña administrativa de al menos 12 caracteres y una URL PostgreSQL propia. Nunca usar la URL de la base original.

```sh
npm ci
npm run build
npm run dev
```

Abrir http://localhost:3211/. Las migraciones, el administrador inicial y la muestra se preparan al arrancar. El administrador se crea solo si todavía no existe; modificar la variable de arranque no restablece su contraseña.

Express sirve el frontend compilado. Para reconstrucción continua usar `npm run build -- --watch` en otra terminal. Vite dispone de proxy al backend local en 3211.

## Pruebas

```sh
npm test
npm run test:e2e
npm run build
git diff --check
```

Las suites de integración y navegador crean grupos QA propios y los limpian. La suite de demo también comprueba coherencia de saldos/stock, siembra sin duplicados, persistencia de ediciones, acceso directo limitado a los dos perfiles, revocación de la sesión al cambiar de perfil y protección del administrador. Ejecutarlas solamente contra una base de pruebas de esta copia.

El navegador de pruebas usa Chromium en `/usr/bin/chromium` o `CHROMIUM_PATH`. Sus capturas y logs privados quedan en `.local/`. Los tamaños de teléfono son simulados; no representan pruebas en iOS o en un teléfono físico.

## Railway

Proyecto `polacos-demo` (`00fabb15-6621-46c3-8946-1710ed082a2e`). Servicios `polacos-demo` y `Postgres`, ambos exclusivos de esta copia. `DATABASE_URL` referencia `${{Postgres.DATABASE_URL}}`, `APP_ORIGIN` corresponde al enlace público y `NODE_ENV=production` activa cookies HTTPS.

```sh
railway link --project 00fabb15-6621-46c3-8946-1710ed082a2e --environment production --service polacos-demo
railway status
railway up --service polacos-demo --detach
railway deployment list --service polacos-demo --json
curl --fail https://polacos-demo-production.up.railway.app/api/health
```

El Dockerfile compila y ejecuta como usuario sin privilegios. Antes de atender aplica migraciones y siembra. La configuración parcial de `.railway/railway.ts` conserva los secretos existentes con `preserve()`. Los secretos nunca van en argumentos, código ni GitHub.

La publicación usa `railway up`; el repositorio de GitHub conserva el código. Verificar `SUCCESS`, salud, assets y los tres accesos después de desplegar. [Operación](docs/OPERACION.md), [administración](docs/ADMINISTRACION.md) y [caja](docs/CAJA.md).
