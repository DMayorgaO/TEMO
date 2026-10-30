# Identidad vigente en operaciones de caja

Fecha: 2026-10-30, America/Managua. Solo desarrollo; sin DDL ni publicacion.

## Cambios

- Validacion comun del dominio de version de sesion: exclusivamente numero entero entre 0 y 2147483647. Se rechazan ausentes, null, cadenas, booleanos, arrays, objetos, fracciones, NaN, infinito y desbordamientos antes de consultar la identidad en SQL.
- Transacciones, liquidaciones individuales/multiples, ediciones/anulaciones de grupos y transferencias: comparacion exacta de version en validateFinancialActor, sin la excepcion anterior para version ausente. Identidad activa/rol vigente/cambio obligatorio y bloqueos compartidos se conservan.
- Los nueve tipos de recibo financiero validan la identidad antes de buscar una respuesta previa, ejecutar la operacion o devolver el recibo. No se cambian las claves de idempotencia, los saldos, los centavos, las reglas de turno ni los permisos por sucursal/registro.
- Directorio exige tambien version exacta al crear/editar/desactivar. Administracion y exportaciones reutilizan el validador comun sin relajar sus controles SQL ya existentes.
- Cuatro escrituras de Turnos incorporan validacion de actor dentro de su transaccion: creacion administrativa, apertura del turno preparado por su cajero, edicion de apertura y correccion de cierre historico. Las escrituras de arqueos/saldos/cierre que ya usaban el control reciben ahora el requisito estricto.
- Traspasos rechazan perfil incorrecto, cambio obligatorio o version mal formada antes de adquirir bloqueos: resumen, propuesta, registro de diferencia y aceptar/rechazar/cancelar. La comprobacion de estado actual en SQL permanece dentro de la transaccion; los bloqueos y la instantanea financiera no se sustituyen.

## Limites

- La version procede de la identidad autenticada del servidor, no de un nuevo campo editable de los formularios. No se cambian contrasenas, MFA o sesiones productivas desde esta tarea.
- No se afirma que hubiera un acceso externo demostrado: el guard global ya autentica las peticiones. Este bloque refuerza las comprobaciones internas y la ventana entre autenticacion y escritura.
- No convierte en rutas publicas ni elimina las llamadas internas confiables que crean lotes sin actor explicito en pruebas/importaciones. financialRequest conserva ese modo interno previo cuando no hay actor ni requestId; no esta certificado como interfaz externa.
- La comprobacion de identidad no sustituye revisar concurrencia de estado/alcance de cada registro. La matriz completa del checklist sigue abierta. La revalidacion de cuatro operaciones de turno no acredita por si sola todas sus carreras de estado.
- Los bloqueos existentes pueden provocar esperas ante cambios simultaneos de identidad. No se certifica capacidad/latencia de Render con estos ensayos locales.

## Evidencia

- Seis pruebas unitarias nuevas cubren dominio, nueve operaciones de recibo, roles/SQL exacto, Directorio, diez entradas de escritura de Turnos y acciones de Traspaso. Falsos clientes detectan si una identidad mal formada llega al trabajo protegido.
- PostgreSQL real: tres casos adicionales de Directorio, operaciones/recibos financieros y apertura/edicion administrativa. Sin cambios de efectivo o recibos por los intentos rechazados. Se conservan las pruebas de monedas de C$ 0.50/C$ 0.25, aislamiento de turnos y permisos por sucursal.
- Las identidades sinteticas de regresion ahora incluyen la version real retornada por PostgreSQL. La prueba concurrente de traspaso selecciona un Administrador activo sin cambio obligatorio; el primer intento revelo que antes elegia una identidad incompatible con la operacion.
- Regresion final y publicacion se registran en CHECKLIST_SEGURIDAD_TEMO.md y CANDIDATO_PRODUCCION_2026-10-29.md.
- Resultado final: 316 backend y 34 frontend sin fallos/omisiones, doce recorridos de navegador con API sintetica interceptada, compilacion/lint correctos. Veinticuatro pruebas financieras/Directorio repetidas bajo rol SQL restringido. Las pruebas de navegador no son operaciones productivas ni mediciones de Render.

## Salida

- No agrega migraciones. 055 sigue siendo la unica migracion pendiente del paquete acumulado segun la evidencia local; comprobar estado productivo real antes de aplicarla.
- Mantener pruebas manuales con Administrador/Cajero/Transferista y operaciones habituales antes de publicar; no usar sesiones suplantadas ni movimientos reales inventados para comprobar.
- Control de gastos y archivos privados permanecen locales. Sin commit, push ni cambio productivo por este bloque.
