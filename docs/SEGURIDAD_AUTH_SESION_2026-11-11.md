# Autenticación y sesión: 2026-11-11

Estado: implementado y verificado solo en desarrollo. Sin commit, publicación ni nueva migración. Se conservan los cambios locales anteriores.

## Cambios

- Política explícita para los ocho manejadores de autenticación; cualquier manejador nuevo sin política se rechaza. Las cuatro entradas públicas (ingreso, solicitud/confirmación de recuperación y MFA) conservan su acceso público y contratos estrictos.
- Rechazo de parámetros de consulta adicionales; consulta de sesión y cierre no admiten campos de cuerpo adicionales.
- Se conserva el acceso básico a sesión, cambio de contraseña y cierre para usuarios activos con cambio obligatorio de contraseña o perfil sin acceso operativo. Foto de perfil exige un perfil operativo habilitado.
- Foto y cierre revalidan en la misma transacción usuario/rol activos, versión exacta y rol correspondiente. Foto también exige que no haya cambio obligatorio de contraseña. Usan el orden de bloqueo de administración de identidad y cambio de contraseña: advisory 741260810, usuario exclusivo y rol compartido.
- Un cierre antiguo no incrementa la versión de una sesión posterior. Foto y cierre conservan auditoría atómica: si falla, se revierte la escritura.
- La respuesta de consulta de sesión comprueba que no haya cambiado la versión o el rol desde la validación inicial. La respuesta de foto utiliza esa misma comprobación.

## Evidencia

- Build y lint de backend/frontend correctos.
- Regresión general: 380 pruebas backend y 37 frontend, sin fallos ni omitidas. Seis suites de navegador aprobadas: paginación de transacciones, filtros de moneda, revisión, liquidación de pendientes, vuelto/cambio y versión de edición.
- Verificación adicional tras incorporar el caso concurrente: 26 pruebas aprobadas en auth-session-boundary, identity-security y restricted-database-role; ninguna omitida. No sumar estas 26 al total general: hay pruebas repetidas.
- Matriz HTTP real de Nest: ocho manejadores y 75 casos, con servicio/validación de token simulados. Incluye acceso público, tres roles operativos, perfil desconocido, contraseña obligatoria, sesión revocada, versión ausente y entradas adicionales.
- SQL local real: foto válida, rechazo por versión/estado/rol/cambio obligatorio, auditoría fallida sin efectos, cierre permitido con contraseña obligatoria y rechazo del segundo cierre antiguo. Casos transaccionales repetidos bajo rol SQL restringido.
- Dos conexiones PostgreSQL comprueban que una revocación confirmada mientras la autorización espera el bloqueo impide tanto foto como cierre. Se observa la espera de bloqueo real y se comprueba que no haya foto, incremento adicional ni auditoría. Este caso usa el usuario local de pruebas, no el rol SQL restringido, y elimina únicamente su usuario sintético; las demás pruebas SQL revierten sus datos.
- Registros locales privados: tmp/transaction-table-*.log y tmp/security-auth-session-directed.log.

## Límites

La consulta de sesión revalida en el momento de la lectura; no garantiza que una sesión no sea revocada después de responder. El bloqueo global sigue el patrón de identidad existente; no acredita capacidad bajo carga. Este bloque no incluye decodificación de imágenes, cambios de MFA, retención/centralización de auditoría ni pruebas de infraestructura o CA en Render. La matriz general de seguridad continúa abierta. No se realizaron movimientos ni pruebas financieras en producción.

Entorno local reiniciado con datos conservados: API y web HTTP 200; rechazo HTTP 400 del parámetro adicional en ingreso confirmado contra la API local actualizada. Correo de desarrollo deshabilitado.
