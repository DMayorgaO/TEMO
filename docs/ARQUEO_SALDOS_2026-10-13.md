# Arqueo y saldos unificados

Estado: revisado y autorizado por el usuario; publicado y verificado el 2026-10-13 (America/Managua).

## Alcance

- Una pantalla Arqueo con saldos NIO y USD sobre el conteo fisico de ambas monedas.
- Se conserva la posicion de Arqueo en el menu; la ruta anterior de Saldos abre la pantalla unificada.
- Tablas compactas con espacio para C$ 1,000,000.00 y cantidades con cifras tabulares.
- Se retiran compras de dolares y diferencial por compras del arqueo y formulario de cierre; no se cambian los calculos financieros del backend.
- Hoy muestra su estado seleccionado en filtros compartidos y panel administrativo.
- Saldos y conteo usan el mismo turno seleccionado. Los turnos cerrados son de solo lectura.
- Los saldos se guardan al salir del campo o pulsar Enter. Los errores conservan el borrador; cambiar de turno no lo transfiere.
- Se conservan los detalles Pagos/Envios de Teledolar y se evita duplicar saldos al consolidar varias cuentas del mismo banco.

## Verificacion

- Compilacion y lint del frontend correctos.
- 21 pruebas unitarias frontend y 26 pruebas focalizadas de backend correctas en la verificacion de este bloque.
- Pruebas Playwright con respuestas sinteticas, sin cuentas ni escrituras en produccion.
- Roles JEFA y CAJERO: 1366x768, 1920x1080, 1280x720 y 1366x650 sin desplazamiento de documento ni cifras recortadas.
- Caso adicional con mas bancos comprobado en 1366x768.
- En movil 390x844 no hay desplazamiento horizontal; se conserva desplazamiento vertical para mantener legibilidad.
- Se prueban guardado, error de servidor, turnos historicos cerrados, aislamiento de borradores, multiples cuentas y estado de Hoy.

## Revision local

URL de desarrollo: http://127.0.0.1:3188/#/arqueo

Revision humana en desarrollo completada y publicacion autorizada. Recursos publicados verificados.
No se incluyen migraciones ni cambios de backend. El control interno de gastos permanece local y excluido de Git.

## Ajustes de revision

- Separacion verificada de 30px entre saldos y arqueo.
- Valores de ambas tablas con font-weight 700, sin cambiar los encabezados.
- Denominacion y Monto tienen el mismo ancho; se redistribuye el espacio restante a Cantidad.
- Saldo Sistema usa texto sin separadores durante la edicion y formato contable al perder foco. No se guarda por pulsacion.
- Se elimina el manejo de cursor contable por temporizadores en estos campos de la pantalla unificada; se conservan Enter para guardar y las validaciones de monto.
- Pruebas de escritura rapida, decimales, reemplazo completo, insercion y borrado dentro del numero, y monto enviado al servidor.
- La configuracion temporal de red local no forma parte de la publicacion.

## Evidencia de produccion

- Commit publicado: 25b0f2bc849c6bc0b6a1a0be425e3a914dd050ff.
- Web, JavaScript index-QSecQM5t.js y CSS index-FgYiN3a5.css responden HTTP 200.
- Bundle conectado a https://api.miscelaneaolivera.com/api, sin la direccion del servidor LAN de pruebas.
- CSP conserva los origenes permitidos; X-Frame-Options: DENY.
- /api/health: status ok, database ok, revision 25b0f2bc849c6bc0b6a1a0be425e3a914dd050ff.
- /api/shifts/current sin sesion responde HTTP 401.
- Playwright en produccion: login visible a 1366x768 y sin errores de JavaScript. No se usaron credenciales ni se modificaron datos reales.
- El control de gastos y los scripts temporales LAN permanecen excluidos de Git.
