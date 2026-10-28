# Permisos, auditoria y solicitudes financieras

Fecha: 2026-10-26, America/Managua. Solo desarrollo; sin commit, push ni despliegue.

## Alcance implementado

- Altas de grupos de transacciones y transferencias aceptan requestId UUID. El navegador conserva la referencia durante toda la vida del formulario, incluso tras error de red o cambio posterior del borrador. Otra apertura explicita del formulario crea otra referencia.
- La migracion 049 agrega recibos en solicitudes_financieras, con clave usuario/operacion/referencia, huella SHA-256 y respuesta original. El recibo se confirma en la misma transaccion que el dinero y la auditoria; no guarda el cuerpo de la solicitud ni credenciales. La respuesta contiene datos operativos privados y no tiene endpoint publico de consulta.
- Bloqueo transaccional por clave: dos peticiones concurrentes con la misma referencia crean una sola operacion. Datos distintos con una referencia ya confirmada devuelven conflicto, sin un segundo movimiento. Una referencia diferente puede representar una operacion legitimamente identica.
- La repeticion revalida identidad y alcance actual antes de devolver la respuesta. No devuelve registros cerrados a un cajero que ya no puede consultarlos. Los recibos no se actualizan, borran ni caducan automaticamente. PUBLIC, anon y authenticated no reciben acceso a la tabla.
- Usuarios activos, rol vigente, version de sesion y cambio obligatorio de clave se comprueban dentro de las escrituras cubiertas; se mantienen bloqueados los registros de identidad/rol hasta finalizar la transaccion. El controlador de transacciones toma la identidad de la sesion, no del cuerpo.
- El cliente evita envios simultaneos por doble clic. No hay reintentos automaticos. Al confirmar una transaccion consulta la tabla actual, en lugar de agregar otra copia local de una respuesta repetida o desactualizada.
- La generacion de referencias usa getRandomValues, compatible con el preview HTTP de red local; no depende de randomUUID ni usa Math.random como alternativa.
- Auditoria de traspasos: modalidad, estado anterior/posterior, cajeros, turnos, efectivo NIO/USD, diferencia registrada, pendiente y referencia de compras. Rechazo/cancelacion conservan participantes y estado anterior.
- Registrar diferencia conserva el importe anterior y posterior. Las correcciones de arqueo/saldos EN_REVISION registran antes/despues atomicos, con unidades por denominacion y saldos de cuentas. Los valores NUMERIC de cuentas se conservan como cadenas sin redondeo adicional. Repetir un guardado sin cambios no agrega otra auditoria de correccion.
- La aprobacion administrativa del cierre registra estado, conteo y saldos anteriores/posteriores. El visor solo expone campos expresamente permitidos; no expande snapshots, cuerpos ni secretos.

## Transferencias: riesgos adicionales corregidos

La edicion podia seleccionar otro turno, y el reverso podia aplicarse usando ese destino. Ahora el turno de una transferencia es inmutable en edicion, tanto en interfaz como en API. Si corresponde cambiarlo, se requiere anular y registrar otra operacion en turnos que admitan esas acciones.

Las ediciones y anulaciones ahora bloquean el turno original y releen la transferencia despues del bloqueo. Se evita aplicar un reverso calculado con un monto/estado anterior a otra solicitud concurrente. Dos anulaciones simultaneas solo restauran dinero una vez; la segunda se rechaza.

No se editan ni anulan transferencias de turnos cerrados, tampoco con perfil Administrador/Transferista. No se inventa una correccion historica que altere existencias de un cierre; ese procedimiento especial requiere definicion aparte.

## Matriz verificada

| Operacion | Administrador | Cajero | Transferista |
| --- | --- | --- | --- |
| Alta de transacciones | Identidad/turno propio validado | Turno propio operativo; EN_REVISION con ID explicito | Rechazado |
| Editar/anular transaccion | Conserva la correccion historica existente | Propia ABIERTO/EN_REVISION; sin liquidaciones cruzadas | Rechazado |
| Corregir arqueo/saldos | Turnos que admiten correccion | Solo turno propio que admite correccion | Rechazado |
| Proponer/aceptar traspaso | No sustituye al cajero | Propietario/receptor, misma sucursal y disponibilidad | Rechazado |
| Aprobar cierre | Sesion vigente, exclusivo | Rechazado | Rechazado |
| Crear transferencia | Alcance operativo existente | Solo egreso de efectivo propio | Alcance operativo existente |
| Editar/anular transferencia | Sin cambiar turno ni tocar cerrado | Egreso propio; conserva restricciones | Sin cambiar turno ni tocar cerrado |
| IDs de otra sucursal: lectura, exportacion y correccion de cajero | Lectura administrativa conservada | Rechazado | No equivale al alcance autorizado de transferencias |

Tambien se prueban usuario desactivado, rol cambiado, version revocada y cambio obligatorio de clave. Esta matriz cubre estos flujos, no certifica toda la API.

## Dependencias y frontera HTTP

La revision actual de npm audit encontro 7 avisos (5 altos y 2 moderados), distintos del resultado historico del 10 de octubre. Se corrigieron sin cambiar versiones principales ni usar audit fix --force:

| Paquete | Version comprobada |
| --- | --- |
| body-parser | 2.4.0 |
| fast-uri | 3.1.9 |
| ip-address | 10.7.5 |
| zod | 4.6.7 |
| vite | 8.2.4 |
| @nestjs/platform-express | 11.2.8 |
| multer | 2.5.0 |

Multer requiere override porque el adaptador Nest aun declara 2.4.0. El adaptador se fija tambien en devDependencies de la raiz para que npm aplique realmente su override en este workspace: sin el ancla la configuracion estaba presente pero seguia instalando 2.4.0. No agrega otra copia del adaptador; npm ls --omit=dev confirma la misma dependencia de produccion con Multer 2.5.0. Al actualizar Nest hay que coordinar esta ancla y el override. Referencia: [aviso del mantenedor de Multer](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m).

Se verifico una instalacion limpia npm ci --ignore-scripts y npm audit sin avisos conocidos, completo y con --omit=dev (arbol de dependencias de produccion, no auditoria del servidor remoto). Una prueba del lock comprueba los pisos corregidos y la coherencia del ancla. Esto no garantiza ausencia de vulnerabilidades desconocidas; repetir la revision antes de publicar.

Vite se resuelve ahora desde el workspace, sin asumir que esta en frontend/node_modules: la instalacion puede elevarlo a node_modules de la raiz. No se ejecuta el script de reseed para comprobar este cambio.

La prueba HTTP envia un gzip con bytes sobrantes a una API temporal aislada y confirma rechazo 400 sanitizado, sin contenido privado, y salud posterior 200. Se reconocen los errores concretos de descompresion con status 400 sin convertir fallos internos arbitrarios en errores de usuario. Referencias: [aviso del mantenedor de body-parser](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828), [correccion de Zod](https://github.com/colinhacks/zod/pull/6652).

## Verificacion

- Backend completo: 200/200 pruebas con TEMO_TEST_PREVIEW=1 y TEMO_TEST_RESTRICTED_ROLE=1. Las suites financieras que admiten ese indicador usan el rol SQL restringido; no todas las pruebas crean conexiones con ese rol. Prueba HTTP de descompresion repetida despues de actualizar.
- Frontend: 27/27 pruebas unitarias. Compilacion y lint de ambos proyectos correctos.
- Concurrencia de recibos en conexiones PostgreSQL independientes: un solo efecto confirmado; UUID con distintas mayusculas no evita el bloqueo. Esquema temporal aislado, eliminado al terminar.
- Concurrencia real de transferencias: dos ediciones dejan C$ 800 desde C$ 1,000 y una transferencia final de C$ 200; dos anulaciones restauran exactamente C$ 1,000. No se altera la caja destino ni un turno cerrado. Fixtures locales eliminados al terminar.
- Fallos simulados de auditoria/recibo revierten dinero, registros y recibo; el mismo requestId puede usarse despues de un rollback real.
- Playwright: turno de revision explicito, doble clic sin segundo envio, respuesta perdida sin repeticion automatica, reenvio manual con la misma referencia y borrador modificado conservandola; formulario nuevo con otra referencia. Transferencias de efectivo incluidas. Una confirmacion repetida con monto original 10 y registro actual 30 muestra una sola fila con 30, no otra copia de la respuesta antigua. Todas las API interceptadas, sin operaciones reales.
- Regresion de traspasos y Arqueo/Saldos en escritorio/movil conservada. Preflight local de solo lectura comprueba indices, estado EN_REVISION, bases independientes y proteccion de recibos/revision.

## Limites y pendientes

- requestId sigue siendo opcional para compatibilidad con clientes anteriores. Este bloque protege las altas emitidas con referencia; no deduplica por monto/persona ni garantiza lo mismo para clientes antiguos sin ella.
- Recargar/cerrar el formulario pierde la referencia en memoria. Una operacion de resultado incierto debe conciliarse antes de abrir otra; no se implementa cola offline ni reenvio automatico.
- No se extiende todavia el recibo a liquidaciones de pendientes, todas las ediciones ni todas las operaciones financieras. La serializacion de transferencias no es un sistema universal de control de versiones contra ediciones humanas obsoletas.
- La respuesta del recibo es la original. Para estado actualizado se requiere lectura autorizada; la web ya la realiza al confirmar. No se crea un segundo evento financiero por devolver un recibo.
- Retencion/archivo cifrado de recibos y dimensionamiento siguen pendientes. No eliminarlos para liberar espacio sin disenar la conservacion de referencias y la auditoria.
- La separacion real de credenciales API/migraciones, privilegios remotos, cookies/CSRF, inventario de sesiones/dispositivos, alertas, Zero Trust y recuperacion productiva siguen abiertos.
- Antes de produccion: QA manual con Administradora y dos cajeros, respaldo reciente verificable, revision del diff y plan de retorno, migraciones 044-049 en orden (047 confirmada antes de usar el enum), API primero y web despues. Autorizacion expresa nueva obligatoria.

Migracion 049 aplicada solo en PostgreSQL local de preview. No se cambiaron credenciales remotas ni claves MFA. Control de gastos permanece local e ignorado por Git.
