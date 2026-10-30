# Exportaciones: identidad vigente y auditoria atomica

Fecha: 2026-10-29. Solo desarrollo, sin migracion nueva ni despliegue productivo.

## Alcance

- Exportaciones autorizadas de catalogos administrativos, Transacciones y Turnos, y PNG del Panel General.
- Antes de devolver el conjunto autorizado, una sentencia SQL verifica usuario activo, rol activo y real, version exacta de sesion y ausencia de cambio obligatorio de contrasena. La identidad/rol se bloquean en modo compartido y se inserta la auditoria en esa misma sentencia.
- Si la sesion cambio mientras se consultaban las filas, la sentencia no inserta ningun evento de exito y se devuelve 403 en lugar del conjunto. Un error de almacenamiento tampoco permite entregar los datos.
- La version de sesion es obligatoria, entera y compatible con integer SQL. No hay camino de compatibilidad que omita esa comprobacion. Las sesiones autenticadas normales ya incluyen ese dato; no cambia el cuerpo que envia el navegador.
- Se mantiene la politica existente: Administrador para apartados administrativos y PNG; Cajero para Transacciones/Turnos propios; Transferista sin exportacion. Seleccion y alcance de filas siguen en las consultas existentes, sin aceptar conjuntos enviados por el cliente.
- Solo se agregan metadatos permitidos (apartado, formato y cantidad) a la bitacora; no cuerpos, cuentas, claves, codigos MFA ni contenido de filas.

## Registro de solicitudes

- La ruta de auditoria declarativa usa la misma comprobacion atomica para eventos nuevos. Conserva la diferencia entre filas declaradas por el navegador y filas verificadas por el servidor.
- La agrupacion local de avisos repetidos solo se marca despues de guardar la auditoria. Un fallo ya no deja una marca que haga aparecer el siguiente intento como agrupado sin haber registrado ninguno.
- Si el mapa alcanza 1000 entradas, las solicitudes nuevas siguen auditandose sin anadir mas claves. No se pierde un aviso por saturacion de esa estructura.
- La agrupacion es una optimizacion local de metadatos, no autorizacion de descarga ni recibo idempotente distribuido. Avisos simultaneos pueden producir mas de un evento; el dataset autorizado se comprueba en cada llamada y no usa ese mapa.

## Validacion

- Pruebas SQL con datos sinteticos y rollback: acceso valido, suplantacion de rol, revocacion despues de leer filas, cuenta/rol inactivo, cambio obligatorio, metadatos sin contenido privado y ausencia de auditoria de exito en denegaciones.
- Regresion de exportaciones: seleccion/orden, IDs ajenos, formatos, limites, alcance de Cajero, datos permitidos y fallo cerrado. Pruebas de fallo y reintento inmediato, y de agrupacion saturada.
- Pruebas nuevas de identidad ejecutadas tambien con rol SQL restringido. No se modificaron usuarios productivos ni se usaron sus sesiones.
- Regresion: 272 pruebas backend y 34 frontend aprobadas. Build/lint correctos con Node 22.23.4; 18 pruebas focalizadas de exportaciones aprobadas, con las pruebas nuevas SQL tambien bajo rol restringido. No hay cambios visuales nuevos en este bloque.

## Limites y salida

- El control se aplica al momento de autorizar la respuesta, no puede retirar un archivo descargado ni cancelar bytes ya enviados si se revoca despues. No certifica una instantanea global del conjunto mientras cambian turnos o asociaciones; las consultas existentes siguen definiendo ese alcance.
- No incorpora permisos granulares nuevos, alertas de extraccion ni retencion centralizada; quedan pendientes del checklist. No confundir una auditoria de solicitud con prueba de descarga completada por el usuario.
- Se conserva una consulta de red para auditoria/autorizacion, sin lectura adicional separada. No se midio mejora de latencia ni capacidad en Render.
- QA manual pendiente de Excel/PDF/PNG con titulares y validacion final del paquete en desarrollo antes de autorizar publicacion. La migracion 055 acumulada sigue pendiente para el bloque financiero anterior; este refuerzo no agrega DDL.
