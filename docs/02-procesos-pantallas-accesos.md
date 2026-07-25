# Procesos, pantallas y accesos TEMO

Este documento define la primera version funcional del sistema TEMO para Miscelanea Olivera. La base actual ya contempla dos perfiles principales:

- **Duena**: acceso completo, incluyendo comisiones, cierres, configuracion y reportes gerenciales.
- **Cajero**: operacion diaria de caja, registro de transacciones, arqueos y reportes operativos sin informacion de comisiones.

## Procesos principales

| Proceso | Objetivo | Usuario principal | Resultado esperado |
| --- | --- | --- | --- |
| Inicio de sesion | Identificar al usuario y cargar permisos | Duena, Cajero | Sesion activa con menu segun rol |
| Apertura de dia | Crear el dia operativo por sucursal | Duena | Dia abierto para registrar turnos |
| Apertura de turno | Asignar caja, cajero y efectivo inicial | Duena, Cajero | Turno abierto con conteo inicial |
| Registro de transacciones | Registrar depositos, retiros, remesas, pagos y otros movimientos | Cajero, Duena | Transaccion guardada con movimientos de efectivo/cuenta |
| Anulacion de transacciones | Reversar una transaccion con motivo | Cajero, Duena | Transaccion anulada y reversos creados |
| Correccion de transacciones cerradas | Corregir operaciones despues del cierre sin borrar historial | Duena | Nueva transaccion correctiva trazable |
| Gestion de pendientes | Controlar cuentas por cobrar o por pagar | Cajero, Duena | Pendiente actualizado con abonos y estado |
| Arqueo de caja | Contar efectivo por denominacion | Cajero, Duena | Conteo fisico comparado contra sistema |
| Cierre de turno | Finalizar turno y enviar diferencias a revision | Cajero | Turno cerrado o pendiente de aprobacion |
| Aprobacion de cierres | Revisar diferencias y aprobar/rechazar cierres | Duena | Turno aprobado o devuelto con observacion |
| Cierre diario | Consolidar cajas, bancos, comisiones y diferencias del dia | Duena | Dia cerrado con resumen oficial |
| Gestion de bancos/saldos | Administrar entidades, cuentas y saldos operativos | Duena | Catalogo financiero vigente |
| Gestion de comisiones | Definir reglas y consultar ganancias | Duena | Reglas activas y reportes de comision |
| Reportes | Consultar movimientos, cierres, pendientes y saldos | Duena, Cajero | Informacion filtrable y exportable |
| Importacion historica | Cargar registros desde Excel anterior | Duena | Datos historicos validados o rechazados |
| Gestion de usuarios | Administrar usuarios, credenciales temporales, roles y estados | Duena | Usuarios activos con rol asignado |
| Gestion de roles y permisos | Administrar roles y permisos por pantalla o funcion | Duena | Matriz de permisos vigente por rol |
| Auditoria | Revisar acciones sensibles del sistema | Duena | Historial de cambios y accesos |

## Pantallas existentes o previstas

| Pantalla | Ruta sugerida | Que muestra | Acceso |
| --- | --- | --- | --- |
| Login | `/login` | Usuario, contrasena, estado de conexion, mensajes de error | Duena, Cajero |
| Panel de duena | `/duena` o `/dashboard` | Resumen del dia, efectivo NIO/USD, entidades, comisiones, turnos abiertos, alertas | Duena |
| Panel de cajero | `/caja` | Turno activo, botones rapidos de transaccion, efectivo esperado, pendientes del cajero | Cajero |
| Turnos | `/turnos` | Turnos abiertos, cerrados, pendientes de aprobacion, filtros por fecha/sucursal/cajero | Duena, Cajero limitado |
| Apertura de turno | `/turnos/nuevo` | Sucursal, caja, cajero, fecha, conteo inicial por denominacion | Duena, Cajero |
| Detalle de turno | `/turnos/:id` | Transacciones del turno, totales, arqueos, diferencias, bitacora | Duena, Cajero si es su turno |
| Transacciones | `/transacciones` | Listado filtrable por fecha, entidad, movimiento, moneda, cajero y estado | Duena, Cajero limitado |
| Nueva transaccion | `/transacciones/nueva` | Entidad, movimiento, moneda, monto, metodo de pago, cliente/proveedor, descripcion | Duena, Cajero |
| Detalle de transaccion | `/transacciones/:id` | Datos completos, importes, movimientos, estado, motivo de anulacion/correccion | Duena, Cajero limitado |
| Arqueo | `/arqueo` | Conteo por denominaciones NIO/USD, esperado del sistema, diferencia | Duena, Cajero |
| Cierre de turno | `/turnos/:id/cierre` | Resumen del turno, conteo final, observaciones, envio a revision | Duena, Cajero si es su turno |
| Aprobaciones | `/aprobaciones` | Cierres con diferencia, anulaciones sensibles, correcciones pendientes | Duena |
| Pendientes | `/pendientes` | Por cobrar, por pagar, vencidos, abonados, pagados, filtros por persona | Duena, Cajero |
| Abono a pendiente | `/pendientes/:id/abono` | Monto, moneda, metodo de pago, observacion | Duena, Cajero |
| Bancos y entidades | `/bancos` | BAC, BANPRO, LAFISE, BDF, PEX, TELEDOLAR, saldos y cuentas | Duena |
| Cuentas financieras | `/cuentas` | Alias, moneda, entidad, sucursal/global, estado | Duena |
| Catalogos | `/catalogos` | Sucursales, cajas, monedas, denominaciones, tipos de movimiento, metodos de pago | Duena |
| Comisiones | `/comisiones` | Reglas por entidad/movimiento, rangos, vigencia, moneda, historico | Duena |
| Reportes operativos | `/reportes/operativos` | Transacciones, turnos, arqueos, pendientes, exportacion | Duena, Cajero |
| Reporte de comisiones | `/reportes/comisiones` | Ganancias por entidad, movimiento, fecha, sucursal, cajero y moneda | Duena |
| Cierre diario | `/cierres/diarios` | Totales por caja, efectivo contado, saldos de cuentas, comisiones, diferencias | Duena |
| Importacion historica | `/importaciones` | Carga de Excel, validaciones, errores, asignacion de sucursal/caja/cajero | Duena |
| Gestion de usuarios | `/usuarios` | IdUsuario, nombres, apellidos, usuario, rol asignado, estado | Duena |
| Roles y permisos | `/roles-permisos` | Roles, permisos disponibles y matriz de permisos por rol | Duena |
| Auditoria | `/auditoria` | Acciones realizadas, usuario, fecha, entidad afectada, datos antes/despues | Duena |

## Menu por rol

### Duena

La duena debe ver el menu completo:

- Panel Jefa.
- Mi caja: Arqueo, Aprobaciones y Pendientes.
- Turnos: Apertura turno y Cierres diarios.
- Transacciones: Nueva transaccion.
- Bancos: Cuentas, Catalogos y Comisiones.
- Reportes: Reportes operativos y Reporte comisiones.
- Gestion usuarios: Roles y permisos.
- Auditoria.
- Importaciones.
- Login.

En pantallas anchas, el menu lateral debe permanecer visible. En pantallas pequenas, el boton de tres barras debe desplegarlo como menu superpuesto; al seleccionar una pantalla, volver/cambiar ruta o tocar el area activa, el menu debe ocultarse.

### Cajero

El cajero debe ver solo opciones operativas:

- Mi caja
- Turnos
- Transacciones
- Arqueo
- Pendientes
- Reportes operativos

El cajero no debe recibir desde el backend datos de comisiones, reglas de comision, ganancias, auditoria general ni configuracion sensible.

## Contenido minimo por pantalla

### Panel de duena

- Indicadores del dia: efectivo NIO, efectivo USD, transferencias, pendientes y diferencias.
- Resumen de comisiones del dia, semana y mes.
- Turnos abiertos o pendientes de aprobacion.
- Saldos por entidad: BAC, BANPRO, LAFISE, BDF, PEX, TELEDOLAR.
- Alertas: diferencias de caja, pendientes vencidos, cierres sin aprobar.

### Panel de cajero

- Estado del turno activo.
- Acceso directo a nueva transaccion.
- Conteo de efectivo esperado por moneda.
- Transacciones recientes del turno.
- Pendientes asociados a operaciones registradas por el cajero.
- Boton de cierre de turno cuando corresponda.

### Nueva transaccion

Campos base:

- Entidad operativa.
- Tipo de movimiento.
- Moneda y monto original.
- Metodo de pago: efectivo, transferencia, credito o mixto.
- Cliente/proveedor cuando el movimiento lo requiera.
- Cuenta financiera afectada cuando aplique.
- Tipo de cambio cuando aplique.
- Descripcion u observacion.

Validaciones:

- Debe existir turno abierto.
- El movimiento debe estar activo.
- El monto debe ser mayor que cero.
- Si genera pendiente, debe tener cliente/proveedor.
- Si usa cuenta financiera, debe indicar cuenta.

### Arqueo y cierre de turno

- Conteo por denominaciones NIO y USD.
- Total contado.
- Total calculado por sistema.
- Diferencia.
- Observaciones.
- Estado final: cerrado sin diferencia o pendiente de aprobacion.

### Comisiones

- Reglas por entidad y movimiento.
- Tipo de calculo: fija, porcentaje, fija mas porcentaje, por rango o manual.
- Moneda de transaccion y moneda de comision.
- Vigencia desde/hasta.
- Simulador de comision antes de guardar.
- Historial de cambios.

### Reportes

Reportes recomendados:

- Transacciones por fecha, entidad, movimiento, cajero, sucursal y estado.
- Turnos por fecha, caja, cajero y diferencia.
- Pendientes por estado, vencimiento y persona.
- Saldos de cuentas financieras.
- Arqueos por turno.
- Comisiones por fecha, entidad, movimiento, cajero, sucursal y moneda.
- Auditoria de anulaciones y correcciones.

### Gestion de usuarios

- IdUsuario generado por el sistema.
- Nombres y apellidos separados para busqueda y reportes.
- Usuario unico para iniciar sesion.
- Contrasena temporal capturada en pantalla, pero almacenada como `password_hash`.
- Rol asociado mediante IdRol.
- Estado: activo, inactivo o bloqueado.
- Indicador para obligar cambio de contrasena en el primer inicio.

### Roles y permisos

- Roles: IdRol, detalle o nombre clave, nombre visible, descripcion y estado.
- Permisos: IdPermiso, detalle o nombre clave, descripcion y estado.
- Relacion muchos-a-muchos entre roles y permisos.
- Matriz para activar permisos por rol segun pantalla o funcion.
- La duena debe tener todos los permisos activos por defecto.

## Reglas de acceso por datos sensibles

| Dato | Duena | Cajero |
| --- | --- | --- |
| Comisiones calculadas | Si | No |
| Reglas de comision | Si | No |
| Reporte de ganancias | Si | No |
| Auditoria completa | Si | No |
| Usuarios y permisos | Si | No |
| Roles y permisos | Si | No |
| Catalogos financieros | Si | No |
| Transacciones propias del turno | Si | Si |
| Transacciones de otros cajeros | Si | Solo consulta limitada si se autoriza |
| Cierres con diferencia | Si | Solo puede enviar a revision |
| Correcciones de turnos cerrados | Si | No |

## Estandar CRUD de tablas

Todas las tablas administrativas deben compartir el mismo comportamiento:

- Alta y edicion mediante modal superpuesto a la pantalla actual.
- Botones explicitos de guardar y cancelar.
- Inactivacion de registros en lugar de eliminacion fisica.
- Switch para mostrar u ocultar registros inactivos.
- Columna `N°` al extremo izquierdo.
- Columna `Estado` oculta en tabla; el estado se evidencia con el icono de la fila.
- Orden descendente por defecto, dejando primero los registros mas recientes o valores mas altos.
- Buscador general que revise todos los registros, incluso los de otras paginas y aunque esten inactivos.
- Filtro por columna desde cada encabezado.
- Filtro de estado mediante icono en encabezado, visible solo cuando se activa `Mostrar inactivos`.
- Ordenamiento por columna en ciclo: ascendente, descendente y sin orden.
- Paginacion con 10 registros por defecto y opciones de 10, 20, 30, 50 y 100.
- Navegacion a primera pagina, pagina anterior, pagina siguiente y ultima pagina.
- Exportacion de la vista filtrada a Excel y PDF.
- Botones con iconos para agregar, editar, inactivar, reactivar y exportar.
- Doble click sobre una fila abre un modal de solo lectura con todos los datos y boton de editar.

### Permisos por rol

La pantalla de roles y permisos debe iniciar mostrando las filas de roles existentes. Al seleccionar un rol, se abre un modal con todos los permisos disponibles:

- Enumeracion del permiso.
- Nombre clave.
- Descripcion.
- Switch para activar o desactivar el permiso en ese rol.

Cada nueva pantalla o funcion agregada al sistema debe registrarse tambien como permiso para poder asignarla por rol.

## Orden recomendado de implementacion

1. Login real con roles y permisos.
2. Menu dinamico por rol.
3. Panel de cajero y panel de duena separados.
4. Apertura de turno con conteo inicial.
5. Registro de transacciones conectado a catalogos.
6. Listado y detalle de transacciones.
7. Arqueo y cierre de turno.
8. Aprobacion de cierres por la duena.
9. Pendientes y abonos.
10. Reportes operativos.
11. Comisiones y reporte de ganancias.
12. Cierre diario.
13. Catalogos, usuarios, auditoria e importacion historica.
