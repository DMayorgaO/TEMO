# Respuesta y recuperacion de TEMO

Estado: procedimiento propuesto; responsables y objetivos pendientes de
aprobacion. No equivale a simulacro realizado ni a garantia de recuperacion.

## Ante sospecha de acceso o extraccion no autorizada

1. Administradora designa responsable tecnico y registra hora Nicaragua/UTC,
   alcance observado y decisiones. No compartir registros financieros, claves,
   codigos MFA ni tokens en chats o capturas publicas.
2. Preservar auditoria TEMO y logs de Render/Supabase/Cloudflare antes de que
   venza su retencion. Guardar evidencia con acceso restringido; no borrar
   eventos ni modificar registros para ocultar el incidente.
3. Identificar cuentas/sesiones afectadas y cerrar sesiones o desactivar cuentas
   desde controles autorizados. Revocar el equipo/proxy si esa capa ya existe;
   actualmente su autorizacion centralizada sigue pendiente.
4. Si se sospecha filtracion de secretos de infraestructura, rotar solo los
   afectados mediante cambio coordinado, confirmar conectividad y revocar los
   anteriores. La clave de cifrado MFA requiere procedimiento de migracion:
   cambiarla sin preservar acceso a secretos puede bloquear administradores.
5. Revisar accesos, consultas, exportaciones, permisos y cambios antes/despues.
   No hay alertas completas ni captura de toda posible copia manual; documentar
   lo que no pueda determinarse. Escalar a revision independiente si corresponde.
6. Corregir causa, verificar permisos y operaciones en entorno aislado; autorizar
   reapertura y monitorear. No restaurar un backup por defecto si solo hubo lectura:
   restaurar no recupera confidencialidad ni elimina secretos robados.

## Ante caida o resultado incierto de una operacion

1. No repetir automaticamente una escritura con respuesta perdida. Consultar
   registro/turno/auditoria para conciliar y evitar duplicados.
2. Diferenciar API, base, DNS, conectividad y cuota/costos. Conservar evidencia
   minima sin revelar cadenas de conexion. Pausar cambios de infraestructura
   no relacionados mientras se determina la causa.
3. Si se requiere recuperar datos, detener escrituras de forma coordinada y
   preservar estado actual. Seleccionar backup anterior al incidente y verificar
   integridad, fecha, alcance y claves necesarias.
4. Restaurar primero en entorno aislado sin apuntar web/API productivas. Comprobar
   esquema, conteos, relaciones, saldos/arqueos/transacciones, MFA y permisos.
5. Medir perdida de datos y tiempo real; aprobar conciliacion de movimientos
   posteriores al backup y cambio de conexion. Respaldo de esquema temo no
   incluye automaticamente secretos de proveedores ni todos sus servicios.
6. Publicar solo con autorizacion, comprobar operaciones y dejar bitacora del
   incidente y tareas preventivas. Mantener posibilidad de retorno controlado.

## Preparacion pendiente

- Nombrar responsables/contactos privados y acceso de emergencia probado.
- Acordar RPO y RTO con Administradora; no prometer valores sin simulacro.
- Copia independiente cifrada, control de acceso/retencion y verificacion regular.
- Preservar clave MFA fuera del backup de datos, con acceso de emergencia
  controlado; no incluirla en este documento ni en Git.
- Ensayo de restauracion completo y simulacro de cuenta comprometida.
- Verificar MFA de proveedores, alertas de accesos/consumo y procedimiento de
  baja de empleados. La lista de privilegios del CLI es solo una primera puerta.
