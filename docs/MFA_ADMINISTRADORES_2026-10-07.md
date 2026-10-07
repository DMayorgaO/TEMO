# MFA para Administradores

Estado actualizado: login en dos pasos implementado y activo SOLO en desarrollo. No desplegado. Evidencia y preparacion de despliegue: `VALIDACION_MFA_LOGIN_2026-10-07.md`.

## Aplicaciones

Recomendacion: TOTP estandar, sin depender de una marca. 2FAS Auth como opcion preferida por sus mecanismos de respaldo; Google Authenticator como alternativa sencilla. Instalar desde enlaces oficiales y proteger telefono y copias.

VIP Access documenta agregar credenciales externas por QR. Probar en el telefono/version concreto con una credencial TEMO independiente; nunca reutilizar el codigo, Credential ID ni secreto del banco. No integrar el servicio empresarial VIP ni asumir que el banco autoriza compartir su credencial.

Fuentes revisadas 2026-10-07:
- https://knowledge.broadcom.com/external/article/164598/how-to-add-and-activate-a-symantec-vip-t.html
- https://2fas.com/support/2fas-auth-security-privacy/is-2fas-backup-safe/
- https://support.google.com/accounts/answer/1066447

## Primera pieza implementada

MfaSecretVault: AES-256-GCM, nonce aleatorio de 12 bytes, etiqueta de autenticidad y contexto ligado al usuario/version. Clave independiente de 32 bytes, rechazada si invalida; no usar AUTH_SECRET ni guardar la clave junto al secreto cifrado.
Es un componente aislado: no guarda secretos actuales ni exige variables nuevas al iniciar la API. Integrarlo solo junto al flujo completo.
Compilacion y lint backend correctos. 25 pruebas backend aprobadas, incluyendo alteracion, usuario incorrecto, clave incorrecta y formatos invalidos.

## Plan original (estado actualizado en la validacion)

1. Migracion y gestion protegida de clave MFA separada; respaldo y rotacion con procedimiento.
2. Alta con contrasena actual, secreto temporal con vencimiento, QR local y confirmacion TOTP antes de activar.
3. Login en dos etapas: desafio temporal limitado, sin token completo antes del OTP. Rechazo de reutilizacion atomico y limite de intentos persistente.
4. Codigos de recuperacion aleatorios de un uso, almacenados como hash, mostrados una vez y guardados fuera del telefono.
5. Auditar alta, fallos, recuperacion y desactivacion sin secretos, QR ni OTP en registros.
6. Piloto Administrador en desarrollo: codigo incorrecto/vencido/reutilizado, concurrencia, reinicio API, cambio de telefono y recuperacion. Luego obligatoriedad para todos los Administradores con despliegue autorizado.

No introducir saltos automaticos por navegador confiable ni desactivar MFA al recuperar contrasena. TOTP no elimina phishing ni robo de sesiones. Cajeros sin cambios en esta etapa. No depende de comprar dominio; correo personalizado conserva su dependencia del dominio.
