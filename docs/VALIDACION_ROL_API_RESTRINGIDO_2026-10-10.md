# Piloto de rol API restringido - 2026-10-10

Estado: exclusivamente preview. No se creo usuario remoto, no se cambio
DATABASE_URL ni se modificaron permisos o credenciales productivas.

## Implementado y comprobado

El piloto crea un rol PostgreSQL temporal NOLOGIN, NOSUPERUSER, NOCREATEDB,
NOCREATEROLE, NOINHERIT, NOREPLICATION y NOBYPASSRLS. Recibe USAGE de esquemas
necesarios, SELECT/INSERT/UPDATE/DELETE de tablas actuales de temo y USAGE/SELECT
de secuencias. Se retiran UPDATE/DELETE/TRUNCATE de bitacora. No se otorga
CREATE, propiedad, TRIGGER, TRUNCATE ni permisos sobre registros de migraciones.

Se utiliza SET LOCAL ROLE dentro de una transaccion exterior que termina en
ROLLBACK; el rol, grants y fixtures desaparecen. No se conecta con credenciales
administrativas nuevas ni se deja ese rol activo en la API de preview.

Diagnostico READ ONLY ampliado con capacidades efectivas de TRUNCATE y TRIGGER,
mutacion de bitacora y registros de migraciones y funciones SECURITY DEFINER
ejecutables en temo/public/extensions. Estas ultimas son una senal de revision,
no prueba automatica de explotabilidad. No se listan cuerpos de funciones,
registros, contrasenas ni claves en el resultado.

## Evidencia

- Build/lint backend correctos.127/127 pruebas backend con preview, sin omisiones.
- Suite financiera completa ejecutada bajo rol restringido:17escenarios y su
  contenedor, incluyendo pendientes USD/NIO, tasas, anulaciones, turnos cerrados,
  saldos/arqueos, transferencias y rechazos por alcance.
- PostgreSQL rechaza CREATE/ALTER/DROP de objetos TEMO, TRUNCATE, creacion de
  trigger y rol, UPDATE/DELETE de bitacora y UPDATE del registro de migraciones.
- Login de cajero, cambio de clave, revocacion y auditoria append-only funcionan.
- Administrador: enrolamiento MFA real local, validacion OTP, token completo,
  recuperacion con transporte simulado y nuevo login que sigue exigiendo MFA.
  Se verifica que recuperar clave invalida sesion anterior sin desactivar MFA.
- Se comprueba ausencia del rol de prueba despues del rollback.
- Frontend21/21 correcto; sin cambios de interfaz.

Comando para repetir el piloto y la regresion financiera, tras compilar:

```text
TEMO_TEST_PREVIEW=1 TEMO_TEST_RESTRICTED_ROLE=1 node --test backend/tests/*.test.cjs
```

La sintaxis de variables depende del shell; en PowerShell usar variables de
proceso o spawn con env, nunca poner credenciales en argumentos.

## Limites

- Es una prueba bajo SET ROLE desde el cluster local, no una conexion LOGIN
  real con autenticacion/red/TLS/Supabase. Compatibilidad de pooler pendiente.
- SELECT/INSERT/UPDATE/DELETE sobre tablas actuales es un perfil operativo
  preliminar, no una matriz definitiva minima por tabla/columna. Si se roba la
  credencial de API, sigue pudiendo leer/modificar registros autorizados a ella;
  el aislamiento por cajero/sucursal sigue dependiendo del servidor TEMO.
- Se conservan grants PUBLIC existentes de funciones/tipos. Auditar esos grants,
  funciones con propietario privilegiado, membresias y RLS antes de publicar.
- Append-only de bitacora limita ese rol, no al propietario/superusuario ni a
  copias externas. No es almacenamiento inmutable ni elimina manipulacion por
  un administrador de infraestructura comprometido.
- Grants de tablas/secuencias actuales no cubren objetos futuros. Cada migracion
  necesitara revision/grants explicitos y pruebas; no se otorgaron privilegios
  por defecto indiscriminados ni se permitio a la API ejecutar migraciones.

## Siguiente puerta para produccion

1. Revisar privilegios actuales de solo lectura y preparar mapa explicito de
   tablas, secuencias, tipos y funciones requeridos por API/migraciones.
2. Respaldar y conservar acceso de emergencia de propietario fuera de la API.
3. Provisionar credencial dedicada privada con autorizacion, sin conceder
   membresia en rol propietario/administrativo. Probar conexion LOGIN real y
   endpoint/pooler TLS antes de modificar Render.
4. Ejecutar regresion en entorno aislado, publicar configuracion coordinada,
   verificar MFA/recuperacion/operacion y retirar credencial administrativa de
   la API. No revocar acceso anterior antes de comprobar la nueva configuracion.

La separacion efectiva API/migraciones permanece pendiente hasta completar esa
puerta. Este bloque no publica codigo ni cambia infraestructura.
