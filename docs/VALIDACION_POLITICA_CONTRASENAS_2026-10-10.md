# Politica de contrasenas - 2026-10-10

Estado: implementado y probado solo en desarrollo. No publicado.

## Cambio

Se centraliza la validacion previa al almacenamiento de claves nuevas en
backend/src/common/password-policy.ts. Se aplica al cambio propio, recuperacion,
alta/edicion de usuarios y restablecimiento temporal autorizado.

- Minimo 10 caracteres, mayuscula, minuscula y numero; politica existente conservada.
- Maximo 72 bytes UTF-8, compatible con pgcrypto bf. No se recortan claves para
  hacerlas caber en ese limite; se devuelve un error 400 explicativo.
- Rechazo de bytes nulos y tipos invalidos; mensajes sin reproducir la clave.
- Se conservan hashes, costo bf 12, verificacion de login y MFA existentes.
- El limite de entrada de login sigue siendo 128 caracteres para no aplicar
  retroactivamente la nueva regla de almacenamiento a las claves existentes.

Referencia: https://www.postgresql.org/docs/16/pgcrypto.html

## Evidencia

- Build y lint backend correctos.
- Backend: 102/102 pruebas con base aislada de preview, sin omisiones.
- Frontend: 21/21 pruebas correctas.
- Casos nuevos: fronteras ASCII/UTF-8 72 y 73 bytes, acentos, emoji, complejidad,
  NUL, rechazo previo a consultas en cambio/recuperacion/reset y conservacion
  del candidato completo al verificar login.
- SQL local de solo lectura verifica hash/crypt con 72 bytes ASCII y UTF-8,
  espacios y rechazo de una clave alterada. Sin datos de produccion.
- Regresiones financieras, ciclo MFA y recuperacion real simulada aprobados.

## Limites y pendientes

No cambia el algoritmo de hash ni sustituye MFA, controles de abuso o una
auditoria independiente. La modernizacion futura del hash necesita un plan de
migracion compatible. Los formularios de catalogos conservan su tratamiento
previo de espacios extremos; este bloque no redefine esa conducta.

Antes de publicar el paquete acumulado: respaldo, revision de configuracion,
prueba manual de recuperacion por correo y autorizacion de despliegue.
