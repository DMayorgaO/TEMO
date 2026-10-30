# Publicacion acumulada del 2026-10-30

Zona horaria America/Managua. Usuario autoriza publicacion y confirma ausencia de usuarios operando TEMO. Estado de esta primera evidencia: migracion productiva aplicada; publicacion API/web y smoke tests pendientes.

## Preparacion

- Paquete funcional y de seguridad descrito en CANDIDATO_PRODUCCION_2026-10-29.md. Produccion anterior funcional 45d1cf7; main anterior 0f4cb09, documental.
- Regresion previa: 316 backend, 34 frontend, doce recorridos de navegador interceptados y 24 pruebas financieras/Directorio bajo rol SQL restringido. Compilacion explicita productiva y lint de ambos proyectos correctos con Node 22.23.4. Una prueba adicional de recuperacion y seis existentes aprobadas al preparar este despliegue.
- Respaldo productivo nuevo bajo pausa: temo-production-20261030-055911.dump, SHA256 4b61f95c5dfa631850aba238a29263a2385e02ae71e2aa28bd57a210abda7d4b. Privado, fuera del repositorio. Se agrega manifiesto de tablas/estructura/secuencias e historial de 54 migraciones, capturado con TLS en transaccion de solo lectura y comparado contra la restauracion.
- Restauracion en cluster temporal propio/loopback: 62 tablas de datos y 7 secuencias coincidentes. Migracion 055 ensayada, proyeccion de todas las columnas originales conservada y ambos triggers de version comprobados con escrituras revertidas. El respaldo contiene 64 tablas/vistas del esquema y 7 usuarios; no se probaron operaciones reales sobre caja productiva.
- Produccion usa PostgreSQL 17 y restauracion local 18. Modo portable explicito mantiene comprobacion exacta de NOT NULL en atributos de columnas y excluye solo su representacion duplicada como constraint de tipo n. CHECK, PK, FK y demas objetos no se omiten. Prueba negativa demuestra deteccion de columna nullable y CHECK alterado. Comparador original de preview sigue exigiendo misma version mayor.
- Cambio de representacion contrastado con [notas oficiales de PostgreSQL 18](https://www.postgresql.org/docs/18/release-18.html) y [catalogo pg_constraint](https://www.postgresql.org/docs/18/catalog-pg-constraint.html).
- Escaneo previo: 74 archivos candidatos, cero rutas privadas prohibidas y cero coincidencias con valores privados conocidos de configuracion. No equivale a detectar todo secreto desconocido. Gastos, informe privado, env, certificados, respaldos y tmp excluidos; no se agregan con force.
- npm audit --omit=dev: cero reportes conocidos. Permanece seguimiento de herramientas de compilacion; no se fuerza downgrade de Nest.

## Base productiva

- Preflight previo: TLS verificado, identidades/roles/indices correctos, 54 migraciones coincidentes y solo 055 faltante.
- 055_transfer_change_security.sql aplicada una sola vez; SHA256 89965398784fe3bce36504c3a551258d7973a616d2c3aa3cc2e82dab31d31f08. No se reejecutaron archivos anteriores.
- Preflight posterior aprobado: 55 migraciones sin faltantes/cambios, dos Administradores activos, tres roles operativos, sin identidades duplicadas ni perfiles activos no soportados. backend_hop_tls=false representa el salto interno del pooler; el transporte TLS del cliente esta verificado.

## Puertas restantes

- Publicar API primero, comprobar revision/health y despues web compatible. Confirmar assets exactos, CSP/CORS/no-store y rechazo de anonimos sin registrar operaciones de prueba reales.
- Confirmacion de configuracion efectiva en Render por titular: Compute Plan 0.5c-512mb y Node 22.23.4. La prueba negativa de CA desde Render sigue pendiente; no se inventa una conexion de administracion que no existe.
- Titulares verifican login/MFA/logout, recuperacion con codigo nuevo y operaciones habituales. No extraer sesiones/OTP ni suplantar cuentas.
- No restaurar este respaldo encima de movimientos posteriores ni retirar 055 automaticamente. Ante problemas mantener pausa, identificar revision y revisar retorno compatible de API/web.
