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

TOTP aumenta seguridad, pero no evita por completo phishing ni abuso de una sesion ya robada. No esta implementado todavia.

## Bloque 5: auditoria y deteccion

- [ ] Sustituir datos demostrativos de auditoria por eventos reales.
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

### Evidencia adicional del 2026-10-07 (solo desarrollo)

- [x] Usuario confirma PDF y PNG sin inconvenientes con Administrador de prueba y las protecciones actuales. No acredita foto de perfil ni cabeceras de produccion.
- [x] Validacion estricta de tokens de acceso: formato, algoritmo, identidad, version y tiempos; rechazo antes de consultar la base. 23 pruebas backend correctas. Ver `VALIDACION_TOKENS_2026-10-07.md`.

- [x] Minimizar sucursales, metadatos de cuentas compartidas y contexto de transferencias para cajeros; 21 pruebas backend y 8 frontend correctas. Ver `VALIDACION_ALCANCE_CATALOGOS_2026-10-07.md`.
- [ ] Completar recorrido manual PDF/PNG y pantallas administrativas con CSP antes de desplegar este paquete.

- [ ] Prueba independiente de penetracion autorizada antes de afirmar cierre de riesgos criticos.
- [ ] Regresion de transacciones multiples, tasas preferenciales, pendientes, saldos, arqueos y turnos cerrados.
- [ ] Protocolo de incidentes, baja de empleados, rotacion de secretos, actualizaciones y simulacro de recuperacion.
- [ ] Revisar este checklist en cada entrega de seguridad y dejar evidencia de lo que realmente se completo.
