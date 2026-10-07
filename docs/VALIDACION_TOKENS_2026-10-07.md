# Validacion de tokens de acceso

Implementado el 2026-10-07 solo en desarrollo; sin migraciones ni despliegue.

## Control agregado

El verificador exige exactamente tres segmentos base64url y limita el token a 4096 caracteres. Exige cabecera HS256/JWT y conserva la comparacion de firma en tiempo constante.
Valida identidad UUID, nombre de usuario no vacio, version entera no negativa y tiempos enteros seguros. Rechaza tokens vencidos, emitidos mas de 30 segundos en el futuro o con duracion superior a 24 horas.
Los tokens invalidos se rechazan antes de consultar usuarios. Los validos siguen comprobando usuario/rol activos y version actual de sesion en la base.
La emision habitual de sesiones no cambia ni exige nuevas credenciales al usuario.

## Evidencia

Compilacion backend correcta. 23 pruebas backend aprobadas, incluyendo tokens manipulados, segmentos adicionales, algoritmo incorrecto, campos ausentes o mal tipados, vencimiento y version revocada. Integracion HTTP con login real y regresion financiera local correctas.
El usuario confirma exportaciones PDF y PNG sin inconvenientes con Administrador de prueba en esta fecha.

## Alcance pendiente

No es MFA ni proteccion contra el robo de un token vigente. Sigue pendiente evaluar almacenamiento HttpOnly/CSRF, sesiones individuales revocables y TOTP segun el plan.
No se modifican limites de operaciones ni se consulta produccion. Foto de perfil y cabeceras finales del hosting pendientes de validacion antes del despliegue.
