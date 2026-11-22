Implementa una aplicación web completa llamada Polacos para gestionar grupos de vendedores a crédito, inventario, clientes, cuotas, cobros y comunicación interna. La aplicación debe funcionar de verdad con datos persistentes y quedar desplegada en Railway

Trabaja en /home/kutex/project/polacos junto a mis otros proyectos. Revisa primero las instrucciones locales y el contenido de esa carpeta. Si no existe créala. Si ya hay trabajo aprovecha lo existente sin sobrescribir cambios ajenos. Limita los cambios al proyecto Polacos y a sus recursos propios en Railway

Este documento contiene las decisiones de producto ya acordadas. Implementa el alcance completo. Organiza el trabajo por etapas y continúa hasta integrar y verificar todas las funciones. Resuelve decisiones técnicas razonables por tu cuenta y documenta tus supuestos. Pregunta solo si falta un dato imprescindible o hay una contradicción que cambie el negocio

1. OBJETIVO Y PLATAFORMA

- Aplicación en español para Costa Rica con moneda CRC y formato de colones
- Usar America/Costa_Rica para fechas de cobro y calendarios
- Interfaz adaptable a celular, tablet y computadora. Priorizar facilidad de uso desde celular
- Un único inicio de sesión con usuario y contraseña para administrador general, dueños y polacos
- Los clientes son registros comerciales. No tienen cuenta ni inicio de sesión
- Datos reales persistentes en servidor. El navegador no debe ser la fuente de verdad del inventario ni de los pagos
- Sin productos por encargo, intereses, recargos automáticos ni pasarela de pagos
- El término polaco identifica al trabajador que administra clientes y cobros

2. ROLES Y SEPARACIÓN DE GRUPOS

Administrador general:
- Es mi cuenta principal
- Crea y administra dueños de grupo con usuario y contraseña inicial
- Configura y modifica el límite de polacos de cada grupo
- Consulta estadísticas de toda la plataforma y por grupo o usuario
- Puede ver y corregir productos, clientes, compras, pagos y demás datos de cualquier grupo
- Puede consultar chats y atender conversaciones de soporte
- Puede acceder a las papeleras y administrar sus contenidos

Dueño:
- Administra exclusivamente su grupo
- Crea, edita y retira polacos dentro del límite autorizado
- Puede cambiar nombres, nombres de usuario y restablecer contraseñas de sus polacos
- Administra el catálogo, precios y existencias de su grupo
- Tiene sus propios clientes y todas las herramientas de cobro de un polaco
- Puede ver, editar y cobrar en los registros de cualquier polaco de su grupo desde su panel
- Tiene un resumen por trabajador y un resumen de todo el grupo sin iniciar sesión como ellos
- Aprueba o rechaza solicitudes de cambios de precio
- Gestiona transferencias de clientes y la papelera del grupo
- No ve ni configura la identidad del grupo. Su organización interna corresponde al administrador

Polaco:
- Administra sus clientes, compras, calendarios y cobros
- Usa los productos y existencias del inventario de su grupo
- Puede consultar el catálogo común y asignar productos. Los cambios del catálogo y stock corresponden al dueño o administrador
- No ve clientes, saldos ni reportes privados de compañeros o del dueño sin una autorización explícita
- Solicita cambios de precio y acceso a datos de compañeros
- Participa en chats de su grupo y puede contactar a Soporte
- Configura los colores de su interfaz

Aislamiento:
- Cada grupo tiene su propio inventario, usuarios, clientes, solicitudes, conversaciones y estadísticas
- Un dueño o polaco nunca accede a otro grupo
- Verificar permisos en servidor para cada lectura, modificación, archivo, búsqueda, estadística y conexión en tiempo real
- Un permiso temporal solo habilita los registros y operaciones concedidos. Nunca otorga facultades administrativas
- Las operaciones del dueño y administrador conservan la identidad real de quien las realizó

3. CUENTAS Y LÍMITE DE POLACOS

- No habrá registro público de cuentas
- El administrador crea dueños y los dueños crean polacos
- El límite corresponde a la cantidad de perfiles de polacos existentes en el grupo. No es un límite de conexiones simultáneas
- Los perfiles cuentan aunque no estén conectados o no usen la aplicación
- El dueño no ocupa un cupo de polaco y los clientes no tienen límite comercial
- Al retirar un perfil a la papelera se recupera el cupo. Restaurarlo debe comprobar que todavía haya un cupo disponible
- No permitir superar el límite con creaciones o restauraciones simultáneas
- Mostrar cupos utilizados y permitidos
- Al llegar al límite mostrar: "Tu cuenta permite hasta N polacos y ya alcanzaste ese límite"
- No incluir números de teléfono ni enlaces externos para ampliar el límite
- La ampliación la realiza el administrador desde su panel
- No implementar cobro automático de suscripciones
- Mostrar nombres de usuario y permitir restablecer contraseñas. Guardarlas mediante hash seguro y nunca permitir consultar contraseñas almacenadas
- La retirada de un usuario debe invalidar sus sesiones

4. CLIENTES Y COMPRAS

- Cada cliente tiene un responsable dentro del grupo: un polaco o el dueño
- Nombre o identificador visible obligatorio. Foto, teléfono, dirección y notas opcionales
- Dos personas pueden compartir nombre. No usar el nombre como identificador único
- Permitir editar el perfil y transferirlo dentro del mismo grupo según permisos del dueño
- Mostrar compras activas, pendientes, canceladas y pagadas junto con su historial
- Mostrar precio, cantidad, total, monto pagado y saldo individual de cada compra
- Mostrar también total pagado y pendiente del cliente sin mezclar solicitudes todavía sin precio confirmado con deuda cobrable
- Una compra corresponde a un producto del catálogo con una cantidad de unidades y un calendario propio
- Permitir varias compras y varias unidades iguales por compra
- El total de una compra es precio unitario acordado por cantidad
- Mantener una copia del nombre y precio acordados para que un cambio posterior del catálogo no reescriba compras anteriores
- Los registros comerciales confirmados no deben desaparecer por borrar un producto del catálogo

5. INVENTARIO Y RESERVAS

- El dueño registra productos con nombre, precio y cantidad. Permitir descripción e imagen opcionales
- Mostrar por producto cantidades disponibles, reservadas por operaciones pendientes y asignadas a compras confirmadas
- Las unidades reservadas siguen identificadas en inventario pero están bloqueadas para todos los demás
- Permitir al dueño identificar la compra, cliente y polaco que mantienen una reserva
- Impedir stock disponible negativo y asignaciones por encima de lo disponible
- Registrar movimientos de inventario con cantidad, motivo, fecha y responsable

Reglas definitivas:
a) Añadir una compra al precio normal confirma la asignación y consume sus unidades disponibles
b) Pedir un precio distinto reserva las unidades mientras se espera aprobación
c) Aprobar el precio confirma la compra y convierte la reserva en asignación sin descontar dos veces
d) Rechazar una propuesta mantiene la compra pendiente de decisión y conserva la reserva
e) Volver a solicitar un precio reutiliza la misma reserva
f) Elegir el precio original confirma la compra usando esa reserva
g) Cancelar definitivamente una asignación pendiente libera la reserva y devuelve esas unidades a disponibles
h) Quitar o cancelar una compra ya confirmada no devuelve automáticamente sus unidades al inventario
i) Restaurar una compra confirmada no vuelve a descontar su stock

- Antes de una decisión final las unidades pendientes no pueden ser utilizadas por otra persona
- Al retirar o purgar registros con reservas pendientes deben resolverse y liberarse las reservas que ya no correspondan a una operación vigente
- Mantener operaciones de reserva, confirmación y liberación atómicas e idempotentes para evitar dobles descuentos o dobles devoluciones

6. PRECIOS Y SOLICITUDES

- Un polaco solo puede proponer un precio diferente durante el alta de una compra para un cliente
- Puede proponer un porcentaje de descuento o un nuevo precio. Mostrar siempre precio unitario y total resultante
- La aprobación afecta únicamente a esa compra y ese cliente. No modifica el catálogo ni otras compras
- No ofrecer al polaco solicitudes de descuento para compras que ya estén confirmadas
- El dueño y administrador pueden establecer precios directamente dentro de sus permisos. Cualquier corrección posterior de una compra confirmada queda registrada y debe respetar los pagos existentes
- El dueño dispone de una bandeja con solicitudes pendientes y resueltas
- La solicitud muestra solicitante, cliente, producto, cantidad, precio original y precio propuesto
- Mientras no haya precio confirmado mostrar claramente "Pendiente de aprobación" o "Pendiente de decisión"
- Bloquear pagos, abonos y cobros desde servidor mientras la compra esté pendiente
- El dueño puede aprobar o rechazar con motivo opcional
- Comunicar el resultado al polaco mediante su bandeja de notificaciones. Si existe motivo debe poder leerlo
- Tras un rechazo ofrecer usar el precio original, enviar otra propuesta o cancelar definitivamente
- Reenviar una propuesta no duplica compras ni reservas
- Una aprobación vieja no puede activar una compra cancelada ni reemplazar una propuesta más reciente
- El historial muestra decisiones, fechas, precios y responsables

7. CALENDARIOS Y COBROS

Cada compra tiene su propio plan:
- Frecuencia diaria, semanal, quincenal, mensual, trimestral o fechas personalizadas
- Elegir fecha de inicio y días de cobro según corresponda
- En quincenal distinguir claramente cada 15 días de dos fechas fijas al mes
- En mensual permitir indicar un día del mes. Resolver fechas inexistentes usando el último día del mes y explicarlo en la interfaz
- En fechas personalizadas permitir añadir vencimientos y sus montos
- El usuario introduce el monto de la cuota y la aplicación calcula el calendario, saldo y cuotas restantes
- La última cuota puede ser menor para no exceder el total
- Mostrar una vista previa de importes y fechas antes de confirmar
- En una compra pendiente el calendario definitivo debe revisarse al confirmar el precio
- Permitir editar fechas y cuotas futuras manteniendo consistencia con saldo e historial

Pagos:
- Botón "Registrar pago" o "Ya pagó" con confirmación de cliente, compra, monto y fecha
- No exigir comprobante ni integración bancaria
- Registrar pagos completos, parciales y adelantados
- Distinguir pago de cuota de abono extra al capital
- Un pago parcial deja visible lo que falta de esa cuota y su estado de atraso cuando corresponda
- Un adelanto de cuotas se aplica a las cuotas seleccionadas
- Un abono al capital reduce el saldo y elimina o reduce cuotas desde el final. No reduce la cuota periódica ni marca automáticamente como pagada la cuota actual
- Ejemplo obligatorio: compra de ₡100 000 con cuotas de ₡10 000. Un abono extraordinario de ₡20 000 deja ₡80 000 pendientes y elimina las dos cuotas finales. Las siguientes cuotas conservan ₡10 000
- Al liquidar por completo una compra no deben quedar cuotas pendientes
- Impedir importes negativos y pagos mayores al saldo sin dejar pasar silenciosamente diferencias
- No registrar dos cobros al pulsar dos veces o reintentar una petición
- Mostrar total, pagado, saldo, cuotas restantes, próximo vencimiento y monto vencido
- Permitir corregir o anular un pago conservando el valor anterior, nuevo valor, responsable y fecha
- Recalcular saldo y calendario tras una corrección. Conservar la historia mientras el registro no sea eliminado definitivamente por la política de papelera
- Usar aritmética monetaria exacta con redondeo definido
- No calcular ni añadir intereses o multas

8. ACCESOS TEMPORALES ENTRE POLACOS

- Por defecto cada polaco solo tiene acceso a sus clientes
- Puede solicitar acceso a los clientes de otro polaco de su mismo grupo
- La solicitud indica alcance deseado, duración y si solicita lectura o edición
- La solicitud no debe revelar previamente nombres ni datos privados de clientes ajenos
- El destinatario elige qué compartir: todos sus clientes o clientes y compras concretos
- Puede ajustar el alcance y conceder solo lectura o edición
- Definir fecha y hora de caducidad visibles
- Permitir rechazar y revocar el permiso antes de su vencimiento
- El servidor aplica la caducidad aunque el usuario mantenga la pantalla abierta
- Lectura no permite registrar pagos ni modificar nada
- Edición permite las operaciones concedidas sobre registros comerciales. No permite aprobar precios, administrar usuarios, editar inventario ni compartir esos datos con un tercero
- Registrar qué usuario realizó cualquier cambio
- Las alertas de cobro siguen llegando al responsable del cliente aunque otro polaco tenga acceso
- Transferir un cliente obliga a revisar o revocar permisos anteriores para no conservar accesos injustificados

9. CHAT Y SOPORTE

Chat interno:
- Conversaciones individuales y grupos de chat dentro de cada grupo comercial
- Los compañeros y el dueño aparecen en el directorio sin tener que agregarlos como contactos
- Texto, audios grabados, imágenes y archivos con historial persistente
- Poder grabar y reproducir audio desde móvil y escritorio cuando el navegador lo permita
- Envío y recepción en tiempo real con estados de carga, error y reintento
- Mensajes no leídos y notificaciones dentro de la aplicación
- Las conversaciones privadas son accesibles a sus participantes y al administrador general
- El permiso para ver clientes no da acceso a chats privados
- No incluir llamadas ni integrar WhatsApp real

Soporte:
- Mostrar una cuenta o canal identificado como "Soporte"
- Un polaco puede iniciar una conversación de soporte
- Cuando el polaco envía el primer mensaje se crea el chat y el administrador puede responder
- El administrador no inicia conversaciones privadas espontáneas con polacos que nunca le hayan escrito
- El administrador sí puede contactar a los dueños para asistencia o avisos del servicio
- La bandeja de soporte identifica remitente, rol y grupo de origen
- Mantener privadas entre sus participantes las consultas de soporte. No convertirlas automáticamente en conversaciones con todo el grupo
- El administrador dispone también de consulta de chats y estadísticas globales de mensajes
- Informar de la supervisión administrativa. No presentar el chat como cifrado de extremo a extremo
- Validar archivos y tamaños. Guardar adjuntos en almacenamiento duradero con acceso autorizado

10. NOTIFICACIONES Y ESTADÍSTICAS

Notificaciones:
- Bandeja interna con leídas, no leídas y enlaces a la operación correspondiente
- Avisos de cobros próximos, pagos atrasados, solicitudes de acceso y decisiones de precio
- Cada recordatorio de cobro llega únicamente al responsable de ese cliente
- El dueño puede consultar el atraso en sus reportes pero no recibe todas las alertas de sus polacos
- El dueño sí recibe solicitudes de precio que debe resolver y alertas de sus propios clientes
- Evitar generar repetidamente la misma alerta de un vencimiento sin cambio relevante
- No enviar recordatorios por correo, SMS ni WhatsApp

Estadísticas reales:
- Clientes y compras activos
- Total vendido confirmado, cobrado, pendiente y vencido
- Próximos cobros, cuotas pagadas, parciales y vencidas
- Evolución de cobros por fecha
- Existencias disponibles, reservadas y asignadas
- Solicitudes pendientes, aprobadas y rechazadas
- Comparación por trabajador para el dueño y por grupo para el administrador
- Cantidad de usuarios y utilización de cupos
- Cantidad de mensajes y conversaciones de soporte para el administrador
- Filtros de fecha y ámbito según permisos
- Cada polaco ve sus cifras. El dueño ve las suyas y las de su grupo. El administrador ve toda la plataforma
- No contar precios pendientes como ventas confirmadas ni sumar dos veces reservas y ventas
- No inventar ganancias o márgenes si no existen datos de costo de compra

11. RETIRADA DE USUARIOS Y PAPELERA

Al retirar un polaco:
- El dueño decide quedarse sus clientes, transferirlos a otro responsable de su grupo o enviarlos a la papelera
- Conservar en las transferencias compras, pagos y calendarios
- Separar correctamente los datos transferidos de los del perfil retirado para no borrarlos después por cascada
- Invalidar sesiones y permisos del usuario retirado
- Resolver sus solicitudes y reservas pendientes sin dejar stock bloqueado sin responsable
- Liberar su cupo

Papelera:
- Visible para el dueño de ese grupo y para el administrador general
- Mostrar elemento, fecha de borrado, responsable y tiempo restante
- Permitir restaurar durante 30 días o borrar definitivamente antes
- Explicar qué registros asociados se restaurarán o eliminarán
- A los 30 días purgar automáticamente todo lo que pertenezca al conjunto eliminado: datos personales, compras, pagos, mensajes, adjuntos y registros de auditoría asociados
- No conservar copias ocultas de los datos purgados para sostener estadísticas históricas
- No borrar datos ya transferidos ni registros ajenos por compartir un chat o una referencia
- Si se retira un usuario eliminar al purgar sus mensajes y archivos correspondientes sin eliminar el grupo de chat ni los mensajes de otros usuarios
- Ajustar estadísticas a la información que siga existiendo
- Restaurar no debe duplicar pagos ni movimientos de inventario. Si necesita reservar stock o recuperar un cupo comprobar primero disponibilidad
- Ejecutar la purga como tarea persistente del servidor aunque ningún usuario abra la página
- Hacer la purga y la eliminación de adjuntos reintentables sin dobles efectos
- Documentar la retención real de copias de seguridad del alojamiento. No afirmar eliminación inmediata de backups que el sistema no controle

12. PERSONALIZACIÓN E INTERFAZ

- Solo el administrador guarda y modifica los nombres de grupos como etiquetas internas de organización. No se muestran a dueños ni polacos. No existe personalización con foto o logo de grupo
- Cada usuario elige su paleta de colores sin cambiar la de sus compañeros
- Ofrecer personalización en el primer uso y después en Configuración
- Guardar preferencias por usuario y recuperarlas al iniciar sesión en otro dispositivo
- Mantener texto legible y contraste suficiente con las paletas elegidas
- Mostrar nombres concretos de acciones y distinguir estados con texto además del color
- Navegación adaptada al rol hacia inicio, clientes, inventario, calendario/cobros, solicitudes, chats, notificaciones y configuración
- Añadir gestión de usuarios, papelera y reportes a los roles autorizados
- Panel administrativo con grupos, cupos, soporte y estadísticas globales
- Búsqueda, filtros y paginación para listas largas
- Formularios fáciles de usar con errores comprensibles
- Confirmaciones claras para cobrar, cancelar asignaciones y eliminar definitivamente
- Estados de carga, vacío, error y pérdida de conexión
- Al perder conexión no fingir que se guardó un cobro. Mostrar si está confirmado por el servidor
- Usar datos de demostración solo en desarrollo o pruebas. Producción debe iniciar sin ventas o mensajes ficticios

13. IMPLEMENTACIÓN Y RAILWAY

- Elegir una arquitectura sencilla y mantenible adecuada para esta aplicación
- Usar PostgreSQL para datos relacionales y migraciones versionadas
- Elegir versiones estables y compatibles comprobando documentación oficial cuando sea necesario
- Usar almacenamiento duradero para fotos, audios y adjuntos. No depender del disco temporal del despliegue
- Mantener permisos y reglas de negocio en el servidor
- Aplicar transacciones y controles de concurrencia en stock, cupos, aprobación de precios y cobros
- Proteger sesiones, contraseñas y endpoints. Validar entradas y limitar intentos de acceso
- Los secretos van en variables de entorno. Documentar nombres en .env.example sin valores reales
- Crear el administrador inicial por un mecanismo privado de configuración. No publicar credenciales predeterminadas ni dejar registro público de administradores
- Permitir ejecutar localmente y desplegar la misma aplicación en Railway
- Preparar build, arranque, migraciones, comprobación de salud y tareas de recordatorios/purga
- Si hay varias instancias evitar que dupliquen tareas programadas, notificaciones o cobros
- Comprobar la identidad y proyecto de Railway antes de modificar recursos
- Crear o utilizar exclusivamente recursos de Polacos. No reutilizar bases de datos de otros proyectos
- Desplegar usando la cuenta ya autenticada y verificar el resultado público
- Si falta acceso a Railway o configuración imprescindible pedir únicamente ese dato y continuar las partes independientes
- No marcar el despliegue como terminado solo porque compila o se subió el código

14. VERIFICACIÓN Y ENTREGA

Implementar pruebas significativas sobre dinero, permisos, aislamiento y stock. Verificar en navegador los flujos completos y el diseño en celular, tablet y escritorio

Casos mínimos:
1) Administrador crea dueño con dos cupos. El dueño crea dos polacos y el tercero se bloquea aunque los anteriores no estén conectados
2) Retirar un polaco libera cupo. Restaurarlo cuando el cupo ya está ocupado se rechaza sin perder datos
3) Usuarios de otro grupo no pueden consultar ni cambiar datos, archivos o conversaciones mediante interfaz, API o eventos
4) Dueño administra sus clientes y los de sus trabajadores desde su propia cuenta
5) Dos polacos intentan usar la última unidad disponible y solo uno lo consigue
6) Solicitud de precio bloquea unidades y pagos. Rechazo conserva reserva. Reenvío no duplica stock. Cancelación definitiva libera exactamente una vez
7) Aprobación o elección del precio original confirma la compra sin un segundo descuento de inventario
8) Cambiar el catálogo no altera precios pactados anteriormente
9) Varias unidades producen el total y calendario correctos
10) Abono de ₡20 000 sobre deuda de ₡100 000 con cuotas de ₡10 000 elimina las cuotas finales y mantiene las próximas
11) Pago parcial, adelanto, liquidación y corrección dejan saldo y calendario coherentes sin cobros duplicados
12) Calendarios funcionan con fin de mes, frecuencia quincenal, trimestre y fechas personalizadas en Costa Rica
13) Acceso de lectura no permite editar. Edición está limitada al alcance. Caducidad y revocación se aplican en servidor inmediatamente
14) Recordatorio de un cliente solo llega a su responsable. El dueño recibe por separado sus solicitudes de precio
15) Chat conserva texto, foto, audio y archivo tras recargar y después de un redespliegue
16) El polaco inicia soporte. El administrador responde y ve el grupo de origen. No puede iniciar un chat privado con otro polaco que nunca lo contactó
17) Transferir clientes preserva datos. Papelera restaura durante 30 días y purga todo el conjunto eliminado al vencer. Probar el tiempo con un reloj controlado sin esperar 30 días reales
18) Logo grupal y colores individuales persisten sin modificar otras cuentas
19) En Railway funcionan inicio de sesión, permisos, inventario, aprobación, cobro y chat con datos de prueba aislados

Entregar:
- Código completo en /home/kutex/project/polacos
- Aplicación publicada con URL comprobada de Railway
- README con ejecución local, configuración, migraciones, almacenamiento, tareas programadas y acceso administrativo inicial
- Registro de decisiones y supuestos relevantes
- Resultados concretos de pruebas, build y git diff --check cuando corresponda
- Resumen de lo implementado y cualquier bloqueo real o comprobación pendiente

Continúa hasta completar el alcance. Una pantalla estática, botones sin lógica o datos ficticios no cumplen la entrega

## Ampliación: cierre de caja y contador de efectivo

Solicitud posterior del usuario: reproducir el funcionamiento de Bar Chana adaptado a pagos de Polacos. El polaco ve únicamente sus cobros. El dueño elige solo él o todo el equipo. El polaco puede enviar su cierre al dueño para revisión. Se incluye también el contador independiente de billetes y monedas. Flujo, permisos, corte, medios de pago, conservación y diferencias descritos en `CAJA.md`.

## Cambio posterior: administración estadística sin soporte

Esta decisión reemplaza las funciones anteriores de soporte, notas y revisión de fichas comerciales por el administrador. El usuario pide retirar toda comunicación con soporte para dueños y polacos. El administrador queda exclusivamente con estadísticas de la plataforma y gestión de grupos/usuarios; su configuración personal se conserva desde el avatar. El servidor también impide recuperar las operaciones retiradas por rutas antiguas. Chats internos y cierres de dueño/polacos continúan. Detalle vigente en `ADMINISTRACION.md`.

## Copia pública de pruebas · 20 de noviembre de 2026

Repositorio y proyecto Railway independientes. Se conserva la aplicación actual y sus colores. Entrada con tres botones: Administrador con sus credenciales existentes, Dueño y Polaco sin contraseña. Se llena con datos ficticios y se conservan las ediciones. Gestión Neutral sirve de referencia para la entrada por perfil, no para eliminar las paletas. No modificar el acceso ni los datos de la instalación original.

## Cambio del 21 de noviembre de 2026: precios, ubicación, avisos y caja

Vigente en original y demo. Los productos se dan de alta con precio de compra y porcentaje de ganancia sobre costo. Ejemplo: ₡10000 + 25% = ₡12500. Los precios calculados se redondean al múltiplo de ₡5 más cercano; los empates hacia arriba. Los descuentos solicitados por polacos se introducen como porcentaje del catálogo y se redondean igual. La solicitud del dueño prioriza el porcentaje sin ocultar importes. Se admiten hasta dos decimales de porcentaje. No se inventan costos históricos ni se actualizan precios de compras previas.

Provincia y cantón son opcionales al crear o editar clientes. Cada notificación muestra fecha y hora. Solo el efectivo se verifica en cierres: SINPE y tarjeta se calculan y suman al total final. El contador independiente y las funciones de medios de pago conservan su comportamiento.
