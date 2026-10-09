# Seguridad TEMO: contexto y checklist

Actualizado: 2026-10-06. Referencia: [informe de seguridad](INFORME_SEGURIDAD_TEMO_2026-10-06.md).

Seguimiento 2026-10-07: correccion operativa autorizada desplegada en d45772c (liquidaciones USD con NIO, arqueo nominal y resumen vertical de notificaciones). Evidencia en CORRECCION_LIQUIDACIONES_USD_2026-10-07.md. API y web verificadas; 20 pruebas backend y 5 frontend aprobadas. No se completaron nuevos bloques de seguridad; esas mejoras continuan en desarrollo.

## Reglas de seguimiento

- Trabajar y comprobar en desarrollo; desplegar solo con autorizacion expresa.
- Un [x] significa implementado y verificado en el entorno indicado, no automaticamente desplegado.
- Registrar evidencia y riesgos pendientes. No prometer seguridad absoluta ni confundir compras con controles activos.
- La futura aplicacion movil utilizara la misma API: aplicar permisos en servidor, no solo en la interfaz.

## Bloque 1: contencion inmediata

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

- [ ] Adquirir Supabase Pro; comprobar limites, costos y respaldos reales, no solo el nombre del plan.
- [ ] Definir RPO (datos que se tolera perder) y RTO (tiempo de recuperacion); evaluar PITR adicional.
- [ ] Restaurar un respaldo en entorno aislado, medir tiempos y mantener copia independiente cifrada.
- [ ] Contratar instancia de API pagada en Render; revisar por separado workspace, logs y alertas de consumo.
- [ ] MFA en Render, Supabase, registrador, DNS y proveedor de correo; revisar miembros, tokens y recuperacion.
- [ ] Separar usuario de base de datos de API y migraciones; privilegios minimos, TLS verificado y restricciones de red.
- [ ] Revisar Data API, permisos anon/authenticated y RLS segun arquitectura. No activar RLS sin pruebas.

## Bloque 3: dominio y recuperacion (dependencia obligatoria)

- [ ] Comprar dominio .com con MFA, bloqueo de transferencia y renovacion automatica.
- [ ] Crear app.DOMINIO.com y api.DOMINIO.com: agregar dominios en Render y CNAME en DNS al destino indicado por Render.
- [ ] Verificar HTTPS, URL del frontend/API, CORS y enlaces; conservar transicion probada y plan de vuelta atras.
- [ ] **Al confirmar que el dominio fue adquirido, retomar Olvide mi contrasena.** Configurar remitente personalizado, SPF/DKIM y politica DMARC gradual, validar entregabilidad.
- [ ] Recuperacion: respuesta generica, codigo/token de un uso y expiracion, limites de intentos, revocacion de sesiones y auditoria. Probar sin revelar si existe una cuenta.
- [ ] Decidir alcance de recuperacion para cajeros (actualmente restringido a Administrador); no ampliar silenciosamente.

Recordatorio persistente, no aviso programado: al informar la compra del dominio, esta tarea debe revisarse antes de cerrar su configuracion.

## Bloque 4: identidad y OTP

### Estado actual al 2026-10-08

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

### Paquete preparado el 2026-10-08 (solo desarrollo)

- [x] Backend79/79, frontend14/14, build/lint correctos; npm audit completo y produccion con0 vulnerabilidades conocidas reportadas.
- [x] Preflight de solo lectura local: identidades sin duplicados, roles esenciales y Administradores activos, indices/migraciones040-043 presentes, ningun usuario activo con rol no soportado.
- [ ] Puertas manuales y preflight real antes de autorizar publicacion. Respaldo nuevo obligatorio. Ver PREPARACION_PAQUETE_SEGURIDAD_2026-10-08.md. Este bloque no despliega produccion.

### Publicacion autorizada del 2026-10-08

- [x] Usuario confirma exportaciones y cierre de sesiones; autoriza publicacion del paquete acumulado.
- [x] Preflight de produccion correcto; respaldo nuevo legible y migraciones040-043 aplicadas mediante TLS verificado. Build/lint y93 pruebas correctos. Ver PREPARACION_PAQUETE_SEGURIDAD_2026-10-08.md.
- [ ] Confirmar revision desplegada, API/web, cabeceras y continuidad del acceso MFA despues del push. No reiniciar el enrolamiento ni reemplazar su clave.

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
