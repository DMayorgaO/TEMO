# Login en dos pasos para Administradores

Fecha: 2026-10-07. Solo desarrollo. Sin push ni despliegue a produccion.

Seguimiento de preparacion autorizado: migracion aplicada a produccion con respaldo previo y dependencias corregidas (npm audit 0). Codigo aun no publicado; pendiente clave en Render. Ver PREPARACION_DESPLIEGUE_SEGURIDAD_2026-10-07.md. Pruebas actuales: 34 backend, 8 frontend.

## Flujo implementado

1. Contrasena valida de Administrador: devuelve desafio aleatorio de cinco minutos, no sesion de acceso.
2. Si no tiene MFA: QR local otpauth de TEMO para agregar cuenta en VIP Access. SHA1, seis digitos, periodo de 30 segundos. No utiliza la credencial del banco ni la API empresarial VIP.
3. OTP valido: activa MFA, revoca sesiones anteriores y entrega sesion completa. Muestra ocho codigos de recuperacion una vez; requiere confirmar que se guardaron antes de continuar al panel.
4. Accesos posteriores: solicita OTP sin mostrar QR. Alternativa: codigo de recuperacion de un uso.
5. Cajeros y Operadores conservan su login habitual.

Pantallas centradas con estilos TEMO; OTP numerico, pegado compatible, botones bloqueados mientras verifica y aviso al vencer desafio. No se persisten QR, OTP, desafios ni codigos de recuperacion en almacenamiento del navegador. El token completo conserva el almacenamiento de sesion existente, aun pendiente de evaluar HttpOnly/CSRF.

## Controles

- Secreto TOTP cifrado AES-256-GCM con clave independiente y contexto ligado al usuario.
- Desafios y codigos de recuperacion guardados como hash. QR generado localmente con qrcode, validacion con OTPAuth.
- Ventana TOTP +/- un intervalo. Ultimo intervalo aceptado persistente; no acepta un codigo ya usado ni uno anterior.
- Bloqueo persistente tras cinco fallos por identidad; no se evade creando otro desafio. Alta sin MFA: cinco fallos acumulados en quince minutos. MFA activo: bloqueo de quince minutos tras cinco fallos.
- Maximo cinco desafios por minuto por identidad; limite adicional por IP del endpoint de verificacion.
- Bloqueos de fila serializan altas, OTP y consumo de recuperacion; dos solicitudes concurrentes no consumen el mismo codigo dos veces.
- Desafio ligado a version de sesion. Cambios de contrasena, logout, baja del usuario o rol inactivo invalidan acceso.
- Tokens antiguos de Administrador sin marca MFA se rechazan. No hay opcion cliente para desactivar la exigencia.
- Recuperar contrasena no elimina MFA. No se agrego ruta publica para resetear segundo factor.
- Eventos MFA_ACTIVADO, MFA_VERIFICADO, MFA_FALLIDO y MFA_RECUPERACION en bitacora, sin semillas, OTP, QR o codigos.
- Tablas dedicadas con permisos revocados a PUBLIC, anon y authenticated; no expuestas por rutas de catalogos.
- Sin clave MFA configurada, login de Administrador falla de forma cerrada (503); no entrega sesion de un factor.

## Evidencia

- Build y lint de ambos proyectos correctos.
- 33 pruebas backend y 8 frontend aprobadas, sin omisiones.
- Se decodifico realmente el PNG del QR y se verifico secreto, proveedor, periodo y digitos.
- HTTP con API aislada: desafio no permite consultar catalogos; OTP activa MFA; recuperacion concurrente permite exactamente un acceso.
- Base local con rollback: codigo incorrecto, reutilizado, desafio vencido, version revocada, recuperacion de un uso, limites persistentes y ausencia de clave.
- Regresion financiera completa sin cambios de datos de produccion.
- Navegador: admin.pruebas muestra QR; cuenta QA temporal previamente vinculada llego al panel tras OTP y cerro sesion. Cuenta QA eliminada al finalizar.
- Pantalla OTP 390x844: sin desbordamiento horizontal ni vertical. QR visible y cargado en escritorio y movil; captura de ejemplo sin secretos: tmp/mfa-login-desktop.png.
- admin.pruebas NO fue vinculada por las pruebas. El usuario puede escanear su propio QR en http://127.0.0.1:3187.

## Antes de produccion

- [ ] Comprobar escaneo, alta y segundo login con VIP Access real. No confundir QR decodificado por una biblioteca con prueba en el telefono.
- [ ] Respaldar base y aplicar database/init/039_administrator_mfa.sql antes de actualizar API.
- [ ] Generar clave criptografica de 32 bytes en base64 para MFA_ENCRYPTION_KEY; mantenerla en secreto de Render, separada de AUTH_SECRET. No copiar la de preview ni usar generateValue hex sin conversion.
- [ ] Guardar copia independiente protegida de la clave; restauracion de base sin esta clave no recupera los secretos MFA. No cambiarla arbitrariamente: rotacion requiere recifrado y procedimiento aun pendiente.
- [ ] Coordinar primera vinculacion de todos los Administradores; verificar identidad y mantener privadas las contrasenas iniciales. No compartir QR ni vincularlo a un telefono ajeno.
- [ ] Administradores guardan codigos fuera del telefono. El TXT descargado NO esta cifrado: custodiarlo fuera de carpetas compartidas, o en almacenamiento cifrado.
- [ ] Definir responsable y procedimiento supervisado/auditado de perdida de telefono Y codigos. No existe aun pantalla de restablecimiento o regeneracion de codigos.
- [ ] Revisar dependencias: npm audit actual informa cuatro entradas de produccion (incluida una critica en proxy-addr). No se ejecutaron actualizaciones automaticas amplias en este bloque. Resolver y repetir regresion antes de la siguiente entrega de seguridad.
- [ ] Verificar HTTPS, hora de API/telefono, CSP y posibilidad de recuperar operacion antes de autorizar despliegue.

Preview mantiene su clave solo en tmp/preview/mfa-key (ignorado por Git) entre reinicios. Eliminar ese archivo pierde las vinculaciones demo. No es un almacen seguro de produccion.

## Riesgos residuales

TOTP no evita phishing en tiempo real, malware del telefono ni robo de una sesion vigente. La primera vinculacion depende de quien conozca la contrasena; debe hacerse de forma supervisada con claves privadas. La informacion no tiene garantia absoluta de inaccesibilidad.
Si falla la conexion justo despues de activar MFA, no repetir esperando otro QR: volver al login con VIP Access. Si se perdio la respuesta inicial, los codigos de recuperacion no se muestran nuevamente; su regeneracion autenticada queda pendiente.
