# Seguridad TEMO: contexto y checklist

Actualizado: 2026-10-30. Referencia local privada: INFORME_SEGURIDAD_TEMO_2026-10-06.md (no publicado).

## Publicacion autorizada: 2026-10-30

- [x] Usuario autoriza y confirma pausa. Respaldo productivo nuevo restaurado con manifiesto de datos/estructura/secuencias coincidente; 055 ensayada sin cambios de datos anteriores y triggers comprobados. Ver DESPLIEGUE_2026-10-30.md.
- [x] 055 aplicada en produccion; preflight posterior aprobado con 55 hashes coincidentes, TLS e identidades/roles/indices correctos. Archivos internos de gastos excluidos.
- [x] API da7d01c confirmada con PostgreSQL saludable, siete rutas rechazan anonimos/no-store y CORS propio/ajeno comprobados. Titular confirma Compute Plan 0.5c-512mb y Node 22.23.4 en ambos servicios. Regresion completa final: 317 backend, 34 frontend y doce recorridos locales aprobados.
- [x] API y web 6f39eb8 publicadas: health/database correctos, JS/CSS exactos al build productivo, CSP/anti-framing/nosniff, CORS y siete rutas anonimas comprobados. Preflight final y triggers productivos aprobados. Disponibilidad tecnica confirmada.
- [ ] QA autenticado por titulares: login/VIP Access, Transacciones/Arqueo/Saldos, exportacion habitual y recuperacion con codigo nuevo. Solicitado al usuario sin crear movimientos reales de prueba. CA desde Render y el resto del checklist siguen pendientes.

## Identidad en operaciones de caja: 2026-10-30 (solo desarrollo)

- [x] Version obligatoria sin coercion en actor financiero y Directorio; mismo validador en administracion/exportaciones. Los nueve tipos de recibo rechazan identidad invalida antes de ejecutar o devolver una operacion anterior.
- [x] Creacion/apertura preparada/edicion de apertura/correccion historica de cierre revalidan identidad dentro de la escritura. Traspasos invalidos se rechazan antes de bloquear; actor actual sigue comprobado en la transaccion. Ver IDENTIDAD_OPERACIONES_2026-10-30.md.
- [x] 316 pruebas backend, 34 frontend y doce recorridos locales aprobados; build/lint correctos con Node 22.23.4. Veinticuatro casos de operaciones/recibos y Directorio repetidos bajo rol SQL restringido, sin omisiones ni fallos.
- [ ] QA manual del paquete, matriz granular restante y autorizacion/pausa/respaldo/055/Render antes de publicar. Sin cambios productivos ni alteracion del control local de gastos.

## Sesion administrativa en catalogos: 2026-10-30 (solo desarrollo)

- [x] Version exacta obligatoria y rechazo de cambio obligatorio de contrasena en las nueve entradas de escritura administrativa. Identidad/rol activos comprobados y bloqueados hasta terminar guardado/auditoria; sin ampliar permisos ni cambiar reglas financieras.
- [x] Once pruebas nuevas: matriz de revocacion/estado/rol, rollback de auditoria, autorrevocacion y carreras reales en ambos ordenes. Ocho casos repetidos bajo rol SQL restringido. Ver SESION_CATALOGOS_2026-10-30.md.
- [x] Regresion acumulada: 307 backend, 34 frontend, doce recorridos de navegador, build/lint correctos con Node 22.23.4. Candidato actualizado, sin commit/push ni despliegue.
- [ ] QA manual administrativo y financiero acumulado, medicion de esperas y puertas de publicacion del candidato. Produccion sin cambios; migracion 055 sigue pendiente y archivos internos de gastos excluidos.

## Captura de accesos y consultas: 2026-10-29 (solo desarrollo)

- [x] Agrupacion solo tras insercion confirmada, reserva independiente de eventos en vuelo, reintento permitido tras fallo y cache acotada sin descartar todos los eventos nuevos al llenarse. Auditoria financiera obligatoria sin cambios.
- [x] Saturacion/fallos medidos y advertencias genericas limitadas; rutas de plantilla/UUID/IP validados sin URLs crudas ni errores privados. Diagnostico agregado exclusivo de Administrador y aviso en Auditoria si se observaron fallos u omisiones.
- [x] Build/lint, 296 pruebas backend, 34 frontend y doce recorridos de navegador aprobados. Diagnostico HTTP con permisos y prioridad de ruta comprobados; visual escritorio/movil. Ver AUDITORIA_CAPTURA_2026-10-29.md.
- [ ] QA manual del aviso y del paquete acumulado antes de publicar. Captura auxiliar agrupada/best effort; centralizacion, retencion, alertas externas y recuperacion de eventos siguen pendientes. Contadores solo del proceso actual y se reinician con la API.

## Consultas y concurrencia: 2026-10-29 (solo desarrollo)

- [x] Paginacion de Transacciones y fechas Panel/PNG con contratos estrictos; rechazo de repetidos/arrays/campos de alcance ajenos antes de SQL, sin coercion parcial ni ano cero. Limites/defaults validos y exportacion por seleccion conservados.
- [x] Cinco entradas de lectura de Transacciones/pendientes restringidas explicitamente a Administrador/Cajero, manteniendo el alcance por registro de los servicios. No equivale a cerrar toda la matriz granular.
- [x] Contencion exclusiva de reportes GET pesados: 4 simultaneos por usuario, 16 por proceso, 429/Retry-After y liberacion al completar/fallar/cancelar; sin cupos diarios ni bloqueo de rutas financieras. Pruebas unitarias y HTTP aprobadas. Ver SEGURIDAD_CONSULTAS_2026-10-29.md.
- [x] Regresion acumulada: 288 backend, 34 frontend, once recorridos de navegador y build/lint correctos. Candidato actualizado sin migraciones adicionales ni cambios productivos.
- [ ] QA manual con uso habitual/varias pestanas y medicion de 429/p95/pool en infraestructura representativa. Control local al proceso, no distribuido. Paginacion/filtros/totales del plan de optimizacion siguen pendientes.

## Frontera financiera y candidato: 2026-10-29 (solo desarrollo)

- [x] Contratos estrictos en aperturas, ediciones/cierres y correccion historica de turnos, arqueos, saldos y transferencias; tambien bloques anidados. Rechazo antes de servicios sin modificar calculos ni permisos. Matriz HTTP de 12 rutas y regresion de entradas validas/centavos/negativos aprobadas.
- [x] Paquete acumulado: build/lint, 281 backend, 34 frontend y once recorridos locales aprobados. Preflight de preview y respaldo/restauracion con datos/estructura/secuencias coincidentes. Ver CANDIDATO_PRODUCCION_2026-10-29.md.
- [x] 39 pruebas criticas de Directorio/exportaciones/recibos/transferencias repetidas bajo rol SQL restringido, sin fallos ni omitidas.
- [x] Titular confirma 0.5c-512mb; Blueprint local actualizado y parseado. No se cambia el plan remoto desde esta tarea. Control de gastos e informe privado excluidos localmente; escaneo de candidatos sin valores privados coincidentes.
- [x] Auditoria de dependencias: runtime cero; tres entradas bajas de compilacion pendientes, sin downgrade forzado.
- [ ] QA manual del paquete, autorizacion expresa y pausa de escrituras antes de nuevo respaldo/ensayo/preflight productivo. Migracion 055 y publicacion API/web compatibles todavia pendientes; no se ha hecho commit/push/despliegue.

## Contrato estricto de Directorio: 2026-10-29 (solo desarrollo)

- [x] Altas/ediciones rechazan campos no previstos, tambien dentro de identificadores y cedulas. Version de edicion solo admitida/requerida en PUT. Se conservan campos normales, valores por defecto y requisito de al menos un contacto.
- [x] 14 pruebas focalizadas aprobadas (4 nuevas de contrato y 10 de seguridad/version/auditoria; estas ultimas bajo rol SQL restringido), build/lint backend correctos. Entradas invalidas devuelven 400 antes de invocar el servicio.
- [ ] QA manual de alta/edicion/anulacion en el paquete acumulado antes de publicar. Sin DDL, cambios visuales ni despliegue por este ajuste. La validacion anterior ya descartaba campos desconocidos; este bloque los rechaza explicitamente, no acredita una explotacion previa.

## Exportaciones y sesion vigente: 2026-10-29 (solo desarrollo)

- [x] Identidad/rol activo, version exacta y cambio obligatorio comprobados junto con auditoria en una sentencia SQL antes de devolver exportaciones autorizadas de catalogos, Transacciones, Turnos y PNG. Denegacion sin dataset ni evento de exito si cambia la sesion.
- [x] Auditoria declarativa usa el mismo control; agrupacion solo tras escritura correcta. Fallo no suprime reintento y mapa lleno no descarta auditorias nuevas. No es recibo de descarga ni deduplicacion distribuida.
- [x] Pruebas focalizadas de acceso/revocacion, auditoria, reintento, saturacion y privacidad aprobadas; casos nuevos de identidad tambien bajo rol SQL restringido. Ver SEGURIDAD_EXPORTACIONES_SESION_2026-10-29.md.
- [x] Regresion de 272 pruebas backend y 34 frontend aprobada; build/lint correctos y 18 focalizadas de exportacion sin fallos. No se agrega migracion SQL por este bloque.
- [ ] QA manual Excel/PDF/PNG y publicacion conjunta autorizada. Permisos granulares, alertas, retencion y consistencia de conjuntos durante cambios de alcance siguen pendientes; sin cambios productivos por este bloque.

## Version de Directorio y plan de optimizacion: 2026-10-29 (solo desarrollo)

- [x] Version de contenido obligatoria para editar/anular destinatarios; comparacion bajo bloqueo antes de reemplazar datos relacionados. Conflicto 409 sin escritura ni auditoria de exito; borrador conservado y revision explicita requerida. Ver VERSION_DIRECTORIO_2026-10-29.md.
- [x] Build/lint, 264 pruebas backend, 34 frontend y 10 de Directorio bajo rol SQL restringido aprobadas. Dos sesiones sinteticas de navegador comprueban rechazo del formulario antiguo y conservacion de borrador.
- [ ] QA manual de dos ventanas y anulacion; coordinar clientes antiguos al publicar API/web. Recibos idempotentes de Directorio siguen pendientes.
- [x] Plan de optimizacion por etapas documentado en PLAN_OPTIMIZACION_TEMO_2026-10-29.md: medicion, paginacion/filtros/totales/exportaciones en servidor, cargas/consultas por turno, indices medidos y validacion antes/despues.
- [x] Titular confirma cambio de Compute Plan en Render tras mostrar Free. No es evidencia de tipo/recursos efectivos ni prueba de rendimiento posterior; no se supusieron gastos ni se cambiaron planes desde el agente.
- [ ] Linea base autenticada despues del cambio: p50/p95, peticiones/bytes, CPU/memoria, pool, regiones y errores; sin payloads sensibles ni carga contra produccion.
- [ ] Transacciones: sustituir descarga completa en refrescos por pagina/consulta filtrada en servidor, totales completos y exportaciones equivalentes autorizadas; probar historiales grandes y respuestas fuera de orden.
- [ ] Reducir detalle/sondeo de turnos y carga inicial de catalogos, medir SQL e indices en copia aislada, y calificar 1/5 usuarios con datos sinteticos antes de autorizar publicacion. No relajar controles financieros para acelerar.

## Revision de rendimiento: 2026-10-29 (solo desarrollo)

- [x] Listado de transacciones independiente del detalle de turno, sin refresco superpuesto a la carga inicial; Arqueo sin ceros provisionales ni doble detalle inicial administrativo. Traspaso paraleliza solo resumen/candidatos despues de preparar datos.
- [x] Pruebas con respuestas retenidas comprueban carga honesta y listado independiente. Build/lint, 34 unitarias frontend y seis recorridos locales aprobados. Ver REVISION_CARGA_2026-10-29.md.
- [ ] Confirmar Compute Plan efectivo despues del cambio comunicado y medir tiempos por ruta/SQL, regiones y recursos. La lectura de health intermitente no acredita causa ni rendimiento de operaciones autenticadas.
- [ ] Paginacion, filtros y totales en servidor para Transacciones y exportaciones completas; no reducir arbitrariamente el historial visible ni cachear autorizaciones.

## Directorio y filtros monetarios: 2026-10-29 (solo desarrollo)

- [x] Directorio revalida usuario, rol, cambio obligatorio y version de sesion dentro de la transaccion; edicion serializada por destinatario. No amplia permisos de lectura/escritura.
- [x] Auditoria atomica de alta/edicion/desactivacion, con conteos y banderas sin duplicar numeros de cuentas, cedulas ni notas. Fallos revierten padre e hijos; visor con etiquetas permitidas.
- [x] Filtros C$ / $ en consultas monetarias y bloques mixtos, sin conversion ni escritura financiera. Pendientes limpia seleccion al cambiar moneda. Panel permite mes completo y cantidades en todos los dias.
- [x] Build/lint, 261 pruebas backend, 34 frontend, 7 de Directorio bajo rol restringido y nueve recorridos de navegador aprobados. Ver FILTROS_MONEDA_DIRECTORIO_2026-10-29.md.
- [ ] QA manual de filtros/exportaciones, grafica y cambios del Directorio. Version de contenido incorporada en el bloque siguiente; recibos de Directorio siguen pendientes.
- [ ] Preparar publicacion autorizada junto con el bloque de transferencias/055. Sin cambios productivos por esta entrega; Control de gastos permanece local.

## Correcciones de transferencias: 2026-10-29 (solo desarrollo)

- [x] Recibos atomicos para editar/anular transferencias; reenvio no duplica movimientos ni auditoria y contenido/registro distinto con la misma referencia se rechaza. Actor y alcance actual revalidados tambien al confirmar un recibo.
- [x] Version exacta del registro/denominaciones contra ventanas antiguas; detalle coherente en una sentencia. Concurrencia, turno original, bloqueo por solicitud y turnos cerrados comprobados. Migracion 055 aplicada solo a preview.
- [x] Auditoria obligatoria y permitida explicitamente de altas/ediciones/anulaciones; errores de auditoria/recibo revierten fondos, arqueos y version. Motivo de anulacion en ventana TEMO, borradores/referencias conservados y doble envio protegido.
- [x] Build/lint, 254 pruebas backend, 33 frontend, 12 focalizadas bajo rol SQL restringido y ocho recorridos de navegador local aprobados. Restauracion de preview con datos/estructura/secuencias coincidentes. Ver SEGURIDAD_TRANSFERENCIAS_2026-10-29.md.
- [ ] QA manual de transferencias con dos ventanas y los tres perfiles; revisar tambien el saldo fijo de cliente en encabezado. Los contratos opcionales de clientes anteriores no obtienen garantia de recibo/versionado si no los envian.
- [ ] Autorizacion y preparacion para publicar el paquete con 055. Continuar matriz de rutas, aperturas/cierres, retencion, infraestructura y prueba de CA desde Render pendientes; produccion sin cambios por este bloque.

## Publicacion conjunta del 2026-10-27

- [x] Usuario autoriza el paquete completo y confirma pausa de operaciones. Respaldo productivo nuevo restaurado y migraciones 044-054 ensayadas primero en copia aislada, sin alterar datos originales salvo centavos NIO previstos.
- [x] Migraciones 044-054 aplicadas en produccion; 54 hashes coincidentes y preflight TLS/identidades/roles aprobado. API y web 45d1cf7 verificadas por health y assets JS/CSS exactos. Ver DESPLIEGUE_2026-10-27.md.
- [x] Compilacion/lint, 242 pruebas backend, 33 frontend y siete recorridos de navegador local aprobados. Contencion de triggers en respaldo restaurado: 5 conexiones y 100 escrituras sin versiones perdidas; no certifica capacidad de Render.
- [x] Usuario guarda NODE_VERSION=22.23.4 en ambos servicios; builds y arranque rechazan runtime anterior al parche o TLS deshabilitado. Confirmados CORS, CSP, anti-framing y rechazo de anonimos. Control de gastos y archivos privados excluidos de main.
- [ ] Confirmacion funcional productiva por titulares: Administradora/cajeros, MFA/logout, recuperacion con codigo nuevo y operaciones habituales. No reemplazar esta comprobacion con pruebas interceptadas ni con logins suplantados.
- [ ] Evidencia de runtime/CA desde Render y ampliacion de pruebas de capacidad en infraestructura representativa. Se conserva la matriz de seguridad restante abierta.
- [ ] Seguimiento GHSA-gcqx-w48m-w2h4: deepmerge transitivo del compilador, sin parche publicado. npm audit completo reporta tres entradas bajas por esa dependencia; audit --omit=dev reporta cero. No aplicar downgrade incompatible del CLI.

Las secciones inferiores conservan evidencia historica previa a esta publicacion; los estados de salida actuales se resumen arriba.

Seguimiento 2026-10-07: correccion operativa autorizada desplegada en d45772c (liquidaciones USD con NIO, arqueo nominal y resumen vertical de notificaciones). Evidencia en CORRECCION_LIQUIDACIONES_USD_2026-10-07.md. API y web verificadas; 20 pruebas backend y 5 frontend aprobadas. No se completaron nuevos bloques de seguridad; esas mejoras continuan en desarrollo.

## Reglas de seguimiento

- Trabajar y comprobar en desarrollo; desplegar solo con autorizacion expresa.
- Un [x] significa implementado y verificado en el entorno indicado, no automaticamente desplegado.
- Registrar evidencia y riesgos pendientes. No prometer seguridad absoluta ni confundir compras con controles activos.
- La futura aplicacion movil utilizara la misma API: aplicar permisos en servidor, no solo en la interfaz.

## Prioridad urgente: Render, Node y eMudhra (2026-10-27)

Ver AVISO_RENDER_NODE_EMUDHRA_2026-10-27.md. Este aviso requiere seguimiento independiente del paquete funcional pendiente. No demuestra por si solo una intrusion en TEMO ni autoriza publicacion.

- [x] Avisos contrastados con Render y Node.js. TEMO usa Node en la API y en la compilacion web; PHP2Shell no aplica directamente al repositorio inspeccionado.
- [x] Preparacion local: NODE_VERSION 22.23.4 en ambos servicios de render.yaml y respaldo .node-version. Chequeo de runtime sin credenciales ni red y 3 pruebas nuevas aprobadas. No es evidencia de parche productivo.
- [x] Calificacion en Node 22.23.4 portable aislado, firma OpenJS y checksum verificados: build/lint, regresion y navegador correctos. Control HTTPS valido y ambos destinos de prueba rechazados con CERT_REVOKED. El Node global 24.11.1 sigue pendiente; no usarlo para publicar. Ver CIERRE_BLOQUE_SEGURIDAD_2026-10-27.md.
- [ ] Confirmar servicios/commit Live/Node efectivos y overrides del dashboard; revisar flags TLS y CA adicionales. No se inspecciono la configuracion viva de Render.
- [x] Parche incluido en publicacion conjunta autorizada: usuario guarda NODE_VERSION corregido, API y web se reconstruyen, guardias incorporadas y revision 45d1cf7 confirmada. La prueba negativa de certificados desde Render sigue separada y pendiente.
- [ ] Comprobar almacen de CA renovado y CA personalizada de PostgreSQL sin deshabilitar validacion TLS. Probar rechazo de certificados desde el Node real de Render; error DNS/timeout no acredita rechazo TLS.
- [ ] Smoke test posterior: health, PostgreSQL/TLS, login/MFA/logout, CORS y recuperacion por Resend con codigo nuevo. Confirmar builds exitosos y version efectiva antes de cerrar el aviso.
- [ ] Revisar actividad anomala; si hay indicios, respuesta a incidentes y rotacion controlada segun alcance. No cambiar claves de MFA indiscriminadamente. Revisar scripts auxiliares antiguos que omiten validacion de certificado antes de reutilizarlos.

## Cierre de candidato: 2026-10-27 (solo desarrollo)

- [x] Formularios con encabezado/herramientas/pestanas y acciones fijados, montos por transaccion y contexto compacto. Lanzador de doble clic sin resembrar, proxy /api local, API/PG en loopback, entorno filtrado y archivos privados bloqueados por Vite. Reinicio conserva datos/esquema/secuencias. Wi-Fi Privada y regla TCP 3188/LocalSubnet aplicadas con autorizacion; ver DESARROLLO_RED_LOCAL_2026-10-27.md. Pendientes propios EN_REVISION visibles sin ampliar permisos de liquidacion.
- [ ] Confirmar acceso real desde el segundo dispositivo en la red local. Las pruebas automatizadas por la IP Wi-Fi se ejecutaron desde la maquina anfitriona; no prueban configuracion del router ni de otro dispositivo.
- [x] Regresion posterior de formularios/lanzador/pendientes: 241/241 backend, 29/29 frontend, build/lint y seis recorridos de navegador aprobados con Node 22.23.4. La publicacion conjunta con el parche sigue pendiente de autorizacion y puertas de salida, no de un cambio automatico del lanzador.

- [x] Bloqueo por solicitud explicita de cierre o traspaso vigente, limitado al turno del cajero solicitante. Cancelar/rechazar permite corregir; EN_REVISION no vuelve a ABIERTO. Aviso automatico de revision no bloquea correcciones. Revision administrativa cancelada/renovada rechazada por la web actual; metadatos/observaciones legibles y boton Revisar cierre destacado. Migracion 054 solo local; ver SOLICITUDES_CIERRE_TRASPASO_2026-10-27.md.

Ver CIERRE_BLOQUE_SEGURIDAD_2026-10-27.md. Regresion con Node portable parcheado, instalacion limpia y build/lint correctos. Pagos de salida NIO/USD con recibos y reversion cubiertos, tambien bajo rol SQL restringido. Respaldo/restauracion local comprobados tras ampliar equivalencias exactas del verificador CHECK, sin omitir restricciones ni cambiar datos. QA operativo, carga representativa, respaldo productivo y validacion de Render siguen siendo puertas de salida; no hay commit/push/despliegue nuevo. Control de gastos excluido.

## Avance acumulado: 2026-10-26 (solo desarrollo)

Esta seccion complementa las etapas historicas inferiores; no marca completa toda la matriz de API ni autoriza publicacion.

- [x] Permisos revalidados dentro de escrituras cubiertas: identidad activa, rol, version y cambio obligatorio. Casos de cajero propio/ajeno, otra sucursal, Administrador, Transferista, exportacion e IDs manipulados; incluye EN_REVISION y preserva el aislamiento entre cajeros.
- [x] Auditoria ampliada de propuesta/aceptacion/rechazo/cancelacion del traspaso, registro de diferencia, correcciones de arqueo/saldos en revision y aprobacion del cierre; antes/despues permitidos sin expandir snapshots o secretos.
- [x] Altas de transacciones/transferencias con recibo transaccional por usuario, operacion y referencia. Concurrencia, reenvio sin duplicacion, conflicto al cambiar datos, rollback y alcance actual comprobados. Migracion 049 solo local.
- [x] Interfaz conserva referencia al reintentar manualmente, impide doble envio sin esperar otro render y consulta registros actuales tras confirmar. Sin reintentos automaticos; claves compatibles con preview HTTP local.
- [x] Transferencias: turno original inmutable al editar, relectura bajo bloqueo, doble anulacion sin doble restitucion y rechazo de modificaciones financieras sobre turnos cerrados.
- [x] Dependencias: 7 avisos actuales corregidos sin cambiar versiones principales. Override de Multer comprobado en instalacion limpia, paquetes de produccion y lock; npm audit sin avisos conocidos. Prueba HTTP de gzip malformado sin caida ni datos privados.
- [x] Backend 230/230, frontend 27/27, build/lint y preflight local correctos. Pruebas SQL restringidas y concurrencia real; ver VALIDACION_PERMISOS_RECIBOS_AUDITORIA_2026-10-26.md, SEGURIDAD_LIQUIDACIONES_2026-10-26.md, SEGURIDAD_CORRECCIONES_2026-10-26.md y FORMULARIOS_OBSOLETOS_2026-10-26.md para los avances sucesivos.
- [x] Cierre tras correcciones: el propietario solicita revision administrativa desde EN_REVISION, con sesion revalidada, guardado previo y auditoria atomica. El aviso renovado reaparece sin cambiar el estado ni los fondos del receptor. Observaciones legibles con nombres y turno; migracion 050 solo local. Ver REVISION_TRASPASO_2026-10-25.md.
- [x] Liquidaciones individuales/multiples de efectivo, digitales y combinadas: recibos transaccionales, permisos vigentes al pagar/revertir, revalidacion del turno de aplicacion al reenviar, rechazo de recibos de pagos revertidos, auditoria ampliada y doble clic protegido en las cinco entradas web. Migracion 051 solo local. Pruebas de concurrencia real y navegador; ver SEGURIDAD_LIQUIDACIONES_2026-10-26.md.
- [x] Ediciones/anulaciones individuales y de grupos de transacciones: recibos atomicos, reautorizacion del reenvio, rechazo de turnos anulados/sin abrir, auditoria antes/despues de anulacion, confirmaciones y doble clic protegidos. Historicos conservan fondos; respuestas antiguas no sobrescriben correcciones posteriores. Migracion 052 solo local; ver SEGURIDAD_CORRECCIONES_2026-10-26.md.
- [x] Versionado de formularios de transacciones: edicion/anulacion obsoleta rechazada bajo bloqueo; borrador conservado, lecturas de grupo consistentes y recibo confirmado prioritario. Dos conexiones reales con referencias diferentes: solo una guarda con la misma version. Pendientes, arqueos e historicos relacionados invalidan versiones; refrescos ajenos no. Migracion 053 solo local; ver FORMULARIOS_OBSOLETOS_2026-10-26.md.
- [ ] QA manual del conjunto con Administradora y dos cajeros; revisar Auditoria, reenvio manual de resultado incierto, transferencias y cierre del turno en revision.
- [ ] QA manual de liquidaciones con Administradora/cajeros, POR_PAGAR y ambas monedas; comprobar reintento, correccion y aislamiento junto a los traspasos.
- [ ] Extender matriz al resto de rutas y recibos a otras escrituras, como aperturas/cierres y edicion de transferencias; definir retencion y archivo. Los clientes anteriores sin requestId conservan compatibilidad, no esta garantia de confirmacion idempotente.
- [ ] QA manual del versionado en dos ventanas; ampliar a otros formularios y decidir obligatoriedad para clientes anteriores/API movil. Medir carga/contencion de los nuevos triggers antes de publicar.
- [ ] Preparar respaldo, migraciones 044-053, configuracion y retorno; publicar solo con autorizacion nueva. Control de gastos excluido y solo local.

## Pendientes consolidados al 2026-10-10

Este resumen orienta el trabajo actual. Las secciones inferiores conservan
etapas historicas: casillas antiguas sin marcar no prueban ausencia de un
control que otra entrada posterior acredita como implementado/desplegado.

### Puerta del paquete acumulado

- [x] 2026-10-10: candidato local documentado en
  CANDIDATO_SEGURIDAD_2026-10-10.md.151/151 backend,21/21 frontend,
  build/lint completos y npm audit sin vulnerabilidades conocidas reportadas;
  preflight preview correcto. No es autorizacion ni validacion de produccion.
- [ ] Revisar diff/configuracion final, respaldo reciente legible y plan de retorno;
  desplegar solo con nueva autorizacion. Este bloque no publica nada.
- [ ] Confirmar CORS_ORIGINS exactos/HTTPS y publicar frontend con API propia/CSP;
  no asumir aplicacion automatica de render.yaml en servicios existentes.
- [ ] Probar recuperacion administrativa real por Resend despues de publicar la
  correccion: codigo nuevo, un uso, expiracion, revocacion y MFA conservado.
  Entrega del correo ya confirmada; recuperacion productiva aun no acreditada.
- [ ] Repetir login/MFA, logout, exportaciones y flujo financiero en navegador
  habitual despues del despliegue. Pruebas actuales son de desarrollo.

### Infraestructura y continuidad

- [x] 2026-10-10, desarrollo: ensayo ampliado con definiciones de2 vistas y
  configuracion/estado de7 secuencias;60 tablas y1439 elementos estructurales
  coinciden despues de restaurar. Rechazo si avanzan contadores durante respaldo.
 136/136 backend,21/21 frontend, build/lint backend correctos. Ver
  VALIDACION_VISTAS_SECUENCIAS_2026-10-10.md. No desplegado; RPO/RTO real,
  permisos y claves/infraestructura siguen pendientes.
- [x] 2026-10-10, solo desarrollo: respaldo consistente y restauracion real de
  preview en PostgreSQL temporal local; coinciden datos de60 tablas y1430
  elementos de estructura, pgcrypto funcional.130/130 backend y21/21 frontend,
  build/lint backend correctos. Ver VALIDACION_RESTAURACION_PREVIEW_2026-10-10.md.
  No acredita restauracion de produccion ni recuperacion de claves/infraestructura.
- [ ] Restaurar respaldo en entorno aislado, medir RPO/RTO y copia independiente
  cifrada; compra de Pro y existencia de backup no acreditan restauracion.
- [ ] Separar credenciales API/migraciones y comprobar privilegios minimos,
  permisos de esquemas/Data API, TLS y restricciones de red sin romper TEMO.
- [ ] Confirmar MFA/miembros/tokens/recuperacion de Render, Supabase, Cloudflare
  y Resend; cerrar procedimiento de rotacion y perdida de acceso.
- [ ] Confirmar compute de Render apropiado, alertas/costos y presupuesto mensual;
  plan de workspace y compute son distintos, no comprar extras automaticamente.
- [ ] Revisar logs PostgREST con negocio operando y comparar Egress diario;
  ausencia de actividad al cierre no acredita solucion del ruido.

### Aplicacion, dispositivos y deteccion

- [x] 2026-10-10, desarrollo: ampliada auditoria obligatoria atomica a sucursales,
  cuentas y movimientos, con vinculos/efectos permitidos. Numero de cuenta
  enmascarado, cambio detectado incluso conservando ultimos4 caracteres.
  IDs de vinculos de otro movimiento rechazados en servidor.151/151 backend,
 21/21 frontend, build/lint completos correctos. Ver
  VALIDACION_AUDITORIA_VINCULOS_2026-10-10.md. No desplegado.
- [x] 2026-10-10, desarrollo: altas/ediciones/desactivaciones de bancos y reglas
  de comision registran antes/despues explicitamente permitido, con auditoria
  obligatoria atomica y revalidacion del Administrador. Pruebas de revocacion,
  rol/estado cambiado, fracaso de auditoria y compatibilidad con rol SQL del
  piloto.145/145 backend,21/21 frontend, build/lint backend correctos.
  Ver VALIDACION_AUDITORIA_CATALOGOS_FINANCIEROS_2026-10-10.md. No desplegado.
- [x] 2026-10-10, desarrollo: validacion UUID previa al servicio en23 rutas de
  transacciones/pendientes, turnos/notificaciones, transferencias y directorio.
  Matriz HTTP de rechazos, inventario cerrado de5 rutas publicas en8 controladores
  y regresion de sesiones restringidas/revocadas.134/134 backend,21/21 frontend,
  build/lint backend correctos. Ver VALIDACION_IDS_Y_GUARD_2026-10-10.md.
  No desplegado; no equivale a completar toda la matriz de permisos por registro.
- [ ] Completar matriz de permisos por ruta/rol/sucursal/turno, con casos negativos
  y auditoria antes/despues restante; pruebas existentes no cubren toda la API.
- [ ] Inventario/alertas de nuevos accesos, extraccion anormal y procedimiento
  de respuesta/baja de empleados; retencion y proteccion de logs.
- [ ] Piloto de dispositivos administrados/Zero Trust, protegiendo web y API,
  cierre del bypass onrender.com y verificacion de cadena proxy/IP.
- [ ] Evaluar cookies HttpOnly/CSRF para web, sesiones individuales/inactividad,
  reto adicional sensible y almacenamiento seguro de la futura app movil.
- [ ] Revisar borradores/almacenamiento restante; permisos locales demostrativos
  no deben interpretarse como autorizacion del servidor.
- [ ] Paginacion y deteccion de cambios sin perder filtros/exportaciones/fluidez;
  limites de espera/saturacion de conexiones y carga de autenticacion.
- [ ] API movil versionada/idempotencia de operaciones financieras; no habilitar
  liquidaciones offline sin conciliacion y diseno especificos.
- [ ] Configurar/probar reenvio de soporte y entregabilidad/DMARC gradual;
  recuperar cajeros por correo requiere decision explicita, no ampliacion tacita.
- [ ] Prueba independiente autorizada de penetracion y simulacro de incidentes.

## Bloque 1: contencion inmediata

- [x] 2026-10-10, desarrollo: limitadores antes de parsear cuerpos; errores de formato/tamano/codificacion sanitizados, sin contenido privado; CORS estricto validado al arrancar, HTTPS remoto. Cupos y logica financiera conservados.106/106 backend con HTTP real y21/21 frontend, build/lint correctos. Ver VALIDACION_ENTRADA_HTTP_2026-10-10.md. No desplegado.

- [x] Escapar titulo, cabeceras y celdas de exportaciones HTML Excel/PDF en desarrollo. PDF sin opener y con CSP restrictiva. Evidencia 2026-10-06: node --test frontend/tests/export-html.test.mjs (2/2); npm run build -w frontend y npm run lint -w frontend exitosos. Falta prueba manual de impresion y despliegue.
- [ ] Validar manualmente exportacion e impresion en navegadores utilizados por las sucursales; desplegar correccion aprobada.
- [x] Descarga Excel real en preview con cuatro filas y montos verificados. Falta apertura en Excel y PDF en navegador habitual; navegador integrado no mostro ventana PDF observable.
- [x] Usuario confirmo apertura y guardado de PDF en navegador habitual. Validacion de interrupcion de red: formulario conserva datos y muestra RED-CON-002; reconexion no repite escritura. Instancias temporales cerradas, sin cambios financieros.
- [ ] Matriz de permisos de lectura/escritura/exportacion por rol, sucursal, turno y registro.
- [ ] Restringir catalogos de usuarios/cuentas; conservar solo los campos necesarios para operar.
- [x] En desarrollo: GET usuarios, roles y reglas-comisiones requieren Administrador en servidor; rechazan otros perfiles antes de consultar la base.
- [x] En desarrollo: cuentas para Cajero solo activas y globales o disponibles en sucursales asignadas/turno abierto; numero de cuenta oculto. Administrador mantiene catalogo completo. No se modifica el contexto separado de transferencias.
- [x] Compatibilidad TRANSFERISTA: cuentas activas entre sucursales sin numero de cuenta, coherente con contexto operativo existente. Pruebas SQL y de parametros verificadas durante QA final.
- [x] Evidencia de catalogos 2026-10-06: compilacion/lint backend y 6/6 pruebas, incluyendo SQL contra preview y HTTP con API temporal local (401/403/200). Comando: npm run build -w backend; TEMO_TEST_PREVIEW=1 node --test backend/tests/catalog-access.test.cjs.
- [ ] Antes de desplegar este bloque: regresion manual de apertura de turno, transacciones, pendientes y transferencias; revisar datos minimos de sucursales y contexto de transferencias. Estas otras rutas aun no se consideran endurecidas.
- [x] Regresion automatizada de escritura en preview: preparacion/apertura, deposito NIO/USD, multiples, anular grupo, efectivo de pendientes con vuelto, compensacion retiro380/pendiente180/deposito200, tasa preferencial36.55 y transferencia egreso/anulacion. Evidencia: backend/tests/financial-regression.test.cjs; nueve escenarios con servicios reales y PostgreSQL, rollback de fixtures.
- [x] Pruebas negativas adicionales: cajero no abre turno asignado a otro, no lee/anula transaccion ajena ni lee transferencia ajena; no crea transferencias digitales. No equivale a una matriz completa de todas las rutas/sucursales.
- [ ] Pruebas negativas: cajero no consulta otra sucursal ni modifica/exporta registros ajenos mediante IDs manipulados.
- [x] 2026-10-08, desarrollo: detalle de transacciones ajenas en misma sucursal/dia restringido a grupos vinculados a pendientes compartidos. Pruebas de dos sucursales, IDs de otro cajero, consulta/grupo/edicion y creacion en turno ajeno. Suite55/55; no acredita toda la matriz ni exportacion controlada por servidor. Ver VALIDACION_ALCANCE_TRANSACCIONES_2026-10-08.md.
- [ ] Actualizar dependencias vulnerables con pruebas de regresion; revisar tambien formatos/formulas de archivos exportados.
- [x] En desarrollo: snapshots operativos/catalogos pasan de localStorage a sessionStorage ligado a la sesion; limpiar cache al salir o detectar sesion invalida y eliminar snapshots heredados al cargar. Respuestas tardias de catalogos no repueblan otra sesion. Evidencia: frontend/tests/session-cache.test.mjs (3/3), build/lint frontend exitosos.
- [ ] Revisar todos los borradores, almacenamiento del navegador y permisos locales demostrativos; sessionStorage sigue accesible a JavaScript, no sustituye proteccion XSS ni almacenamiento seguro del token.
- [x] En desarrollo: API envia Cache-Control: no-store; CORS sin configuracion ya no acepta cualquier origen. Integracion HTTP verifica no-store y origen permitido/rechazado; confirmar CORS_ORIGINS de produccion antes de desplegar.
- [x] CORS efectivo observado en produccion con OPTIONS: autoriza origen exacto de TEMO y no autoriza origen ajeno probado. Solo lectura, sin cambiar Render ni consultar datos financieros.
- [ ] CSP general, proteccion de marcos y CORS explicito; verificar que no rompan las herramientas de TEMO.
- [x] CSP y anti-clickjacking implementados y comprobados en desarrollo 2026-10-07: politica estricta para build, excepcion Vite solo local, API con CSP y DENY. Ocho pruebas frontend y 20 backend; navegador rechazo script inline e incrustacion desde otra pagina local. Evidencia: VALIDACION_CSP_TEMO_2026-10-07.md. No desplegado.
- [ ] Antes de desplegar CSP: repetir PDF en navegador habitual, exportacion PNG y foto de perfil; comprobar cabeceras efectivas del hosting Render y conservar excepciones de estilos documentadas.

### Pruebas de esta entrega (2026-10-06)

- [x] Primer paquete desplegado con autorizacion a produccion: commit f2ae403fa535299f9dcad45fed66623e7cd33cca. Web nueva verificada por bundle y marcador; API salud 200, cuentas sin sesion 401 con no-store, CORS exacto permitido y origen externo rechazado. Sin migraciones ni cambios financieros en produccion. Evidencia ampliada en VALIDACION_SEGURIDAD_PRIMER_PAQUETE.md. Las tareas pendientes de otros bloques siguen abiertas.

- 5/5 pruebas frontend (exportacion y cache) y 16/16 backend con integracion preview (incluye contenedor de suite financiera); compilacion y lint de ambos exitosos en esta etapa.
- Navegador local: login cajero, recarga de sesion, formulario de transaccion, lectura de saldos, formulario de transferencia y logout. No se guardaron movimientos financieros.
- Backend de preview reiniciado con codigo actual; frontend disponible en http://127.0.0.1:3187. Sesiones anteriores de preview requieren iniciar sesion otra vez.
- Escrituras comprobadas con fixtures aislados mediante servicios reales; QA visual, descarga Excel, PDF confirmado por usuario y CORS observado completados para esta entrega. Apertura en Excel de cada sucursal pendiente como compatibilidad adicional. No interpretar estos casos como certificacion completa de seguridad.

## Bloque 2: compras e infraestructura

- [x] 2026-10-10, solo preview: piloto temporal de rol API no administrativo, sin propiedad/DDL/TRUNCATE/TRIGGER ni mutacion de bitacora/migraciones. Regresion financiera y login/cambio/revocacion/MFA/recuperacion comprobados; diagnostico de privilegios ampliado.127/127 backend,21/21 frontend, build/lint correctos. Rol y grants revertidos al terminar. Ver VALIDACION_ROL_API_RESTRINGIDO_2026-10-10.md. Credencial LOGIN real y separacion efectiva en Supabase/Render aun pendientes; no desplegado.

- [x] 2026-10-10, desarrollo: configuracion DB valida URL/TLS y limites; parametros URL no sustituyen verificacion de certificado. Timeout de conexion, sentencia, bloqueo y transaccion inactiva; manejo de desconexiones y rollback fallido sin reintentos.122/122 backend y21/21 frontend, build/lint correctos. Ver VALIDACION_BASE_RESILIENCIA_2026-10-10.md. No desplegado.
- [x] CLI de privilegios READ ONLY preparado y probado solo en preview: detecta rol administrativo local. No se cambiaron grants ni se audito produccion; separacion efectiva API/migraciones sigue pendiente.
- [x] Script de restauracion reforzado en rutas, checksum, puerto/PID y limpieza; sintaxis/rechazo de ruta externa comprobados. No acredita restauracion completa. Procedimiento propuesto en RESPUESTA_RECUPERACION_TEMO.md; falta aprobar responsables/RPO/RTO y ejecutar simulacro.

- [x] 2026-10-09: usuario confirma compra de Supabase Pro. Esto no acredita restauracion de respaldos, limites efectivos ni MFA de la cuenta.
- [ ] Adquirir Supabase Pro; comprobar limites, costos y respaldos reales, no solo el nombre del plan.
- [ ] Definir RPO (datos que se tolera perder) y RTO (tiempo de recuperacion); evaluar PITR adicional.
- [ ] Restaurar un respaldo en entorno aislado, medir tiempos y mantener copia independiente cifrada.
- [ ] Contratar instancia de API pagada en Render; revisar por separado workspace, logs y alertas de consumo.
- [ ] MFA en Render, Supabase, registrador, DNS y proveedor de correo; revisar miembros, tokens y recuperacion.
- [ ] Separar usuario de base de datos de API y migraciones; privilegios minimos, TLS verificado y restricciones de red.
- [ ] Revisar Data API, permisos anon/authenticated y RLS segun arquitectura. No activar RLS sin pruebas.
- [x] 2026-10-09, produccion: ajuste oficial del ruido PostgREST 3F000 aplicado con esquema vacio pgrst_no_exposed_schemas y recarga sin reinicio. Roles anon/authenticated sin USAGE sobre temo antes y despues. Falta observar nuevos logs; no equivale a auditoria completa de permisos. Ver DOMINIO_CORREO_POSTGREST_2026-10-09.md.

## Bloque 3: dominio y recuperacion (dependencia obligatoria)

- [x] 2026-10-09: usuario confirma dominio miscelaneaolivera.com adquirido y subdominios temo/api configurados. HTTPS y CORS del nuevo origen comprobados mediante peticiones publicas.
- [ ] Completar reconstruccion/publicacion del frontend con API propia y CSP compatible. Fuente preparada; bundle observado en produccion todavia utiliza API onrender.com.
- [ ] Resend: usuario confirma cuenta existente; verificar subdominio notificaciones.miscelaneaolivera.com, guardar clave de envio en Render y probar recuperacion administrativa. Configurar reenvio de soporte con destino privado confirmado por el usuario y validar entrega.
- [x] 2026-10-09: usuario confirma variables de correo guardadas en temo-api; captura con clave oculta. Resend aun verificando DNS; no se acredita envio real ni configuracion de soporte.
- [x] 2026-10-09, confirmacion posterior: captura Resend Verified para notificaciones.miscelaneaolivera.com. Pendiente entrega real y recorrido de recuperacion administrativa; dominio verificado no acredita esas pruebas ni el reenvio de soporte.
- [x] Usuario confirma entrega real del correo, pero codigo rechazado AUT-REQ-400. Desarrollo: corregida accion de auditoria SOLICITAR no soportada por CREAR; prueba integrada de solicitud y confirmacion, uso unico y MFA.89/89 pruebas backend, build/lint correctos. Pendiente despliegue autorizado y nueva solicitud real; no marcar recuperacion productiva completada.
- [x] 2026-10-10, desarrollo: recuperacion con cooldown60s y maximo3 solicitudes/15min por cuenta, persistente y compartido entre IP/instancias; codigo y auditoria atomicos antes de enviar, solicitudes frenadas conservan codigo vigente y fallos de envio consumen sin borrar historial.92/92 backend,21/21 frontend; concurrencia y rollback reales en preview. Ver VALIDACION_RECUPERACION_ANTIABUSO_2026-10-10.md. No desplegado.
- [x] 2026-10-09, desarrollo: transporte de recuperacion con timeout10s, rechazo de redirecciones y cinco pruebas sin envio real, preservando alcance administrativo y respuesta generica. Ver VALIDACION_CORREO_Y_LOGS_2026-10-09.md. No desplegado.
- [ ] Comprar dominio .com con MFA, bloqueo de transferencia y renovacion automatica.
- [ ] Crear app.DOMINIO.com y api.DOMINIO.com: agregar dominios en Render y CNAME en DNS al destino indicado por Render.
- [ ] Verificar HTTPS, URL del frontend/API, CORS y enlaces; conservar transicion probada y plan de vuelta atras.
- [ ] **Al confirmar que el dominio fue adquirido, retomar Olvide mi contrasena.** Configurar remitente personalizado, SPF/DKIM y politica DMARC gradual, validar entregabilidad.
- [ ] Recuperacion: respuesta generica, codigo/token de un uso y expiracion, limites de intentos, revocacion de sesiones y auditoria. Probar sin revelar si existe una cuenta.
- [ ] Decidir alcance de recuperacion para cajeros (actualmente restringido a Administrador); no ampliar silenciosamente.

Recordatorio persistente, no aviso programado: al informar la compra del dominio, esta tarea debe revisarse antes de cerrar su configuracion.

## Bloque 4: identidad y OTP

### Estado actual al 2026-10-08

- [x] 2026-10-10, desarrollo: login serializado por cuenta antes de crypt, bloqueo persistente coherente bajo concurrencia y contador renovado tras expiracion. Revalidacion de identidad/rol/version/bloqueo antes de entregar sesion y auditoria atomica.114/114 backend y21/21 frontend, build/lint correctos. Ver VALIDACION_LOGIN_CONCURRENTE_2026-10-10.md. No desplegado.

- [x] 2026-10-10, desarrollo: esquemas estrictos en login/recuperacion/MFA/cambio de contrasena/foto, rechazo de coercion, tamanos y factores ambiguos; errores sin reflejar secretos.97/97 backend con HTTP y preview,21/21 frontend, build/lint backend; API local actualizada. Ver VALIDACION_ENTRADAS_AUTENTICACION_2026-10-10.md. No desplegado.

- [x] MFA administrativo desplegado y probado por el usuario en produccion el 2026-10-07. Las notas de preparacion inferiores documentan etapas anteriores, no ausencia actual de MFA.
- [x] Desarrollo: cambios sensibles de usuarios/roles revocan sesiones; proteccion de Administrador propio/ultimo activo y codigos de roles esenciales; auditoria atomica de cambios sin secretos.
- [x] Desarrollo: Cerrar sesiones por usuario con confirmacion, API exclusiva de Administrador y auditoria; claves temporales criptograficas; rutas exactas durante cambio obligatorio y control de cambio concurrente de privilegios.
- [x] Desarrollo: unicidad normalizada de usuarios/correos (migracion043) y recuperacion rechazada ante identidad ambigua. Ver VALIDACION_IDENTIDADES_Y_ROLES_2026-10-08.md.
- [ ] Recorrido visual del nuevo control de sesiones con Administrador/MFA y publicacion autorizada del paquete. Inventario por dispositivo y reto adicional para operaciones sensibles siguen pendientes.

- [x] Preparacion de produccion autorizada 2026-10-07: respaldo legible y migracion 039 aplicada, sin alterar registros financieros. Dependencias actualizadas (audit 0), 34 pruebas backend y 8 frontend correctas. Ver `PREPARACION_DESPLIEGUE_SEGURIDAD_2026-10-07.md`.
- [ ] Configurar clave MFA en Render, publicar codigo y verificar activacion en produccion. No desplegar sin clave; acceso al panel pendiente.

- [x] Login MFA obligatorio para Administradores en desarrollo: primer acceso QR + confirmacion, accesos posteriores OTP, recuperacion de un uso, bloqueo persistente y sesiones sin factor rechazadas. 33 pruebas backend y 8 frontend correctas; build/lint correctos. Ver `VALIDACION_MFA_LOGIN_2026-10-07.md`. No desplegado.
- [ ] Validacion real en VIP Access, migracion/clave protegida de Render y procedimiento de perdida de telefono/codigos antes de desplegar.

- [x] Preparacion en desarrollo 2026-10-07: comparacion de aplicaciones y componente aislado de cifrado MFA ligado al usuario; 25 pruebas backend correctas. Ver `MFA_ADMINISTRADORES_2026-10-07.md`. No conectado al login; MFA aun no activo.
- [ ] Piloto VIP Access con credencial TEMO independiente por QR; no reutilizar credencial bancaria. Alternativas recomendadas: 2FAS Auth y Google Authenticator.

- [ ] Implementar MFA TOTP (RFC 6238) inicialmente obligatorio para Administrador; decidir politica de cajeros.
- [ ] Alta mediante QR tras reautenticacion y confirmacion de un codigo; guardar secreto cifrado con clave separada.
- [ ] Validacion con ventana horaria pequena, reloj sincronizado, limite de intentos y rechazo de reutilizacion.
- [ ] Sesion completa solo despues de ambos factores; no permitir evadir MFA con rutas alternativas.
- [ ] Codigos de recuperacion de un uso guardados como hash; perdida de telefono y reinicio de MFA con procedimiento auditado.
- [ ] Sesiones visibles/revocables, inactividad controlada y aviso de nuevos accesos; evaluar passkeys resistentes al phishing.
- [ ] Web: evaluar cookies HttpOnly/Secure/SameSite y CSRF. Movil: almacenamiento seguro del SO, tokens cortos y renovacion revocable.

TOTP aumenta seguridad, pero no evita por completo phishing ni abuso de una sesion ya robada. Esta implementado para Administrador; las tareas historicas pendientes deben leerse junto al estado actual indicado arriba.

## Bloque 5: auditoria y deteccion

- [x] 2026-10-08, desarrollo: botones Excel/PDF comunes y PNG del dashboard notifican EXPORTACION_SOLICITADA; API valida metadatos y rol, identidad desde sesion, sin archivo/contenido. Migracion042 solo preview. Build/lint,54 pruebas backend y8 frontend correctos. Ver VALIDACION_EXPORTACIONES_AUDITORIA_2026-10-08.md.
- [x] 2026-10-08, desarrollo: datos de exportaciones de tablas y PNG autorizados por API, alcance de registros revalidado y auditoria obligatoria previa con filas verificadas. Cliente sin fallback local ante fallo. Esto acredita entrega de datos, no que el archivo se guardo ni toda copia manual. Ver VALIDACION_SEGURIDAD_EXPORTACIONES_2026-10-08.md.
- [ ] Validacion final de apertura Excel, impresion PDF y descarga PNG por Administrador en navegador habitual, seguida de despliegue aprobado. La compatibilidad del archivo Excel HTML depende del importador.

- [x] 2026-10-08, desarrollo: consultasGET exitosas en rutas sensibles registran CONSULTAR/LECTURA_SENSIBLE con usuario, plantilla de operacion e ID UUID consultado cuando existe, sin contenido. Agrupacion5min por usuario/ruta/registro. Migracion041 solo preview; build/lint y52 pruebas backend correctos. Ver VALIDACION_LECTURAS_SENSIBLES_2026-10-08.md.

- [x] 2026-10-08, desarrollo: respuestas403 con identidad autenticada generan RECHAZAR/ACCESO_DENEGADO, ruta de servidor/metodo/IP valida, sin cuerpo/query/token. Dedupe60s por usuario/metodo/ruta y escrituras simultaneas acotadas. Logs tecnicos ya no incluyen query, mensaje de excepcion ni stack. Suite backend50/50, build/lint correctos. Ver VALIDACION_ACCESOS_DENEGADOS_2026-10-08.md.

- [x] 2026-10-08, desarrollo: correcciones de turnos cerrados guardan snapshot comparable original o de la ultima correccion, diferenciando anulacion y preservacion del cierre. Prueba de grupo cerrado, dos ediciones sucesivas, rechazo a cajero y arqueos/movimientos intactos. Suite backend completa 46/46, build/lint correctos. Ver VALIDACION_AUDITORIA_CIERRES_2026-10-08.md.

- [x] 2026-10-08, desarrollo: captura comparable de pestañas de grupos abiertos editados mediante updateGroup, con UUID/orden, estado, monto, moneda, banco, movimiento, tasas y efectivo almacenado. Visor vincula UUID y etiqueta conteos compartidos; 21 pruebas auditoria/regresion financiera correctas. Ver VALIDACION_AUDITORIA_GRUPOS_2026-10-08.md.

- [x] En desarrollo: edicion individual ordinaria conserva efectivo almacenado antes/despues; visor compara unidades por denominacion en NIO/USD, separando principal/vuelto. Datos ausentes o invalidos no se interpretan como cero. Build/lint y 19 pruebas de auditoria/regresion financiera aprobadas.

- [x] En desarrollo: detalle de cambios restringido al Administrador, UUID validado, campos escalares permitidos por entidad, sin JSON completos ni secretos; estados anteriores/ posteriores parciales identificados. Build/lint y 12 pruebas de auditoria/catalogos correctas.
- [ ] Ampliar captura de antes/despues y normalizacion de estructuras de grupos/denominaciones; el visor inicial no acredita cobertura completa. Revisar visualmente el detalle en preview.
- [x] En desarrollo: edicion individual ordinaria captura monto, moneda, banco, movimiento y tasas anteriores bajo bloqueo y en la misma transaccion que la edicion. Visor compara tasas por rutas permitidas. Prueba real de edicion 100 a 120, auditoria y anulacion/arqueo correctos; 18 pruebas de auditoria/regresion financiera aprobadas. Rutas digitales e historicas conservan su auditoria separada.

- [x] En desarrollo: Auditoria consulta los ultimos 500 eventos reales, solo Administrador y sin opciones de escritura. No expone JSON internos ni secretos. Pruebas de catalogos 9/9 con preview, build y lint correctos. Ver VALIDACION_AUDITORIA_2026-10-07.md.
- [ ] Registrar accesos, denegaciones, lecturas sensibles, exportaciones, cambios de permisos, anulaciones y MFA sin registrar secretos.
- [ ] Alertas de nuevos dispositivos, intentos anormales y extraccion masiva; responsables, retencion y proteccion de logs.
- [ ] Limites por identidad/operacion y controles de abuso sin cupo arbitrario de registros; paginacion y reduccion de consultas duplicadas.

## Bloque 6: dispositivos y app movil

- [ ] Piloto de dispositivos autorizados entre sucursales mediante Zero Trust/certificados o postura administrada.
- [ ] Proteger web Y API; impedir bypass por onrender.com y validar identidad del proxy en el origen.
- [ ] Tras validar dominios propios, evaluar desactivar subdominios onrender.com desde Render; esto no sustituye validar el proxy si se adopta Zero Trust.
- [ ] Procedimiento de equipos perdidos, revocacion y acceso de emergencia; no usar MAC/localStorage como prueba segura.
- [ ] API versionada, idempotencia de registros financieros y concurrencia; no repetir escrituras automaticamente tras un fallo de red.
- [ ] Definir operacion movil con Internet primero; no permitir liquidaciones offline sin diseno y conciliacion especificos.

## Bloque 7: validacion continua

### Publicacion autorizada del 2026-10-10

- [x] Usuario autoriza terminar y publicar el paquete acumulado, excluyendo expresamente el Control de gastos (solo local).
- [x] Usuario confirma auditoria, resumen, exportaciones, MFA y logout en desarrollo; correo recibido en produccion. Pendiente uso completo del codigo tras el despliegue.
- [x] Regresion final:151 pruebas backend y21 frontend, build/lint y npm audit sin vulnerabilidades conocidas reportadas.
- [x] Preflight productivo de solo lectura:43 migraciones coincidentes, indices e identidades correctos; TLS del cliente verificado. Sin SQL nuevo.
- [x] Respaldo nuevo del10deoctubre restaurado en servidor local aislado:62 tablas/vistas. No modifica produccion ni valida todos los ACL/RLS o recuperacion de claves externas.
- [x] API y web80d6594 activas a17:42 Managua; API/base saludables, bundle exacto con API propia, CSP/header/meta, CORS y rechazo de anonimos comprobados. Login carga sin errores observados. Ver ESTADO_DESPLIEGUE_2026-10-10.md. Primer fallo de CORS resuelto por configuracion, sin debilitar validacion.
- [x] Titular confirma recuperacion completa en produccion con el ultimo correo, mensaje de contrasena actualizada e inicio posterior con VIP Access. Validacion de esa cuenta, no de todos los Administradores; sin compartir claves ni codigos.
- [ ] Verificar garantia de cifrado del salto interno pooler/PostgreSQL; pg_stat_ssl=false no invalida TLS verificado del cliente, pero tampoco demuestra TLS interno.

- [x] 2026-10-10, desarrollo: politica compartida para claves nuevas, maximo72bytes UTF-8 compatible con pgcrypto bf; cambio, recuperacion y claves temporales. Hashes/login/MFA existentes conservados. Backend102/102 y frontend21/21, build/lint correctos. Ver VALIDACION_POLITICA_CONTRASENAS_2026-10-10.md. No desplegado.

- [x] 2026-10-09, desarrollo: resumen de transferencias por sucursal/direccion, conteo entre parentesis, cajeros y bancos digitales; monedas separadas.21/21 pruebas frontend, build/lint y QA visual Edge escritorio/movil con avisos simulados y confirmacion completa. Ver VALIDACION_RESUMEN_TRANSFERENCIAS_2026-10-09.md. No desplegado.

- [x] 2026-10-09: clasificado supabase_logs.json recibido:100 eventos3F000 identicos entre12:06 y12:59 Nicaragua, anteriores al ajuste de PostgREST. Pendiente comprobar logs posteriores; no se ocultan errores ni se habilita Data API. Ver VALIDACION_CORREO_Y_LOGS_2026-10-09.md.
- [x] Segundo archivo2026-10-09:222 eventos3F000 entre17:54 y19:52 Nicaragua, ninguno posterior en la exportacion. A20:55 verificada configuracion y aislamiento por SQL de solo lectura. Indicio de cese, no comprobacion continua; pendiente confirmar logs mas recientes si reaparece.
- [ ] Revisar PostgREST durante operaciones del10deoctubre: usuario informa que ultimo error coincide con cierre del negocio. No cerrar incidente basandose en ausencia de actividad; no hay monitor automatico programado.

### Eficiencia de transferencias del 2026-10-08

- [x] Revision agregada de fotos y consultas frecuentes de produccion, solo lectura, sin extraer datos financieros ni atribuir GB exactos a contadores SQL.
- [x] Validacion de sesion sin descargar foto; acceso al turno ligero y exclusivo del cajero; notificaciones/acceso pausados en pestana oculta y recuperados al volver; deduplicacion de GET solo en curso, aislada por sesion y sin cache de autorizacion.
- [x] Lectura redundante del turno eliminada en /shifts/current; datos financieros consultados nuevamente en cada peticion. Backend83/83, frontend18/18, build/lint; regresion financiera repetida18/18 y recorrido local de Transacciones, Arqueo y Saldos sin guardar operaciones. Ver OPTIMIZACION_EGRESS_2026-10-08.md.
- [x] Publicacion autorizada de estas optimizaciones: API7965d1c confirmada antes de publicar web13e690e; asset optimizado y protecciones HTTP comprobados. Sin migraciones ni cambios de claves.
- [ ] Comparar posteriormente Egress por dia/servicio. No sustituye contratar Pro antes de la restriccion ni elimina consumo previo.
- [ ] Evaluar paginacion en servidor y deteccion de cambios sin perder filtros, exportaciones, permisos ni actualizacion financiera.

### Paquete preparado el 2026-10-08 (solo desarrollo)

- [x] Backend79/79, frontend14/14, build/lint correctos; npm audit completo y produccion con0 vulnerabilidades conocidas reportadas.
- [x] Preflight de solo lectura local: identidades sin duplicados, roles esenciales y Administradores activos, indices/migraciones040-043 presentes, ningun usuario activo con rol no soportado.
- [ ] Puertas manuales y preflight real antes de autorizar publicacion. Respaldo nuevo obligatorio. Ver PREPARACION_PAQUETE_SEGURIDAD_2026-10-08.md. Este bloque no despliega produccion.

### Publicacion autorizada del 2026-10-08

- [x] Usuario confirma exportaciones y cierre de sesiones; autoriza publicacion del paquete acumulado.
- [x] Preflight de produccion correcto; respaldo nuevo legible y migraciones040-043 aplicadas mediante TLS verificado. Build/lint y93 pruebas correctos. Ver PREPARACION_PAQUETE_SEGURIDAD_2026-10-08.md.
- [x] Revision0374238 desplegada, API/base y web saludables; cabeceras, CORS y rechazo de anonimos en exportaciones comprobados el2026-10-08 22:30 Managua. Clave MFA y enrolamientos conservados.
- [ ] Confirmacion del titular del Administrador de acceso real con VIP Access despues de este despliegue; no se usaron claves privadas para las verificaciones automatizadas.

### Refuerzo de exportaciones del 2026-10-08 (solo desarrollo)

- [x] Exportaciones Excel HTML: cadenas con formato de texto y prefijo protector cuando comienzan con =, +, - o @, incluso tras espacios o controles. PDF sin cambios. Ver VALIDACION_EXCEL_FORMULAS_2026-10-08.md.
- [x] Regresion conjunta: 55 pruebas backend, 11 frontend, compilacion y lint correctos.
- [ ] Abrir un Excel exportado en la aplicacion usada por el negocio; confirmar importes, textos y que las formulas de prueba no se ejecuten.
- [ ] Evaluar despliegue del paquete acumulado con respaldo, migraciones 040-042 en orden y verificaciones de permisos, auditoria y operaciones financieras. No desplegado por este bloque.

### Despliegue del 2026-10-07

- [x] MFA y paquete de seguridad publicados en produccion: b06b201; API y base saludables, web con flujo MFA, CSP/anti-framing, CORS y no-store verificados. Ver PREPARACION_DESPLIEGUE_SEGURIDAD_2026-10-07.md.
- [x] Usuario confirma enrolamiento y acceso correcto del usuario Admin con VIP Access en produccion. No acredita todos los demas Administradores.

### Evidencia adicional del 2026-10-07 (solo desarrollo)

- [x] Usuario confirma PDF y PNG sin inconvenientes con Administrador de prueba y las protecciones actuales. No acredita foto de perfil ni cabeceras de produccion.
- [x] Validacion estricta de tokens de acceso: formato, algoritmo, identidad, version y tiempos; rechazo antes de consultar la base. 23 pruebas backend correctas. Ver `VALIDACION_TOKENS_2026-10-07.md`.

- [x] Minimizar sucursales, metadatos de cuentas compartidas y contexto de transferencias para cajeros; 21 pruebas backend y 8 frontend correctas. Ver `VALIDACION_ALCANCE_CATALOGOS_2026-10-07.md`.
- [ ] Completar recorrido manual PDF/PNG y pantallas administrativas con CSP antes de desplegar este paquete.

- [ ] Prueba independiente de penetracion autorizada antes de afirmar cierre de riesgos criticos.
- [ ] Regresion de transacciones multiples, tasas preferenciales, pendientes, saldos, arqueos y turnos cerrados.
- [ ] Protocolo de incidentes, baja de empleados, rotacion de secretos, actualizaciones y simulacro de recuperacion.
- [ ] Revisar este checklist en cada entrega de seguridad y dejar evidencia de lo que realmente se completo.
