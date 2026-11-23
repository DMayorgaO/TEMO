# Matriz de rutas financieras — 2026-11-06, solo desarrollo

## Alcance

Refuerzo de 23 rutas de Transacciones/Pendientes, Transferencias y Compra de dólares. No hay migración nueva en este bloque; la 056 pertenece al bloque anterior de Directorio y continúa únicamente local. No se consultó ni modificó producción.

| Grupo | Rutas | Administrador | Cajero | Transferista |
| --- | ---: | --- | --- | --- |
| Transacciones y pendientes | 16 | Permitido con controles de registro | Permitido con controles de registro | Rechazado |
| Transferencias | 6 | Permitido con controles financieros | Permitido con controles de turno/tipo | Permitido con controles financieros |
| Compra de dólares | 1 | Permitido | Limitado por cajero/turno | Rechazado |

`OperationalRouteGuard` se ejecuta después del AuthGuard global y antes del cuerpo del controlador. Rechaza perfiles no permitidos, cambio obligatorio de contraseña y versiones de sesión ausentes o mal tipadas. No sustituye la validación real de sesión del AuthGuard, los controles de propiedad ni la revalidación transaccional de escrituras/recibos.

Las rutas sin filtros definidos rechazan parámetros de consulta en lugar de ignorarlos. Las dos consultas de listado de Transacciones conservan sus contratos estrictos existentes de paginación/filtros. La reapertura individual de un pago pendiente rechaza campos adicionales en su cuerpo. No se aceptan parámetros de rol o de turno como autorización. El `userId` compatible de creación de transacciones sigue reemplazándose por la identidad autenticada.

Las lecturas de Transferencias también rechazan perfiles desconocidos y cambio obligatorio de contraseña dentro del servicio. Compra de dólares agrega ese rechazo de cambio obligatorio. No se amplían ni reducen las facultades funcionales existentes de los tres roles soportados.

## Alcance por registro verificado

- Transferencias: un cajero ve sus registros en turnos abiertos, pendientes de aprobación o en revisión; no los de otro cajero, incluso en su misma sucursal, ni los de otra sucursal. Un turno cerrado deja de ser accesible para el cajero. Administrador y Transferista conservan sus consultas autorizadas, incluso históricas.
- Compra de dólares: el libro de otro cajero/sucursal no aparece en la consulta del cajero; al cerrar su turno deja de aparecer para él y permanece disponible para el Administrador.
- Se conservaron las pruebas existentes de exportaciones, recibos, revocación, cierres, pagos y correcciones. No se cambió la política existente de lectura de detalles de Transacciones por sucursal/día; no debe confundirse con la política más estrecha de Transferencias.

## Evidencia y límites

`operational-http-permissions.test.cjs`: servidor Nest real sobre loopback y puerto efímero, AuthGuard/controladores/guard/pipes reales; identidad y servicios simulados para comprobar que los rechazos no ejecutan SQL ni servicio. Descubre las rutas de los tres controladores y exige exactamente 23: agregar una ruta obliga a revisar la matriz. 337 comprobaciones de roles/rechazos, además de consultas válidas y atribución del actor. Incluye dos pruebas contabilizadas en la suite, no 337 pruebas adicionales. La simulación de token revocado no pretende sustituir las pruebas reales de revocación de la suite financiera.

`financial-request-security.test.cjs`: se añadieron matrices SQL reales para Transferencias y Compra de dólares, con registros sintéticos en preview local y rollback completo. Se prueban los estados abierto, pendiente de aprobación, revisión y cerrado; otro cajero de la misma sucursal y otro de sucursal distinta; también se verifica que las consultas autorizadas continúan funcionando.

El rojo del encabezado de Transacciones pasa de `#fff0ed` a `#fbe0dc`, manteniendo amarillo/verde y el aviso del campo Monto. El navegador comprueba los tres tonos y el saldo dinámico con APIs interceptadas.

Las identidades simuladas de las pruebas históricas de consultas/UUID ahora incluyen versión de sesión válida, conservando sus aserciones. El ensayo de repetibilidad de 055 utiliza una copia temporal de recibos de su vocabulario histórico para no intentar estrechar el CHECK de la base preview que ya admite Directorio mediante 056. Conserva y compara los recibos copiados y las versiones de Transferencias; todo se revierte. No se modifica 055 ni se eliminan recibos existentes.

Verificación final: build/lint aprobados; 369 pruebas backend y 37 frontend sin fallos ni omisiones; 69 comprobaciones repetidas con rol SQL restringido aprobadas. Ocho suites de navegador aprobadas: tabla de transacciones, filtros de monedas, transacciones en revisión, pagos pendientes, edición/anulación, versión de edición, saldo dinámico/encabezado y recibos/orden de Directorio. Se actualizó la expectativa visual histórica que buscaba el color dentro del recuadro: ahora comprueba el encabezado completo, el interior transparente y el rojo solicitado. Sus pruebas financieras y de reintentos permanecen.

API y web locales responden 200; desarrollo iniciado conservando datos y correo deshabilitado. Sin commit ni push de este bloque. La matriz de las demás rutas, la centralización/retención/alertas externas, la comprobación negativa de CA en Render y controles de infraestructura continúan pendientes. No se declara concluida la seguridad del sistema.
