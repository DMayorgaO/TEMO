# Preparacion del despliegue de seguridad

Fecha: 2026-10-07. Usuario autoriza MFA y el paquete restante de seguridad.

## Completado

- Actualizaciones compatibles mediante npm audit fix, sin --force. npm audit: cero vulnerabilidades reportadas; no equivale a ausencia absoluta de vulnerabilidades.
- Build de backend/frontend y lint correctos. 34 pruebas backend y 8 frontend aprobadas, incluyendo la comprobacion nueva de arranque de produccion.
- Respaldo previo de produccion: backups/production/temo-production-20261007-164734.dump.
- SHA-256: 7c98a9384d108006b3d2ac6e99692ba448989a5a3d4717a9489754d731c5d7a3.
- pg_restore --list lee 482 entradas. Se verifico legibilidad, no se hizo un simulacro completo de restauracion.
- Migracion 039_administrator_mfa.sql aplicada a produccion con el runner existente, TLS verificado y configuracion .env.production. Las 38 anteriores fueron omitidas tras verificar sus hashes.
- Resultado del runner: 39 migraciones registradas; tres tablas nuevas para MFA. No se modificaron registros financieros.
- API nueva se niega a iniciar en APP_ENV=production si falta MFA_ENCRYPTION_KEY o las tablas MFA; evita activar una API que deje bloqueados los inicios administrativos por configuracion incompleta.

## Pendiente antes del push

- Iniciar sesion en Render: el navegador integrado muestra dashboard.render.com/login. No hay token Render disponible en las variables del entorno.
- Configurar MFA_ENCRYPTION_KEY en temo-api: 32 bytes aleatorios en base64, independientes de AUTH_SECRET, persistentes y con respaldo protegido. No copiar la clave demo ni publicarla en Git/chat.
- Verificar que el secreto se mantenga entre despliegues; no reemplazarlo despues de que existan cuentas vinculadas sin un procedimiento de recifrado.
- Publicar el commit aprobado y verificar revision API, web, CSP efectiva, CORS y respuestas privadas sin cache.
- El Administrador debe completar su propio enrolamiento de produccion. No reutilizar QR ni codigos de recuperacion del entorno demo.

## Estado actual

No se publico el nuevo codigo mientras falte el secreto de Render. La autorizacion de despliegue sigue vigente; queda pendiente acceso al panel. La migracion es aditiva y compatible con la API anterior.
No se desactivo MFA ni se derivo su clave de AUTH_SECRET para evitar la configuracion pendiente.
No restaurar el respaldo sobre movimientos nuevos para revertir codigo. La reversion de codigo posterior a la activacion de MFA necesita revisar la exigencia de segundo factor, porque una version anterior no la implementa.
