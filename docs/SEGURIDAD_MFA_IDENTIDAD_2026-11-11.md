# MFA: identidad vigente y atomicidad (2026-11-11)

Estado: implementado en desarrollo; no publicado. No requiere migración nueva. Conserva los cambios locales anteriores y el funcionamiento de VIP Access.

## Alcance

La creación del desafío MFA ahora comprueba dentro de la transacción la versión exacta de sesión, usuario activo y rol JEFA activo. Antes solo comprobaba estado y versión del usuario; podía crear un desafío después de cambiar o desactivar su rol durante el ingreso.

Creación y verificación siguen el orden de bloqueo usado por administración de identidad: advisory 741260810, usuario exclusivo y rol compartido. El rol permanece protegido hasta terminar la transacción, evitando que se desactive entre la autorización y la confirmación de MFA. Se conservan las comprobaciones posteriores al MFA y las de cada uso del token.

No cambian tasas, cálculos financieros, turnos, permisos operativos ni la experiencia de VIP Access. Se conservan vencimiento del desafío, ventana OTP, límite de intentos, protección contra reutilización, cifrado del secreto y recuperación de un solo uso.

## Pruebas dirigidas

18 pruebas aprobadas en mfa-identity-boundary, mfa-login y mfa-secret-vault, sin fallos ni omitidas:

- Rechazo por usuario inactivo, versión revocada, cambio de rol o rol inactivo tanto al crear como al verificar el desafío; sin consumir ni modificar estado MFA.
- Si falla la auditoría de alta, se revierten secreto, códigos de recuperación, consumo del desafío y versión de sesión.
- Si falla la auditoría de recuperación, se revierte el consumo del código y del desafío; el reintento válido funciona y su reutilización se rechaza.
- Dos conexiones reales: una revocación concurrente impide crear el desafío después de esperar el bloqueo. Una creación en curso impide modificar el rol hasta finalizar.
- Ciclo completo existente de alta, QR legible, ingreso posterior, OTP incorrecto/reutilizado, recuperación, vencimiento, revocación, bloqueo por intentos y ausencia de clave/configuración.

Los casos nuevos transaccionales de identidad y auditoría se ejecutaron también con el rol SQL restringido. La prueba concurrente utiliza el usuario local de pruebas y elimina únicamente su usuario sintético; el ciclo MFA existente revierte sus datos y no se ejecuta bajo el rol restringido. No hay pruebas sobre usuarios ni movimientos productivos.

## Límites

El bloqueo global conserva el orden existente de administración de identidad, pero no acredita capacidad bajo carga. La prueba concurrente nueva cubre creación del desafío y bloqueo del rol; la verificación tiene comprobaciones SQL de identidad y atomicidad, sin una carrera simultánea específica para cada variante OTP/recuperación. No cierra los pendientes de infraestructura, alertas, retención de auditoría ni la matriz general de permisos. No se modificaron claves MFA ni la configuración productiva.

## Regresión final

Build/lint correctos. 389 pruebas backend, 37 frontend y seis suites de navegador aprobadas, sin fallos ni omitidas. Recorridos: paginación, filtros de moneda, revisión, liquidación de pendientes, vuelto/cambio y edición con versión. Las 18 pruebas dirigidas están incluidas en el total backend; no se suman de nuevo. Logs privados: tmp/security-mfa-directed.log y tmp/transaction-table-*.log.

Desarrollo reiniciado con datos conservados y correo deshabilitado. API y web locales comprobadas con HTTP 200. No se publicó ni modificó producción.
