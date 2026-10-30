# Sesion administrativa durante escrituras

Fecha: 2026-10-30, America/Managua. Solo desarrollo; sin migraciones ni despliegue.

## Alcance

- Usuarios, roles, bancos, sucursales, cuentas, movimientos y comisiones comparten ahora validacion obligatoria de version de sesion entera entre 0 y 2147483647. No se admite version ausente como compatibilidad heredada.
- El mismo control protege restablecimiento de clave temporal y revocacion de sesiones. El cambio obligatorio de contrasena se rechaza tanto en el actor recibido como en su estado actual en SQL.
- Se conserva la comprobacion de usuario activo, rol JEFA activo y version exacta dentro de la transaccion. Se mantienen los permisos, la proteccion del ultimo Administrador y la auditoria obligatoria existentes.
- El bloqueo compartido de las filas de usuario/rol permanece hasta commit o rollback. Una revocacion concurrente espera si la operacion ya fue autorizada; si la revocacion gana primero, la comprobacion observa la version nueva y rechaza la escritura. No se promete cancelar retrospectivamente una operacion ya confirmada.
- Se conserva el bloqueo asesor de administracion existente y no se introduce bloqueo global de transacciones de caja. Los cambios de identidad/rol que compitan pueden esperar; medir latencia en uso representativo sigue pendiente.

## Pruebas

- Matriz de nueve entradas administrativas: versiones ausentes, mal tipadas o fuera de rango, perfiles no autorizados y cambio obligatorio, sin llegar a SQL para identidad invalida.
- PostgreSQL preview: sesion revocada, usuario inactivo/bloqueado, cambio obligatorio, cambio de rol y rol inactivo, sin auditoria de exito. Guardado valido, autorrevocacion y rollback de version si falla la auditoria.
- Dos conexiones reales: los bloqueos de usuario y rol impiden una revocacion/cambio concurrente antes de terminar la escritura; despues de liberar el bloqueo se puede revocar y el actor anterior es rechazado.
- Caso inverso: autorizacion realmente esperando un bloqueo PostgreSQL, revocacion confirmada y rechazo posterior sin auditoria. Datos sinteticos de concurrencia eliminados; cambios financieros de prueba revertidos.
- Once pruebas nuevas aprobadas. Ocho casos de la matriz SQL repetidos bajo rol restringido; las pruebas de concurrencia con conexiones separadas se ejecutan con el propietario de preview, no acreditan ese rol restringido.

## Publicacion

- No requiere DDL adicional. La migracion 055 del paquete acumulado continua pendiente de produccion.
- El cliente normal ya recibe version de sesion desde autenticacion; clientes internos que omitan esa identidad son rechazados. No se exige enviar la version en el cuerpo del formulario ni confiar en un valor elegido por el cliente.
- Antes de publicar: QA administrativo y financiero del paquete, revision del diff sin archivos privados, autorizacion, pausa de operaciones, respaldo productivo reciente restaurado/ensayado y preflight de migraciones/Render. Ver CANDIDATO_PRODUCCION_2026-10-29.md.
- Quedan pendientes optimizacion del historial, medicion representativa, retencion/alertas y matriz completa por registro. Este bloque no cierra todo el checklist ni acredita vulneracion previa.
