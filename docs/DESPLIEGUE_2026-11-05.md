# Publicación acumulada — 5 de noviembre de 2026

Autorización expresa del titular: corregir Arqueo/tasa D y publicar junto con la liquidación entre monedas y los cambios acumulados. Zona America/Managua. Preparación en `develop`, sobre `70c6d55`; publicación prevista por avance de `origin/main`, sin forzar referencias.

## Contenido

- Transacciones con paginación, filtros y orden del servidor, totales del conjunto filtrado y exportación completa autorizada dentro del límite existente. Control de respuestas antiguas y refrescos. Detalles en `TRANSACCIONES_PAGINADAS_2026-10-30.md`.
- Corrección de compensación de pendientes en operaciones múltiples; liquidación NIO/USD con Compra/Venta correspondiente, importes y conversiones auditados, reporte de dólares, edición y reversión atómicas. Detalles en `LIQUIDACION_ENTRE_MONEDAS_2026-11-04.md`.
- La tasa reservada D (36.55) nunca se registra ni se selecciona como tasa general. Se conserva en las transacciones que la utilizan; las filas heredadas del catálogo no se borran ni cambian. El arqueo usa la última tasa normal, con respaldo 36.40. Las equivalencias y el rótulo de Compra usan la misma tasa que el cálculo general.
- El ajuste D considera los abonos compensados del grupo, descontados una sola vez en la última operación efectiva; excluye créditos nuevos como fuente de efectivo.
- Prueba del grupo de la captura: retiro NIO 42,550 y depósitos USD 100/50/800/200 sin entrega/reingreso ficticio. A Compra 36.40 y Venta 37, el efectivo contado no cambia, el esperado baja C$ 690 y el reporte reconoce USD 1,150 / C$ 690. Repetir edición no cambia ese efecto; anular lo revierte.

## Diagnóstico productivo de solo lectura

Con TLS verificado y transacción READ ONLY se consultó TRA-007761: las cinco operaciones conservan Compra 36.40 / Venta 37. La fila más reciente de `tipos_cambio` tenía Compra 36.55, registrada a las 18:32 del 5 de noviembre. El cálculo general anterior seleccionaba esa fila. No se modificaron movimientos, diferencias registradas ni tasas de las transacciones históricas.

Las cifras de la captura reproducen exactamente C$ 534 con 36.55: 67,474 + 363×36.55 − 80,005.24 − 202.41. El turno continuó recibiendo movimientos después de la captura; no se fuerza su diferencia actual a un número fijo.

## Respaldo y seguridad de publicación

Respaldo privado `backups/production/temo-production-20261105-190215.dump`; SHA256 `f39f68b1f7a59b792ad4905baf36c7274300d0b9f8128ca99ad5ea40e1ee1daf`. Restaurado satisfactoriamente en un clúster temporal separado: 64 tablas/vistas y 7 usuarios. No se restauró sobre preview ni producción. El verificador conserva validación de PID y carpeta propios; se quitó el filtro de estado TCP que en este Windows no reconocía el listener aunque PostgreSQL estaba disponible.

No se requieren migraciones ni escrituras correctivas sobre datos productivos. El respaldo es de un momento consistente de pg_dump, no se presenta como respaldo bajo pausa de usuarios. Control de gastos, informe privado de seguridad, credenciales, certificados, `.env`, respaldos y `tmp` quedan fuera de la publicación.

## Verificación y resultado

Preparación aprobada: 353 pruebas backend, 34 frontend y 15 suites de navegador, sin fallos u omitidas en la ejecución final. 68 pruebas financieras/seguridad repetidas con rol SQL restringido y regresión de conversiones D aprobadas. Compilación y lint correctos. Auditoría de dependencias de ejecución: cero vulnerabilidades conocidas reportadas. Permanece la advertencia de tamaño del bundle de Vite.

Preflight productivo: TLS verificado, 55 migraciones coincidentes sin faltantes ni hashes cambiados. Escaneo de los 34 archivos candidatos: cero rutas privadas prohibidas y cero coincidencias con secretos conocidos de configuración (no equivale a detectar cualquier secreto desconocido). El cálculo corregido se ejecutó también sobre datos reales mediante READ ONLY: tasa general 36.40 y las cinco tasas originales del grupo sin alteración.

El primer intento de pruebas encontró preview apagado; se inició conservando sus datos y se repitió la batería completa. La primera restauración temporal tropezó con el filtro de estado TCP del verificador; al corregir su detección de puerto/PID se restauró el respaldo exitosamente.

Revisión funcional publicada y verificada: `0a6b23ca93522c51a37f43e5740b49fe0f0eb7f4`. `git push origin HEAD:main` completado sin force. API y web actualizaron por autodespliegue; la API estuvo lista primero y se esperó a la web antes de dar por terminada la publicación.

Smoke público final aprobado: health muestra la revisión exacta y PostgreSQL `ok`; siete rutas protegidas rechazan acceso anónimo con 401/no-store; CORS propio permitido y origen ajeno no autorizado. Web HTTP 200, DENY, nosniff y CSP verificados. JS/CSS coinciden byte por byte con el build productivo explícito:

- `index-ZRJUAAvW.js`: SHA256 `c66275e6df66527e22160db7ab6217f42a4a0616dfea48a473c90729db189350`.
- `index-dHDym9mW.css`: SHA256 `feabac8ffc971232cc2305b20e2d4c5afc0a7069fe77dc72066afb49ba0b51ab`.

Se requiere recarga completa del navegador para usar el nuevo formulario. La comprobación autenticada del arqueo actual corresponde al titular: hubo operaciones posteriores a las capturas y no se afirma que el saldo total actual deba ser exactamente C$ 690. Sí se verificó el aporte de C$ 690 del grupo reproducido. No se realizaron movimientos financieros ficticios ni autenticaciones suplantadas en producción. El commit posterior sólo documental utiliza `[skip render]`.
