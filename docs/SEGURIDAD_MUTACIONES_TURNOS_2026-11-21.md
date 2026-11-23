# Seguridad de correcciones y cierre de turnos — 2026-11-21

Estado: desarrollo; sin publicación, migración ni modificación de datos productivos.

## Problema y comportamiento resultante

La edición de apertura y la corrección de un turno cerrado comprobaban su estado antes de entrar a la transacción. Entre esa lectura y la escritura, otra operación podía cambiar el estado. Algunas escrituras de arqueo también reutilizaban la caja de la lectura preliminar, aunque el turno ya hubiese cambiado de caja.

Ahora la transacción revalida la identidad vigente y obtiene estado, cajero, caja y sucursal bajo un bloqueo de fila del turno, conservado hasta commit/rollback. La comprobación preliminar sigue dando un rechazo temprano, pero ya no es la autorización definitiva de escritura. No se mantiene el bloqueo mientras una persona revisa el formulario.

| Operación | Perfil y alcance conservados | Comprobación dentro de la escritura |
| --- | --- | --- |
| Editar apertura | Administrador | Turno pendiente de apertura, abierto o pendiente de aprobación; rechaza cerrado, anulado o en revisión |
| Corregir cierre | Administrador | Turno cerrado; vuelve a comprobar que no fue entregado mediante un traspaso aceptado; usa sucursal/caja actuales |
| Cerrar turno | Administrador | Abierto, pendiente de aprobación o en revisión; conserva versión de solicitud y auditoría; usa caja actual |
| Guardar arqueo | Administrador o cajero propietario | Estado permitido, propietario vigente y bloqueo por solicitud/traspaso; usa caja actual |
| Guardar saldos | Administrador o cajero propietario | Reutiliza la comprobación común de estado/propietario y conserva la protección por solicitud/traspaso |

Al actualizar un arqueo existente se conserva su relación con la caja vigente del turno; al insertar uno nuevo se usa esa misma caja validada. No se ejecuta una reparación masiva del historial. Se conservan denominaciones, tasas, diferencias, recibos de transacciones/transferencias y aislamiento del receptor en traspasos en revisión.

## Evidencia dirigida

22 pruebas nuevas aprobadas, sin omitidas. La suite transaccional con savepoints y rollback se ejecutó con rol SQL restringido; el caso de dos conexiones usa fixtures propios identificados y limpieza posterior, no se declara ejecutado con ese rol.

- Cajero propietario puede consultar/guardar; otros cajeros de la misma u otra sucursal no pueden consultar ni modificar ese turno. Cajero/Transferista no pueden ejecutar correcciones administrativas.
- Transiciones de estado entre la lectura inicial y la escritura: rechazos sin modificar arqueos, denominaciones, saldos, totales, observaciones ni auditoría de éxito.
- Cambio de propietario: el anterior pierde autorización antes de escribir.
- Traspaso aceptado después de la consulta inicial: corrección histórica rechazada.
- Caja cambiada: conteos nuevos y existentes quedan vinculados a la caja actual en guardado, cierre y corrección histórica.
- Fallo de auditoría: rollback completo de la corrección histórica.
- Casos permitidos: apertura en sus tres estados admitidos, cierre normal y corrección histórica sin traspaso.
- Dos conexiones reales: se comprueba la espera mediante pg_blocking_pids; el cierre confirmado gana y la edición antigua recibe 409, sin alterar el conteo ni el efectivo inicial.

## Validación general

Regresión final: 433 pruebas backend y 37 frontend aprobadas, sin fallos ni omitidas. Compilación y lint correctos. Siete suites de navegador aprobadas: tabla, filtros de moneda, revisión, pendientes, cambio, versión de edición y diferencias históricas (1366×768 y 1920×1080). APIs sintéticas interceptadas; no se hicieron pruebas financieras productivas.

Los 22 casos nuevos forman parte del total backend y también se ejecutaron por separado con la configuración de rol restringido indicada arriba. No se cuentan como 22 casos adicionales al total. Vite mantiene el aviso de tamaño del bundle superior a 500 kB.

Desarrollo reiniciado conservando la base existente y con correo deshabilitado. Health/API y web responden 200; consulta anónima de Turnos rechazada con 401.

## Límites y pendientes

Este bloque cierra la revalidación transaccional de estas rutas; no implementa versiones de formulario/recibos idempotentes para todas las correcciones de turno. Dos ediciones administrativas aún permitidas sobre el mismo estado no adquieren aquí detección de borradores antiguos por versión. Tampoco completa la matriz granular de todos los módulos ni los controles externos de auditoría, retención, alertas o CA desde Render. No cambia las reglas de reasignación administrativa de usuarios/sucursales.
