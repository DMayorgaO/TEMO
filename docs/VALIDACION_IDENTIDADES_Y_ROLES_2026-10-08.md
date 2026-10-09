# Identidades, permisos y sesiones

Fecha: 2026-10-08. Entorno: desarrollo aislado. No publicado en produccion.

## Protecciones implementadas

- Cambios de rol, estado, usuario o contrasena invalidan las sesiones anteriores mediante version_sesion. Reactivar o devolver el rol anterior no revive tokens viejos. La revocacion se aplica a partir de la siguiente validacion de la API; no cancela peticiones ya autorizadas en curso.
- Boton con icono Cerrar sesiones en Usuarios, exclusivo de Administrador: confirmacion, revocacion global del usuario y auditoria. No modifica su contrasena. Incluye cierre propio si se confirma.
- Administracion de identidades revalida al actor dentro de la transaccion, bajo bloqueo asesor compartido con cambios y recuperacion de contrasena. Evita ejecutar cambios administrativos con una version de sesion que ya cambio.
- No se permite que un Administrador se desactive o quite su propio rol, ni retirar el ultimo Administrador activo. Los codigos internos JEFA, CAJERO y TRANSFERISTA no pueden cambiar ni desactivarse; JEFA sigue siendo el identificador interno, no una etiqueta visible.
- Roles sin politica operativa conocida no reciben acceso operativo por defecto. Pueden consultar su propia identidad, cambiar su clave y cerrar sesion. Debe revisarse su existencia antes de publicar.
- Usuarios y roles guardan cambios antes/despues permitidos, identidad del actor, IP valida y agente de navegador acotado. Si falla esa auditoria, la modificacion se revierte en la misma transaccion. No se almacenan claves, hashes de contrasena, OTP ni semillas MFA en estos snapshots.
- Edicion de usuarios existentes no muestra campo de contrasena. La API conserva compatibilidad para asignar clave temporal a un cajero, pero bloquea esa via para Administrador y otros perfiles; el restablecimiento dedicado sigue siendo exclusivo de cajeros.
- Claves temporales generadas con Web Crypto: 16 caracteres aleatorios base32, 80 bits de aleatoriedad, agrupados para lectura; sin Math.random. Requieren cambio al iniciar sesion.
- El cambio obligatorio de clave permite unicamente los metodos y rutas exactos de consulta propia, cambio de clave y cierre de sesion. Rechaza cabeceras Bearer ambiguas.
- El cambio de clave comprueba version y rol actual antes de emitir una nueva sesion. Un cambio concurrente de privilegios no permite obtener una sesion administrativa sin el factor correspondiente.
- Migracion 043: unicidad de usuario y correo sin distinguir mayusculas, consistente con el login y recuperacion. Rechaza duplicados existentes sin eliminar ni fusionar datos. La API tambien los detecta antes de guardar.
- Recuperacion de clave no elige arbitrariamente una cuenta si un identificador coincide con usuario y correo de personas diferentes. Revalida Administrador activo, conserva intentos fallidos, consume el codigo una sola vez e incrementa version de sesion. No desactiva MFA ni devuelve una sesion completa. Logs de error de envio no incluyen stack del proveedor.

## Validacion ejecutada

Desde la raiz del proyecto:

```powershell
npm run build
npm run lint
$env:TEMO_TEST_PREVIEW='1'
node --test --test-concurrency=1 backend/tests/*.test.cjs
node --test frontend/tests/*.test.mjs
node scripts/check-security-readiness.mjs
npm audit
npm audit --omit=dev
```

- Backend: 79/79, sin pruebas omitidas. Incluye HTTP real con MFA de cuenta desechable, cajero rechazado, cierre propio por API y token revocado, ciclo de roles/estados, recuperacion, duplicados rechazados por API y restriccion real de base de datos, auditoria atomica y regresion financiera.
- Frontend: 14/14, incluyendo generacion de claves temporales y protecciones de exportacion.
- Build y lint correctos. Auditorias de dependencias completas y de produccion: 0 vulnerabilidades conocidas en la consulta de esta fecha; no implica ausencia de vulnerabilidades desconocidas.
- Preflight local de solo lectura: 0 grupos duplicados de usuarios/correos, 2 Administradores activos, 3 roles esenciales activos, 0 usuarios activos con rol no soportado, indices y migraciones 040-043 presentes.
- Datos de pruebas de identidades/finanzas se revierten; prueba HTTP utiliza Administrador desechable y lo elimina. No se consulta ni modifica Render o Supabase de produccion.

## Limites y verificaciones pendientes

- Pendiente recorrido visual de Usuarios con Administrador y MFA normal: confirmacion, cancelar, cerrar sesiones de cuenta de prueba, mensajes y antes/despues en Auditoria. No se ha utilizado ni reiniciado el OTP privado del Administrador para automatizarlo.
- El preflight local no acredita el estado de produccion. Deben revisarse duplicados, roles, administradores y configuracion reales antes de migrar.
- Revocacion global por usuario, no inventario ni cierre individual por dispositivo. No es una autorizacion criptografica de equipos.
- No hay nuevo reto OTP obligatorio para cada cambio administrativo. Una sesion administrativa robada conserva riesgo mientras sea valida; evaluar reautenticacion de operaciones sensibles.
- Bloqueo asesor coordina las rutas de identidad cubiertas, no modificaciones SQL realizadas fuera de la API. No se realizo una prueba de carga de concurrencia masiva.
- Recuperacion por correo personalizado sigue pendiente de dominio y proveedor configurado; las pruebas de codigo no acreditan entregabilidad de correo.
- No sustituye privilegios minimos de base de datos, Zero Trust, monitoreo externo, respaldo recuperable o prueba independiente de penetracion.

Preparacion del paquete: [PREPARACION_PAQUETE_SEGURIDAD_2026-10-08.md](PREPARACION_PAQUETE_SEGURIDAD_2026-10-08.md).
