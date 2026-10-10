# Validacion de entradas de autenticacion

Fecha:2026-10-10, America/Managua. Implementado y comprobado solo en desarrollo.

## Superficie protegida

Login, solicitud/confirmacion de recuperacion, verificacion MFA, cambio de contrasena y foto de perfil utilizan esquemas Zod estrictos antes de invocar servicios. Se utiliza la dependencia existente; sin migraciones ni cambios de claves.

- Rechaza cuerpos nulos, listas, cadenas en lugar de objetos, campos ausentes y campos no declarados.
- Rechaza conversion implicita de objetos, listas o numeros a credenciales. Ya no se aplica String a los valores del cuerpo.
- Usuario/identificador:cadena no vacia, maximo254caracteres antes de recortar extremos. Contrasenas:maximo128caracteres conforme al limite previo de creacion; nuevas:minimo10 y politica de complejidad existente en servicio.
- No se recortan ni transforman contrasenas; se preservan espacios legitimos. Se rechazan bytes nulos en identificadores/contrasenas, incompatibles con valores text de PostgreSQL.
- Codigos OTP y recuperacion por correo:seis digitos como cadena, conservando ceros iniciales.
- MFA:challenge base64url de43caracteres; exactamente uno entre OTP o codigo de recuperacion, con formato de24hexadecimal sin separadores o cuatro grupos de6 con guiones. Formatos de la aplicacion vigente preservados; ambos factores simultaneos se rechazan por ambiguedad.
- Foto de perfil:cadena con maximo200000caracteres; formato/tipo de imagen siguen validados por el servicio, igual que antes.
- Errores400 con mensaje generico de formato, sin datos introducidos ni detalles crudos de Zod. Filtro existente mantiene referencia y no-store.

## Evidencia

- Cinco pruebas nuevas de controladores:tipos/cuerpos/propiedades no permitidos, tamanos, bytes nulos, preservacion de valores validos y MFA no ambiguo. Acreditan rechazo antes del servicio, sin consultas ni envio de correos.
- Integracion HTTP ampliada en API temporal local:login, recuperacion y MFA malformados devuelven400/no-store/referencia sin reflejar credenciales de prueba. Login Cajero y Administrador/MFA validos siguen funcionando.
- Backend97/97 pruebas con preview; frontend21/21. Build y lint backend correctos; regresion financiera, permisos, recuperacion y MFA incluidos.
- API de preview reiniciada con el codigo nuevo y comprobacion HTTP adicional de login/MFA400 correcta. Frontend disponible en http://127.0.0.1:3187. Sesiones locales previas requieren login al regenerarse la clave temporal del preview; claves/enrolamientos productivos intactos.
- Sin conexiones, cambios, envios reales ni despliegues en produccion en esta entrega.

## Limites

- Validar entradas no sustituye autorizacion, limites de abuso, consultas parametrizadas ni MFA. Los rechazos de formato no validan codigos ni otorgan acceso; los intentos con formato correcto siguen sujetos a controles persistentes existentes.
- Compatibilidad de longitud en bytes revisada en un bloque posterior del mismo dia: nuevas claves limitadas a72bytes UTF-8 en servicios de almacenamiento, sin migrar hashes ni cambiar la verificacion de login. Ver VALIDACION_POLITICA_CONTRASENAS_2026-10-10.md.
- No se amplian permisos de recuperacion a cajeros ni se implementa aprobacion de dispositivos en este bloque.
- Pendientes del paquete:autorizacion de despliegue, comprobacion efectiva de URL/CSP en Render, recuperacion real con el titular y logs de Supabase durante operaciones.
