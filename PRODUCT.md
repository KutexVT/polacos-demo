# Polacos · Pruebas
<!-- impeccable:product-schema 1 -->
## Platform
web
## Stack
Delegada explícitamente por el usuario. React y Vite con Express y PostgreSQL. Una aplicación y una base de datos propias en Railway.
## Usuarios y propósito
Administrador de plataforma, dueños de grupos y trabajadores que venden a crédito y cobran en Costa Rica. Los clientes son registros sin cuenta. El administrador consulta estadísticas de uso y cantidades de registros. Crea grupos y administra sus usuarios y cupos. No tiene soporte, conversaciones, notas, notificaciones ni acceso a fichas comerciales o cajas. La configuración personal queda accesible desde su avatar. Para dueños y polacos el flujo principal es cliente → compra → calendario → cobro confirmado.
## Restricciones
El alcance acordado completo está en docs/REQUISITOS.md. Dinero exacto en CRC. Zona America/Costa_Rica. Aislamiento de grupos y permisos en servidor. Sin intereses ni pasarela. Esta copia usa exclusivamente datos ficticios en una base independiente. Dueño y Polaco son perfiles públicos compartidos con acceso directo. Administrador conserva usuario y contraseña. La muestra se crea una sola vez y no reinicia las ediciones.
## Accesibilidad
Uso prioritario desde celular. Texto legible al aire libre, controles amplios, etiquetas y estados textuales.
## Principios
La confirmación del servidor precede al éxito visual. Historia de pagos corregible y trazable. Las reservas bloquean stock hasta decisión final. Datos purgados no sostienen estadísticas ocultas.

## Caja
Cada polaco cierra solo los cobros que registró y puede enviar el cierre al dueño. El dueño elige sus propios cobros o todo el equipo y revisa los cierres recibidos con una nota. El administrador de plataforma no accede a cajas ni cierres. Contador independiente de billetes/monedas con el mismo funcionamiento de Bar Chana. Medios separados: efectivo, SINPE, tarjeta y mixto; los pagos anteriores sin medio permanecen sin clasificar. Cierres congelados, revisiones y contrapartidas trazables.

## Precios y ubicación
Los productos nuevos requieren costo de compra y ganancia porcentual sobre ese costo. La venta se redondea al múltiplo de ₡5 más cercano con empates hacia arriba. El polaco solicita descuentos porcentuales sobre el catálogo; el dueño ve porcentaje e importes. Costos históricos desconocidos permanecen pendientes. Cambiar el catálogo no altera compras pactadas. Provincia y cantón son datos opcionales del cliente. Las notificaciones muestran fecha y hora de Costa Rica. En caja solo se verifica efectivo; SINPE y tarjeta calculados se incluyen en el total.
