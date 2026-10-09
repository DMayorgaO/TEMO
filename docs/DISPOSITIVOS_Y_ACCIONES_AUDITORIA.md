# Dispositivos y acciones de auditoria

## Estado en desarrollo

Migracion 040 asigna un numero persistente a cada evento: AUD-0001. UUID permanece como clave interna. Los numeros pueden tener saltos por rollbacks; no se reutilizan. Fecha y hora se muestran en dos lineas, zona America/Managua. Registro es el UUID del elemento afectado en Entidad, no el ID del equipo.

Se muestran agente de navegador limitado a 300 caracteres y tipo estimado a partir de ese agente cuando ya fue capturado. No es evidencia de identidad: el cliente puede falsificarlo. Registros sin agente no permiten reconstruir el dispositivo. IP corresponde a la direccion observada por la API, no necesariamente a una IP privada individual; verificar proxy antes de considerarla confiable.

Build y lint correctos, pruebas de catalogos 9/9. Migracion aplicada solo a preview. Pendiente despliegue y verificacion visual manual.

## Acciones generales del enum actual

- CREAR: alta de registro.
- ACTUALIZAR: modificacion; tambien agrupa eventos especificos de autenticacion.
- ANULAR: anulacion de registro.
- CORREGIR: correccion operativa.
- APROBAR: aprobacion.
- RECHAZAR: rechazo.
- INICIAR_SESION: acceso completado; Administrador despues de MFA.
- CERRAR_SESION: cierre solicitado al servidor, no cierre de pestana necesariamente.
- IMPORTAR: importacion.

Existir en el enum no garantiza que todos los servicios emitan esa accion. Eventos especificos en datos_nuevos.evento: MFA_ACTIVADO, MFA_VERIFICADO, MFA_FALLIDO, MFA_RECUPERACION, SOLICITUD_RECUPERACION, RECUPERAR_CONTRASENA, CAMBIO_CONTRASENA, CAMBIO_FOTO_PERFIL y RESTABLECER_CONTRASENA. No se expone el JSON de esos eventos en el listado actual.

## Proxima etapa: autorizacion de equipos

No implementada ni activa. No autorizar mediante IP, MAC, user-agent o identificador copiable de localStorage.

1. Inventario administrativo con alias, sucursal, responsable y estado pendiente/autorizado/revocado; datos descriptivos no prueban identidad.
2. Elegir credencial criptografica de dispositivo: certificados en equipos administrados/Zero Trust para equipos fisicos; WebAuthn requiere evaluar sincronizacion y recuperacion, ya que una passkey sincronizada no identifica un solo equipo fisico.
3. Equipo nuevo solicita alta sin poder consultar registros; Administrador con MFA verifica al responsable por canal independiente, autoriza y queda trazabilidad.
4. Validacion en API para cada sesion, no solo ocultar pantallas; bloquear tambien acceso directo por onrender.com.
5. Revocacion invalida sesiones, procedimiento de equipo perdido, emergencia auditada para no bloquear al unico Administrador.
6. Piloto en desarrollo y en distintas sucursales, pruebas de copia de identificadores y credenciales revocadas. App movil utilizara claves protegidas por el sistema operativo.

Antes del bloqueo obligatorio confirmar dominio, mecanismo de identidad, equipos existentes y responsables de aprobacion. No introducir un bloqueo basado solo en informacion declarada por navegador.
