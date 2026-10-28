# Publicacion conjunta del 2026-10-27

Estado: API publicada y verificada; interfaz nueva preparada para el segundo envio. Publicacion autorizada por el usuario. Zona horaria America/Managua.

## Preparacion verificada

- Usuario confirma pausa de operaciones y guarda NODE_VERSION=22.23.4 con Save Only en ambos servicios. No se cambiaron claves, credenciales MFA ni proveedor de correo.
- API anterior identificada por health: 25b0f2bc849c6bc0b6a1a0be425e3a914dd050ff. Se publicara API antes de la interfaz funcional nueva.
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

## Exclusiones y verificaciones pendientes

- Control de gastos, configuracion privada, certificados, respaldos, tmp y el informe aportado no se publican. Escaneo local de valores privados de configuracion en archivos candidatos: sin coincidencias.
- Automatizacion del navegador detenida al no poder comprobar la URL de Edge con confianza; no se continuo por esa via ni se extrajeron cookies. No hay conexion directa a Render. Se verificaran revisiones publicas y se coordinara con el usuario cualquier accion necesaria en Dashboard.
- API 69704c369dd29d8070f70076e4a4bc79c5bc32a4 confirmada por health publico con base saludable el 2026-10-27 a las 22:03 Managua. Rutas auth/me, transactions, shifts, shifts/handovers y catalogs/auditoria rechazan anonimos con 401/no-store. CORS admite solo el origen propio probado; el origen externo de prueba no recibe autorizacion. JSON malformado devuelve 400 sin el cuerpo enviado. No se probaron logins con claves reales ni se registraron operaciones financieras.
- Pendiente: publicar web y comprobar assets/CSP. Confirmacion manual final con Administradora/cajeros y MFA por sus titulares; no extraer OTP ni registrar operaciones financieras reales como prueba.
- Pendiente: comprobar runtime efectivo en logs de Render y rechazo de certificados desde ese entorno. La configuracion declarada no sustituye esta evidencia.

El retorno exige conservar EN_REVISION, aislamiento de fondos, recibos y versiones; no borrar tablas ni restaurar encima de operaciones posteriores. Mantener usuarios fuera hasta confirmar disponibilidad final.
