# Despliegue de TEMO — 23 de noviembre de 2026

Publicado con autorización expresa del titular y confirmación de pausa de todos los usuarios.

## Versión publicada

Revisión funcional: 608d10d163533b5f7849ff534e2a50a63d52b3a2. Publicada desde develop mediante git push origin HEAD:main, sobre cf08337b26d533f3e74aa4c32695da62515a3c6a, sin forzar referencias. La rama main local permanece atrasada.

Incluye los 108 archivos del candidato acumulado: controles de seguridad, recibos idempotentes de Directorio, reordenación y copiado, tasa D en primer depósito NIO pagado con USD, indicadores de saldo y diferencias de turnos históricos. Detalle y límites en CANDIDATO_PRODUCCION_2026-11-23.md. Control de gastos, secretos, certificados, respaldos, tmp e informe privado quedaron fuera.

## Respaldo y esquema

Respaldo privado actualizado durante la pausa: backups/production/temo-production-20261123-064703.dump.
SHA-256: ebe034af46dcd0b9a6f6ee0ff8aff04e448d78d46d5d96667f512839e7ee8078.

Restauración aislada y ensayo de 056 aprobados: 62 tablas de datos y siete secuencias intactas, únicamente cambió el CHECK previsto. No se restauró sobre producción ni preview.

Aplicada únicamente la migración pendiente 056_directory_request_receipts.sql antes de publicar API/web. Preflight posterior: ready=true, 56 migraciones, ninguna faltante ni hash modificado, conexión cliente con TLS verificado. No certifica TLS del salto interno del pooler ni el rol efectivo de Render.

## Verificación

- Preparación: 477 pruebas backend, 37 frontend, 21 suites de navegador; build y lint aprobados. Repetidas 79 comprobaciones financieras/Directorio/ámbito/turnos con rol restringido donde el helper lo admite, incluidas en el total original.
- API productiva: health 200, PostgreSQL ok y revisión exacta 608d10d163533b5f7849ff534e2a50a63d52b3a2.
- Web productiva 200; JS index-BAqiBAPY.js y CSS index-oLI64kAe.css coinciden byte por byte mediante SHA-256 con el build preparado.
- SHA-256 JS: fff32bd1b1e274f8bbe29d686ebc86937919ebf987fdb9cf30d2aeb05065b8ba.
- SHA-256 CSS: 78e0cc45cae6dcf8cff5c1c900241ef58091c1350042d4ace6f0ea9d08c70635.
- Ocho rutas protegidas comprobadas con GET y HEAD: 16 rechazos 401 y no-store. CORS permite el origen propio y no autoriza el ajeno. CSP, DENY y nosniff presentes en API y web.
- Sin pruebas financieras ficticias ni suplantación de sesiones productivas. No equivale a probar todos los flujos financieros autenticados en producción.

Manifiesto del índice antes del commit: tmp/deploy-nov23-staged.json, SHA-256 72b3879cd66d0cec0014150f7280ee466e9daefe17b7d46f8ec75d4fdd8bc193. Escaneo de secretos y rutas aprobado; solo se eliminaron dos líneas vacías finales en pruebas de navegador después del manifiesto original. Evidencia operativa privada: tmp/deploy-nov23-*.log.

## Reanudación y pendientes

Se comunicó que se pueden reanudar operaciones después de Ctrl+F5 en cada equipo. Clientes antiguos deben actualizarse para guardar Directorio. Si se necesita recuperación de contraseña, solicitar un código nuevo; se conservan claves y enrolamientos MFA.

Pendiente confirmación del titular mediante uso legítimo de ingreso/VIP Access, exportación y Arqueo/Saldos. Auditoría runtime: cero vulnerabilidades conocidas reportadas; quedan tres moderadas de herramientas Nest/glob/minimatch. Persisten los controles externos y de privilegios de runtime señalados en el checklist; no se declara cerrado todo el programa de seguridad ni resuelto todo rendimiento.

No restaurar este respaldo automáticamente sobre movimientos posteriores ni revertir 056 automáticamente. Cualquier incidente requiere evaluar movimientos y compatibilidad antes de retornar.
