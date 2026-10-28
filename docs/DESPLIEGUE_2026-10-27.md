# Publicacion conjunta del 2026-10-27

Estado: API y web publicadas y verificadas en 45d1cf7948265d3a11972556de8f0b36d9abd0fe el 2026-10-27 a las 22:06. Publicacion autorizada por el usuario. Zona horaria America/Managua.

## Preparacion verificada

- Usuario confirma pausa de operaciones y guarda NODE_VERSION=22.23.4 con Save Only en ambos servicios. No se cambiaron claves, credenciales MFA ni proveedor de correo.
- API anterior identificada por health: 25b0f2bc849c6bc0b6a1a0be425e3a914dd050ff. API 69704c3 verificada primero; interfaz funcional nueva enviada despues en 45d1cf7. Ambos servicios ya confirman la revision final (health y assets exactos).
- Build/lint correctos y regresion final 242/242 backend y 33/33 frontend; siete recorridos de navegador con API interceptada aprobados. No equivalen a probar todas las cuentas productivas.
- Respaldo final bajo pausa: temo-production-20261027-215740.dump, SHA256 8431c48d6a83d109e83b4309e03b218251695c118e60e52d9d034bdb8cb6e51a. Archivo privado excluido del repositorio.
- Respaldo restaurado en PostgreSQL temporal local: 62 tablas/vistas, 7 usuarios. Ensayo adicional de migraciones 044-054 en esa copia aprobado; se conservan las proyecciones originales de las 60 tablas, salvo los dos registros previstos de denominaciones NIO. No se prueban operaciones de negocio sobre datos productivos reales.
- Contencion en la copia restaurada: 5 conexiones, 100 escrituras sobre el mismo grupo, 242 ms totales, p95 20 ms, maximo 30 ms; sin versiones perdidas. Solo mide triggers en hardware local, no certifica capacidad de Render.
- Migraciones 044-054 aplicadas en produccion. Preflight posterior: 54 migraciones sin faltantes ni cambios, identidades/roles e indices normalizados correctos, TLS del cliente verificado. El campo backend_hop_tls=false describe el salto interno del pooler, no el TLS cliente confirmado.
- Guardia de runtime incorporada a builds de ambas workspaces y arranque de la API: rechaza ramas no parcheadas segun el aviso Node/eMudhra de octubre y TLS deshabilitado. No acredita por si sola una prueba negativa de certificados desde Render.

## Aviso nuevo de dependencia de compilacion

La auditoria del 2026-10-27 reporta tres entradas de severidad baja por una sola dependencia: deepmerge 4.3.1, transitiva de fork-ts-checker-webpack-plugin y @nestjs/cli. GHSA-gcqx-w48m-w2h4 no publica version corregida. npm audit --omit=dev reporta cero vulnerabilidades conocidas.

No se aplico el downgrade incompatible a Nest CLI 7 sugerido por npm. La dependencia no interviene en solicitudes de la API ni se empaqueta en la web; queda pendiente actualizar el compilador cuando exista una correccion compatible. Mantener fuentes y configuraciones de compilacion de confianza; no se afirma ausencia universal de vulnerabilidades.

Fuente: https://github.com/advisories/GHSA-gcqx-w48m-w2h4

## Comprobaciones posteriores y pendientes

- Control de gastos, configuracion privada, certificados, respaldos, tmp y el informe aportado no se publican. Escaneo local de valores privados de configuracion en archivos candidatos: sin coincidencias.
- Automatizacion del navegador detenida al no poder comprobar la URL de Edge con confianza; no se continuo por esa via ni se extrajeron cookies. No hay conexion directa a Render. Se verificaron revisiones publicas y el usuario confirma Deploy succeeded de la API; no se uso ese aviso como sustituto de health ni del cotejo de assets.
- API 69704c369dd29d8070f70076e4a4bc79c5bc32a4 confirmada por health publico con base saludable el 2026-10-27 a las 22:03 Managua. Rutas auth/me, transactions, shifts, shifts/handovers y catalogs/auditoria rechazan anonimos con 401/no-store. CORS admite solo el origen propio probado; el origen externo de prueba no recibe autorizacion. JSON malformado devuelve 400 sin el cuerpo enviado. No se probaron logins con claves reales ni se registraron operaciones financieras.
- API final 45d1cf7948265d3a11972556de8f0b36d9abd0fe y PostgreSQL saludables. Preflight posterior sigue aprobado con 54 migraciones. El arbol backend de 69704c3 y 45d1cf7 es identico.
- Web HTML, logo PNG, JS y CSS: 200. JS index-HkjcibOs.js coincide byte por byte con la compilacion explicita VITE_API_URL productiva, VITE_APP_ENV=production y VITE_SESSION_IDLE_MINUTES=30; SHA256 c44aa0a28e047b82bcb1d46edcd441096d2e6829c9c322e994c3eab53e91d028. CSS index-Db4QgB25.css tambien coincide: b340bdfd442054f773be7dae789b60ff31a79fd85e5edf53186448d3e4557985.
- CSP HTTP y meta permiten API propia; anti-framing, nosniff, Referrer-Policy y Permissions-Policy comprobadas. No se verifico una sesion autenticada en navegador productivo; las pruebas visuales fueron locales con API interceptada.
- Pendiente: confirmacion manual final con Administradora/cajeros, MFA/logout y recuperacion con codigo nuevo por sus titulares; no extraer OTP ni registrar operaciones financieras reales como prueba.
- Runtime: usuario confirma NODE_VERSION=22.23.4 en ambos servicios y las compilaciones/arranque nuevos incluyen la guardia fail-closed. Pendiente evidencia directa de runtime en logs de Render y rechazo de certificados desde ese entorno; configuracion y revision no sustituyen esta prueba de CA.

Disponibilidad tecnica final confirmada. Los usuarios pueden iniciar sesion para la comprobacion funcional final. El retorno exige conservar EN_REVISION, aislamiento de fondos, recibos y versiones; no borrar tablas ni restaurar encima de operaciones posteriores.

El commit final de documentacion usa [skip render], reservado a documentacion, para registrar estas evidencias sin reconstruir otra vez los servicios. La revision funcional Live sigue siendo 45d1cf7. Referencia: https://render.com/docs/deploys#skipping-an-auto-deploy
