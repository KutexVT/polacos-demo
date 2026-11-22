# Caja y conteo de efectivo

Basado en el cierre y el contador de `/home/kutex/Documentos/ChatGPT/Chana 2`. Se conserva conteo CRC por denominación, fondo configurable, corte de hasta 31 días, separación efectivo/SINPE/tarjeta, movimientos y contrapartidas, comparación de diferencias, confirmación, historial congelado y revisiones. En Polacos los ingresos son pagos de cuotas y abonos al capital. Una compra a crédito no cuenta como dinero recibido.

## Personas y permisos

- El polaco cuenta y cierra únicamente los pagos que él registró. Los permisos temporales sobre otros clientes no dan acceso a sus cajas.
- El dueño elige **Solo mis cobros** o **Todo el equipo**. La caja del equipo reúne los pagos de todas las personas y los movimientos personales y del equipo una sola vez. Para comparar tiene que contar el efectivo de todas esas cajas.
- Los cierres personales del polaco no aparecen al dueño hasta pulsar **Enviar al dueño**. El dueño los encuentra en **Enviados para revisar** y recibe una notificación. Puede marcar revisado y dejar una nota. La revisión no cambia cifras ni el conteo del cierre.
- Cada nueva revisión se guarda y se envía por separado. El cierre anterior permanece disponible.
- El administrador de plataforma no accede a cajas ni cierres. Estas funciones quedan exclusivamente para dueños y polacos.

## Uso

1. **Contar efectivo** suma billetes de 20000, 10000, 5000, 2000 y 1000 y monedas de 500, 100, 50, 25 y 10. Admite cantidades enteras, botones de sumar/restar y limpieza. **Usar este conteo en el cierre** lleva el conteo a la pantalla de cierre. El borrador se conserva mientras navegas en la aplicación; una recarga lo reinicia como en Chana.
2. **Cierre de caja → Nuevo cierre** propone el horario y el fondo configurados para esa caja. El dueño configura su caja personal y la del equipo por separado.
3. **Actualizar resumen** fija la hora del corte. Se usa la fecha y hora original de registro del pago en Costa Rica. La fecha de pago declarada en la compra se mantiene para los calendarios y reportes existentes. El límite final del intervalo es exclusivo. Los cobros que se registren después del corte quedan fuera.
4. Se muestran pagos, importes por cobrador, entradas/salidas adicionales, compras con saldo y actividad. Los saldos de compras usan sus condiciones actuales y los pagos registrados antes del corte; no suman dinero a la caja.
5. Se indica el fondo inicial del intervalo. El esperado en efectivo es fondo + cobros en efectivo + entradas − salidas. SINPE y tarjeta se calculan con los pagos y movimientos del intervalo. No tienen campos de verificación. Se suman automáticamente al efectivo contado para mostrar **Total del cierre**.
6. Las diferencias de efectivo o pagos sin clasificar exigen una observación. **Revisar cierre de caja** muestra la comparación antes de **Confirmar y guardar cierre**.
7. Los cierres guardados congelan nombres, cobros, conteo, movimientos, actividad y resultados. Consultar una compra abre su estado actual. Una corrección posterior exige crear una nueva revisión si se desea actualizar el cierre.

## Medios de pago

Los pagos nuevos permiten efectivo, SINPE, tarjeta y mixtos. Las partes deben sumar exactamente el importe abonado. El vuelto se calcula solo sobre efectivo entregado menos la parte del pago en efectivo. La corrección permite verificar o redistribuir medios con el motivo y la identidad real de quien la realiza.

Los pagos anteriores a esta función se conservan **Sin clasificar**. No se asume que fueran efectivo. Se pueden verificar desde la corrección de pago si se dispone de información real. Sus importes se muestran en el resumen pero no se asignan a un medio inventado.

## Conservación y concurrencia

Las cantidades se guardan en centavos enteros. Los importes de formularios se validan y convierten en el servidor. Los cierres y movimientos son inmutables en PostgreSQL. Un movimiento se anula mediante contrapartida con la misma fecha y medio. Retirar una persona no borra sus cierres. Eliminar todo un grupo sí elimina su historial asociado.

El resumen y el guardado comparten el bloqueo de transacción de cobros, correcciones y purgas. El servidor vuelve a calcular la huella del resumen antes de guardar. Si cambió informa que hay que actualizarlo. Los cobros y la auditoría usan la hora real de ejecución para no introducir cobros tardíos en un corte ya fijado. Las claves idempotentes evitan duplicar cierres, movimientos y contrapartidas al reintentar. Enviar o revisar dos veces tampoco duplica las notificaciones.

## Cambio del 21 de noviembre de 2026

Solo se compara el efectivo contado con el esperado. El servidor calcula SINPE y tarjeta; no acepta que un formulario sustituya esos importes. Los cierres históricos permanecen inmutables. Este cambio no altera el contador independiente ni el registro y la corrección de medios de pago.
