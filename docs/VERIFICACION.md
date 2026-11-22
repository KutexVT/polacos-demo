> Histórico heredado de la aplicación original. Los resultados de esta copia independiente se registran al final bajo «Copia de pruebas».

# Verificación de entrega

Fecha: **16 de noviembre de 2026**. URL: https://polacos-production.up.railway.app

## Resultado

- `npm test`: **19/19** pruebas correctas con PostgreSQL real local
- Integración contra Railway: **19/19**, cero fallos, ejecución final de 80,88 segundos
- `npm run build`: correcto; frontend JS 319,25 kB / 94,41 kB gzip y CSS 31,80 kB / 7,29 kB gzip
- `npm audit --omit=dev`: **0 vulnerabilidades reportadas** en esa consulta
- `git diff --cached --check` y `git diff --check`: correctos; comprobación adicional sin credenciales locales ni de producción en archivos preparados
- Navegador Chromium: flujo completo correcto en la URL pública, cero errores JavaScript capturados
- Revisión visual de capturas con datos cargados a **1440×1000**, **820×1180** y **390×844**, sin desbordamiento horizontal de la página
- Servicio web final `99918fb0-4943-438b-b0bd-eae021db03f5`: **SUCCESS**
- Redespliegue de persistencia `01ba1969-d2b1-4ae0-b698-5673b0489e1f`: **SUCCESS**, conservó sesión, texto y hashes SHA-256 de imagen, audio y archivo
- `/api/health`: HTTP 200 y conexión a PostgreSQL
- Los assets JavaScript y CSS descargados desde la URL pública coinciden byte a byte con el build local final
- Petición privada sin sesión: 401. Cookie de sesión: HttpOnly, Secure y SameSite Strict. Mutación con origen externo: 403
- Proxy TCP temporal de PostgreSQL eliminado; Railway confirmó `committed: true` y lista de proxies vacía
- Conexión TCP externa rechazada tras el cierre; salud pública siguió respondiendo 200 usando la conexión privada

La comprobación de persistencia se ejecutó sobre la versión previa al ajuste final de filtros de notificaciones y texto del reporte. La versión final volvió a pasar toda la integración pública y el recorrido de navegador; no cambió el almacenamiento de mensajes/adjuntos.

## Cobertura de los 19 casos solicitados

| Caso de requisitos | Evidencia |
| --- | --- |
| 1. Dos cupos y tercer perfil bloqueado | API 01: tres altas concurrentes, dos aceptadas y una 409 |
| 2. Retirada y restauración con cupo ocupado | API 11: liberar cupo, crear sustituto y competir por restaurar sin superar límite |
| 3. Aislamiento de grupos | API 01/08/09: clientes, modificaciones, chat, archivos y SSE; destinatario recibe evento y otro grupo no |
| 4. Dueño administra sin suplantación | API 06 y navegador: clientes propios y cobro del cliente del trabajador con identidad del dueño |
| 5. Última unidad concurrente | API 04: solo una asignación aceptada |
| 6. Reserva, rechazo, reenvío y cancelación | API 02: bloqueo de cobros y liberación única |
| 7. Aprobación y precio original | API 03: reserva convertida sin doble descuento |
| 8. Catálogo no reescribe la compra | API 03: precio pactado conservado |
| 9. Varias unidades | API 04: cantidad, total y calendario consistentes |
| 10. Capital 20.000 sobre 100.000 | Unidad y API 05: saldo 80.000, próximas cuotas 10.000 y dos cuotas finales eliminadas |
| 11. Parcial, adelanto, corrección y liquidación | API 05: reintentos concurrentes, sobrepago rechazado, auditoría y reapertura tras anulación |
| 12. Frecuencias y fechas | 6 pruebas unitarias: fin de mes, trimestre, cada 15 días, días fijos, personalizadas y fecha Costa Rica |
| 13. Accesos limitados | API 06: lectura sin edición, compra concreta, caducidad y revocación en servidor |
| 14. Recordatorios al responsable | API 07: destinatario y deduplicación; dueño recibe precio; filtros de leídas/no leídas antes de paginar |
| 15. Chat y adjuntos persistentes | Navegador: texto, PNG, audio grabado y TXT; recarga; redespliegue; comparación exacta de bytes |
| 16. Soporte | API 08 y navegador: trabajador inicia, admin responde, grupo de origen visible y contacto espontáneo a polaco rechazado |
| 17. Transferencia y papelera | API 10–12: pagos/stock conservados, foto transferida protegida, purga a 31 días con reloj controlado y repetición sin dobles efectos |
| 18. Paleta y organización interna | API 09 y navegador: preferencias independientes, nombres exclusivos del administrador, logos retirados y paleta persistente al recargar |
| 19. Flujos públicos Railway | Suite API completa y navegador contra HTTPS publicado |

Se añadió API 13 para comprobar que un cobro por su propia fecha sigue incluido aunque la compra sea anterior al período o esté cancelada. Anular el pago lo descuenta del reporte.

## Recorrido de navegador

Administrador crea grupo y dueño; dueño crea trabajador, producto y cliente; trabajador propone precio; dueño aprueba, cobra capital y cobra una cuota parcial desde vista móvil. Después crea conversación y envía texto, archivo, audio e imagen. Cambia paleta, recarga, inicia Soporte como trabajador y responde como administrador. Comprobación de errores JavaScript y ancho de página incluida.

La grabación usa MediaRecorder con el dispositivo de audio simulado de Chromium. Se verifican creación, envío, persistencia y presencia del reproductor. **No se verificó el micrófono físico del usuario ni Safari/iOS o dispositivos móviles físicos.**

## Producción al concluir las pruebas

Conteo verificado directamente en PostgreSQL: **1 usuario administrador**. Cero grupos, productos, clientes, compras, pagos, conversaciones, mensajes, notificaciones, adjuntos y registros de auditoría. No quedan ventas ni mensajes de demostración.

Las pruebas dejan sus capturas y logs locales en `.local/`, fuera de Git y del despliegue:

- `public-tests-final.log`
- `public-browser-final.log`
- `browser-result.json`
- `browser-redeploy-result.json`
- `production-final-counts.json`
- `dependency-audit.json`
- `screenshots/desktop.png`, `tablet.png`, `mobile.png`, `mobile-cobros.png` y `mobile-compra.png`

## Límites de la comprobación

No se hizo una prueba de carga masiva ni una restauración destructiva del volumen. Las pruebas de concurrencia cubren carreras reales de stock, cupos, mensajes y cobros. Las tareas se probaron con reloj controlado sobre grupos aislados; no se esperaron 30 días naturales.

**Copias de seguridad:** Railway rechazó activar el calendario diario porque esta función exige Pro. La lista de programaciones sigue vacía. No se modificó el plan ni se afirma disponer de una copia de recuperación. Retención y procedimiento condicional documentados en `OPERACION.md`.

## Rediseño de administración

Suite local ampliada a 20 pruebas. El escenario API 09b verifica autorización exclusiva de administrador, notas privadas entre dos administradores, vinculación y rechazo de grupos incompatibles, edición/completado/borrado de notas, estados de soporte, reapertura por nuevo mensaje y respuesta desde otro administrador. También verifica revisión de grupo, auditoría del administrador asociada al grupo correcto y rechazo de compras/cobros nuevos con ese rol.

El recorrido de navegador incorpora actualización de estado, notas vinculadas persistentes al recargar, búsqueda global de usuarios, revisión de clientes sin botón de alta y ausencia de Cobros en el menú administrativo. Guarda capturas de la nueva portada a 1440, 820 y 390 píxeles y comprueba desbordes. Conserva el recorrido comercial de dueño y trabajador.

Publicación del panel administrativo: Railway `ca72222e-63a4-4ace-b69e-5d85635b500a` terminó en `SUCCESS`. La URL pública confirmó salud PostgreSQL, assets actuales, resumen sin saldos comerciales, búsqueda de usuarios, actividad y revisión del grupo de pruebas. Se creó, completó, fijó y eliminó una nota temporal para comprobar persistencia real. La API pública rechazó compras y cobros nuevos del administrador con 403. La nota temporal se eliminó al terminar.

La comparación de la base antes y después mantuvo exactamente: 1 grupo, 4 cuentas (incluido el administrador), 64 productos, 100 clientes, 186 compras, 227 pagos, 20 conversaciones y 202 mensajes. Los contadores de la revisión excluyen la papelera: 3 usuarios del grupo, 91 clientes y 61 productos activos. Comprobación visual pública con la cuenta Kutex en escritorio y celular. Evidencia privada local: `.local/admin-production-result.json` y `.local/admin-public-desktop.png`.

## Cuadrículas y adaptación al teléfono

Clientes y productos pasan a tarjetas con imágenes o iniciales, nombre, datos de contacto/precio y estado. Se conservan búsqueda, paginación y acciones. Compras compartidas e historial, solicitudes, notificaciones y pagos usan cuadrículas. Grupos, usuarios, cobros, comparaciones, cuotas, papelera y actividad conservan las relaciones de encabezados y celdas de tabla para accesibilidad y se muestran como fichas etiquetadas. El menú lateral del teléfono conserva la lista vertical original. Las secciones de revisión del grupo se distribuyen en dos columnas sin barras horizontales. Los controles táctiles principales tienen una altura mínima de 44 px y los campos móviles usan 16 px.

El navegador añade registros temporales con nombres y descripciones largos dentro de su grupo QA. La matriz revisa clientes, productos, usuarios, grupos, actividad, solicitudes y cuotas en 320, 390, 600, 820 y 1440 px. También recorre cobros, reportes y compras del cliente como dueño en 320, 390 y 1440 px. Comprueba ancho del documento y contenedores que podrían requerir desplazamiento horizontal. Verifica dos columnas en los listados compactos cuando hay espacio, el menú móvil y que el formulario de edición de producto siga abriendo con los datos correctos. Las capturas y el detalle de cada tamaño quedan en `.local/screenshots/grid-*` y `.local/grid-layout-result.json`.

La evidencia corresponde a Chromium de escritorio con tamaños de pantalla simulados. No se realizó prueba en un teléfono físico ni con Safari/iOS.

Publicación de las cuadrículas: Railway `8d33572a-313c-4afe-90c1-1b19b3d94ad3` terminó en `SUCCESS`. La salud de PostgreSQL y los assets públicos coinciden con la compilación local. La matriz final pasó 44 comprobaciones sin contenedores que requieran desplazamiento lateral. En la URL pública se revisaron los 20 productos y los 20 clientes de la primera página del grupo de pruebas: ambos mostraron dos columnas a 390 px, documento de 382 px de ancho y ningún contenedor horizontal en productos. Se verificó también la cuadrícula de clientes a 1440 px. Evidencia privada: `.local/grid-production-result.json`, `.local/grid-public-products-mobile.png` y `.local/grid-public-clients-desktop.png`.


## Identidad de grupo exclusiva de administración

API 09 comprueba que dueños y polacos no reciben identidad del grupo en la sesión ni nombres de grupo en directorio, conversaciones, usuarios o reportes. No pueden listar ni renombrar grupos. El administrador conserva nombres y cupos; los campos de logo se rechazan y los logos históricos no se sirven a ningún rol. No se modifica la separación de datos ni el contenido de registros o mensajes existentes.

Las 20 pruebas de servidor pasaron. El recorrido de navegador verifica que el menú de dueño y trabajador carece de identidad de grupo y que Configuración no contiene nombre ni imagen de grupo. Continúan funcionando colores, modos, catálogo, compras, pagos, administración y las 44 comprobaciones de distribución adaptable. Evidencia local: `.local/internal-groups-api.log`, `.local/internal-groups-browser.log`, `.local/screenshots/owner-menu-no-group.png` y `.local/screenshots/owner-settings-no-group.png`.

Publicación `bb41a029-0467-42e0-8692-4491a3bc7225` en Railway: `SUCCESS`. Salud, JavaScript y CSS públicos verificados. Se comprobó por API con administrador y trabajador real del grupo de pruebas que el nombre permanece accesible solo al administrador y que se rechazan las modificaciones del trabajador y los campos de logo. Catálogo y clientes continúan accesibles con sus permisos. Se entró también como `pruebas1` en la URL pública: Configuración y el menú móvil ya no contienen identidad de grupo. Se dejó abierta nuevamente la cuenta de administrador. Evidencia: `.local/internal-groups-production-result.json` y `.local/internal-groups-owner-menu-public.png`.


## Limpieza de textos y adornos

Se retiraron eslóganes de acceso y encabezados, el pie repetido de la página, el aviso permanente de guardado en servidor y un icono decorativo de inventario. Los estados vacíos usan nombres concretos. Se conservan indicaciones de recordatorios, privacidad, permisos, recuperación de acceso, confirmaciones y reglas de cobro.

Compilación y recorrido funcional de navegador correctos con las 44 comprobaciones adaptables de 320 a 1440 px. Inspección visual de acceso en escritorio y administración en móvil simulado. Railway `5c6fbae6-eb9a-488f-9dc4-c6d1c1995a1b`: `SUCCESS`. Salud y assets públicos coinciden con la compilación. La cuenta de administrador en la URL pública conserva «Guarda recordatorios y lo que necesitas revisar» y ya no muestra los textos retirados. Evidencia privada: `.local/copy-cleanup-browser.log`, `.local/copy-cleanup-production-result.json` y `.local/copy-cleanup-public.png`. No se probó en un teléfono físico.

## Cierre de caja y contador de efectivo

Se revisó la implementación actual de Bar Chana y se adaptó su conteo CRC, comparación por medio, fondo y horario, corte, movimientos, contrapartidas, confirmación, historial y revisiones a los cobros de cuotas y abonos de Polacos. Alcances y guía en `CAJA.md`.

`npm test`: 30 pruebas correctas. Las 10 nuevas verifican conteo exacto, límites, pago mixto y vuelto, reintentos, aislamiento entre personas/equipos, configuración personal/equipo, movimientos sin doble conteo, guardados concurrentes idempotentes, historial inmutable, envío/revisión con notificaciones, rechazo de operaciones financieras del administrador, resumen desactualizado, correcciones, revisiones, pagos sin clasificar y denominaciones/fechas inválidas.

`npm run test:e2e`: recorrido anterior completo y 44 comprobaciones adaptables correctos. El recorrido nuevo registra un pago mixto con vuelto, cuenta efectivo de forma independiente, usa ese conteo en un cierre que cuadra, confirma, envía, revisa como dueño con nota y comprueba persistencia al recargar. Revisa contador y cierre a 320, 390 y 1440 px. El administrador abre el cierre como consulta y lo conserva abierto al cruzar una actualización automática real de 30 segundos. Se evitó desmontar la revisión de grupo mientras se actualizan sus datos. Compilación y `git diff --check` correctos.

Publicación de servidor/migraciones `376cce5d-420f-4fd5-8572-3e5b5e8d74a5` y ajuste de revisión `ebd48510-edfb-4142-a7ed-30ec4d87681d`: `SUCCESS` en Railway. Salud y assets públicos coinciden con la compilación final.

En producción se usó exclusivamente el grupo autorizado **Pruebas 1**. Un polaco guardó un cierre de demostración sin movimientos reales de dinero, lo envió y el dueño lo revisó con una nota. El polaco pudo consultar la revisión y el administrador pudo abrirla sin acciones de escritura. El esperado/contador permanece congelado y las consultas del dueño separan su caja de la del equipo. Clientes, productos y reportes comerciales permanecieron iguales antes y después. Se conserva un cierre de ejemplo revisado en ese grupo. La cuenta abierta en el navegador sigue siendo el administrador. Se comprobó el detalle público sin desplazamiento lateral a 390 y 1440 px.

Evidencia privada: `.local/register-tests.log`, `.local/register-browser.log`, `.local/register-production-result.json`, `.local/screenshots/cash-counter-*.png`, `.local/screenshots/cash-closing-*.png`, `.local/screenshots/cash-owner-reviewed.png`, `.local/screenshots/cash-admin-reviewed.png` y `.local/register-public-reviewed.png`. Las comprobaciones móviles usan Chromium con viewport simulado. No se probó un teléfono físico ni Safari/iOS.

## Administración limitada a estadísticas y grupos · 17 de noviembre de 2026

Esta actualización sustituye el alcance administrativo descrito en las verificaciones anteriores. El administrador solo accede a estadísticas agregadas y administración de grupos/cuentas. Conserva sus preferencias personales desde el avatar. Soporte, notas, actividad detallada, avisos y revisión de registros comerciales dejan de formar parte de ese perfil. También se retiran los canales de soporte para dueños y polacos; las conversaciones históricas de soporte o con administradores quedan inaccesibles sin destruir su contenido almacenado.

`npm test`: 30 pruebas correctas. Se comprueban las restricciones del administrador, estadísticas por grupo/período, conteo de personas sin duplicados ni administradores, días anteriores al inicio del registro sin datos inventados, rechazo de soporte nuevo y bloqueo de lectura, escritura, adjuntos y avisos de canales retirados. Continúan las pruebas comerciales y de caja para dueños y trabajadores.

`npm run test:e2e`: recorrido completo correcto. Verifica menú administrativo con Estadísticas y Grupos, usuarios dentro de cada grupo, ausencia de soporte, rutas antiguas sin acceso operativo, preferencias, chats internos y los flujos comerciales y de caja. La adaptación se comprueba entre 320 y 1440 px. Compilación y `git diff --check` correctos. El ajuste final de filtros móviles apila los dos selectores y se confirmó en la URL pública sin desbordes.

Railway `4373b549-d876-453f-b4ba-0fa8a5695996`: `SUCCESS`. Salud PostgreSQL y ambos assets públicos coinciden con la compilación final. La migración de uso comenzó el 17 de noviembre de 2026 a las 19:03 UTC. Las cuentas de administrador no se incluyen en el registro de uso.

Comprobación pública por API con administrador y dueño de **Pruebas 1**: estadísticas globales y del grupo, 3 personas registradas, conteos de clientes/productos coincidentes con el acceso del dueño, chats internos accesibles, soporte nuevo rechazado y canales antiguos inaccesibles. El administrador recibe 403 en comunicaciones, notas, notificaciones, clientes, compras y caja. El dueño conserva acceso al cierre revisado de ejemplo. Clientes, productos y reportes se mantuvieron idénticos antes y después. No se crearon registros comerciales durante esta verificación. El acceso de trabajador se comprobó en las suites locales; la credencial de prueba guardada no permitió repetirlo en producción y no se modificó.

Inspección del navegador público con la cuenta Kutex: portada de estadísticas, menú de dos opciones y revisión de grupo limitada a Estadísticas/Usuarios. El navegador queda abierto en estadísticas. Las capturas públicas fallaron por tiempo de espera del navegador; se conservan las capturas de las pruebas locales. La prueba móvil usa tamaño simulado de Chromium y no un teléfono físico ni Safari/iOS.

Evidencia privada: `.local/platform-stats-tests.log`, `.local/platform-stats-browser.log`, `.local/platform-stats-production-result.json` y `.local/screenshots/platform-stats-*.png`.

## Copia de pruebas · 20 de noviembre de 2026

Se compararon los repositorios actuales de Chana y Gestión Neutral. La segunda edición sustituye el acceso por perfiles directos manteniendo el programa; ese patrón se aplica a esta copia de Polacos conservando sus colores y funciones. El código parte del commit `25cabef8fb1f59981d7bea5a449ea3a0e9797e2c` de Polacos. No se modificaron los archivos ni la base comercial del original.

GitHub: `KutexVT/polacos-demo`, público, rama `main`. Railway: proyecto independiente `00fabb15-6621-46c3-8946-1710ed082a2e`, servicio `polacos-demo` y PostgreSQL propio por red privada. URL: https://polacos-demo-production.up.railway.app/. Publicación inicial `d7adffaf-4775-4675-b15f-0237d1b067cf`, ajuste de entrada `98789c8d-60ad-4b49-b90f-a77e0cde0341` y healthcheck `947347b4-c406-429b-9d58-d54628cbbd70`: `SUCCESS`. El manifiesto del último despliegue incluye `/api/health` y timeout de 120 segundos. El plan de infraestructura posterior no muestra cambios pendientes.

`npm test`: 32 pruebas correctas. Además del negocio y la caja heredados se verificaron los saldos de todas las compras de muestra, stock disponible/reservado/asignado coherente, siembra sin duplicados y conservación de ediciones. La entrada directa solo admite los dos perfiles fijados y no acepta un ID arbitrario ni el rol de administrador. Se comprobó rechazo de origen ajeno y de contraseña errónea, permisos después de entrar, aislamiento de grupos y revocación de la sesión anterior al cambiar de perfil.

`npm run test:e2e`: recorrido completo correcto. Se mantienen flujos de inventario, crédito, pagos, permisos, mensajes/adjuntos, papelera, grupos, colores/modos y caja, con tamaños de 320 a 1440 px. Se añadió una prueba con respuesta de login retenida para asegurar que no se pueden cruzar dos accesos: al entrar como administrador quedan deshabilitados los tres botones y durante una entrada directa se bloquea el formulario administrativo expandido. La revisión independiente detectó este caso y la comprobación posterior lo dio por resuelto. Compilación y `git diff --check` correctos.

Comprobación de API pública con los tres roles: administrador autenticado con las credenciales conservadas, Dueño y Polaco sin contraseña, sesiones HTTPS/HttpOnly/SameSite=Strict, restricciones de administración, clientes, productos, conversaciones y cierres accesibles según el rol. Salud PostgreSQL y JavaScript/CSS públicos coinciden con el build local. Los 2 grupos, 8 cuentas ficticias, 60 productos, 104 clientes, 208 compras, 291 pagos, 6 cierres y 160 mensajes se conservaron después del redespliegue. No se importaron clientes ni operaciones reales.

Revisión visual pública: pantalla de tres botones, entrada de Dueño sin formulario y clientes ficticios en dos columnas a 390 px sin desplazamiento lateral. Las cuatro paletas y los dos modos siguen en Configuración. El original respondió 200 en salud y rechazó la entrada pública por perfiles con 401. La revisión documental confirmó que la entrada extiende el sistema existente sin cambiarlo. No se cargaron secretos en Git ni en los assets del cliente; `.env` y `.local` están excluidos.

Evidencia privada de esta copia: `.local/tests.log`, `.local/browser.log`, `.local/public-before.json`, `.local/public-result.json`, `.local/demo-entry-desktop.png`, `.local/demo-entry-mobile.png`, `.local/demo-entry-admin-mobile.png`, `.local/demo-admin-pending.png`, `.local/demo-public-entry.png` y `.local/demo-public-clients-mobile.png`. Las pruebas móviles son de Chromium simulado; no se verificó un teléfono físico ni Safari/iOS. No se hizo una prueba de carga ni una restauración de volumen. La demo es pública y compartida y solo debe contener datos ficticios.

## 21 de noviembre de 2026: porcentajes, ubicación, avisos y caja

Pruebas locales: `npm test` 34 aprobadas sin fallos. `npm run build`, `npm run test:e2e` y `git diff --check` correctos. La API comprueba costo y ganancia, redondeo exacto a ₡5 (incluido empate), descuento decimal, reserva/aprobación, costo privado frente al polaco, ubicación opcional y conservación de compras previas. El cierre ignora importes electrónicos manuales y almacena los calculados; solo compara efectivo. El navegador comprueba porcentaje, precio calculado, provincia/cantón, fecha/hora semántica de avisos y ausencia de verificación electrónica. El contador independiente y los componentes de medios de pago no cambiaron.

Revisión visual de formulario móvil, ubicación, solicitudes y cierre entre 320 y 1440 px. Se corrigió la especificidad del porcentaje para darle prioridad respecto a los importes. Los teléfonos físicos no se probaron. Costos históricos desconocidos quedan pendientes. Evidencia local privada en `.local/screenshots`.
