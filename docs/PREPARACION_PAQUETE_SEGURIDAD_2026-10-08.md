# Preparacion del paquete de seguridad

Fecha: 2026-10-08. Estado: desarrollo validado automaticamente; autorizacion y puertas finales de produccion pendientes.

## Alcance acumulado

Auditoria legible y comparacion de cambios, acceso por identidad/sucursal, registro acotado de denegaciones y lecturas sensibles, exportaciones autorizadas por API con auditoria obligatoria, proteccion de archivos, limites especificos de exportacion y refuerzo de identidades/roles/sesiones. MFA administrativo ya estaba desplegado; este paquete lo conserva.

Produccion de referencia: b06b201d69120182068cad054a3baaea340c006e. No se hicieron push, despliegues ni migraciones de produccion en este bloque.

## Puertas antes de autorizar

- [x] Compilacion backend/frontend y lint correctos.
- [x] Backend 79/79 y frontend 14/14, incluyendo regresiones financieras y MFA.
- [x] Dependencias completas y de produccion sin vulnerabilidades conocidas reportadas por npm audit en esta fecha.
- [x] Preflight aislado de identidades, roles, indices y migraciones correcto.
- [ ] Administrador: probar Usuarios, confirmar/cancelar Cerrar sesiones con cuenta de prueba y comprobar que vuelve a exigir login; revisar cambios en Auditoria. No probar revocacion con un cajero atendiendo clientes sin coordinacion.
- [ ] Abrir Excel reciente en la aplicacion del negocio, validar importes/textos y neutralizacion de formulas. El formato actual es Excel HTML .xls, no XLSX nativo.
- [ ] Exportar PDF y PNG desde navegador habitual con Administrador. La confirmacion previa del usuario acredita el bloque anterior, no automaticamente las ultimas rutas de exportacion autorizadas por servidor.
- [ ] Recorrido de operaciones normales con cuenta de prueba, sin modificar registros financieros reales: multiples, pendientes, tasas, saldos, arqueo y cierre.
- [ ] Revisar diferencias y archivos acumulados, dejar revision identificable del paquete. No incluir secretos, tmp, respaldos ni evidencia privada en Git.
- [ ] Autorizacion explicita para produccion, ventana coordinada y responsable de verificacion/recuperacion.

## Preflight de produccion, al autorizar

1. Confirmar revision actualmente desplegada, estado de servicios y migraciones reales. Comprobar en solo lectura usuarios/correos duplicados normalizados, al menos un Administrador activo, tres roles esenciales activos y usuarios activos con perfiles distintos de los tres soportados. Detener ante diferencias; no borrar usuarios automaticamente. El script check-security-readiness.mjs apunta exclusivamente a preview y no sirve para acreditar produccion.
2. Generar respaldo nuevo de base de datos, verificar que se puede leer y registrar integridad; disponer de procedimiento de restauracion probado. El respaldo del 2026-10-07 no sustituye uno actual.
3. Revisar variables sin mostrar sus valores: AUTH_SECRET, clave MFA existente, TLS verificado, CORS de origen exacto y URL API de frontend. Conservar la clave MFA, no regenerarla como parte de un deploy.
4. Aplicar, mediante el procedimiento de migraciones existente, archivos 040, 041, 042 y 043 en orden, comprobando historial/checksums y estado final. La 043 agrega indices unicos y puede tomar bloqueo; coordinar ventana y revisar tamano de usuarios. Si hay duplicados, detener y resolver con el responsable. No reejecutar manualmente cambios sin revisar su historial.
5. Desplegar API y frontend de la misma revision aprobada. Probar cabeceras CSP/anti-framing/no-store y CORS, MFA real, permisos cajero/Administrador, exportacion con auditoria y ausencia de secretos en respuestas/logs.
6. Verificar salud, errores, latencia y continuidad de registros con los responsables. Una API saludable por si sola no acredita que se guardan transacciones correctamente. No reintentar automaticamente escrituras financieras fallidas.

## Vuelta atras

- Conservar revision anterior y configuracion validada. Migraciones 040-043 son aditivas; no eliminar auditoria ni revertir indices a ciegas.
- Evaluar revertir codigo manteniendo esquema compatible y detener operacion afectada si falla una puerta critica.
- No restaurar un respaldo antiguo sobre transacciones nuevas para resolver un error de codigo. Cualquier restauracion requiere conciliacion, captura de movimientos posteriores y autorizacion del responsable.
- Registrar incidentes y evidencia sin claves, OTP, tokens o contenido financiero innecesario.

## Riesgos que no cierra este despliegue

Compra/configuracion de dominio y correo personalizado, planes e infraestructura, privilegios minimos y exposicion de base de datos, equipos autorizados/Zero Trust, inventario de sesiones por dispositivo, alertas externas, reautenticacion de acciones sensibles y pentest independiente siguen en el checklist. Los limites de exportacion son por instancia; un despliegue horizontal requiere estado compartido. No se establece un cupo de registros/consultas financieras ni se garantiza seguridad absoluta.

Preview: http://127.0.0.1:3187. Reiniciar sus servicios puede exigir nuevo login; los datos de ejemplo y enrolamiento MFA se conservan.

## Publicacion autorizada

- Usuario confirma exportaciones y cierre de sesiones y autoriza produccion el 2026-10-08.
- Preflight de produccion, solo lectura: usuarios/correos normalizados sin duplicados, 2 Administradores activos, 3 roles esenciales activos, 0 usuarios activos con perfiles no soportados. API previa saludable en revision b06b201.
- Respaldo nuevo: backups/production/temo-production-20261008-222658.dump; SHA-256 58caa40124fa2fb2d6b82b4f56f0e73c55b35a66cb1d21adf9639e6605c07a82. pg_restore --list lee 495 entradas. Legibilidad comprobada, no restauracion completa.
- Migraciones040-043 aplicadas con TLS verificado y runner existente; 39 anteriores omitidas tras validar hashes. Resultado: 43 migraciones registradas. No se modificaron saldos ni transacciones financieras.
- Repetidos build, lint y suites: backend79/79 y frontend14/14 correctos.
- Pendiente al preparar este commit: push y comprobacion de revision/API/web desplegadas. Conservar MFA_ENCRYPTION_KEY existente.

## Despliegue confirmado

- Revision publicada en main y develop: 0374238c2285bda1062d61eaeb90ec6e12d9035a, sin force push.
- 2026-10-09 04:30 UTC (2026-10-08 22:30 Managua): API200, database ok y revision exacta comprobada. Web200, asset index-BTwsK50e.js con MFA, cierre de sesiones y exportaciones por API.
- Base verificada despues de migrar: 43 migraciones, 3 indices unicos nuevos validos y 0 eventos de auditoria sin numero.
- Rutas privadas /auth/me, /catalogs/auditoria y /catalogs/usuarios rechazan anonimos con401 y Cache-Control no-store; API mantiene CSP, DENY y nosniff.
- Las cuatro rutas de exportacion verificadas rechazan anonimos con401/no-store. CORS autoriza el origen de TEMO y no devuelve autorizacion para un origen ajeno. Web mantiene CSP y DENY.
- No se cambiaron variables de Render ni la clave MFA, ni se reiniciaron enrolamientos. No se crearon operaciones financieras para verificar produccion.
- Pendiente confirmacion de acceso real con VIP Access por el titular del Administrador despues de actualizar; no se utilizaron sus claves u OTP. La verificacion automatizada no sustituye el recorrido funcional autenticado en produccion.
- Evidencia posterior registrada en develop para no generar otro despliegue de codigo por un cambio exclusivamente documental.
