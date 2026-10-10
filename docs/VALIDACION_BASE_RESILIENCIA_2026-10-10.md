# Conexion, privilegios y resiliencia - 2026-10-10

Estado: solo desarrollo; sin cambios de permisos, roles, configuracion o datos
de produccion. No se publico el paquete.

## Implementado

- Configuracion compartida y validada: URL PostgreSQL sin query/fragmentos,
  TLS remoto obligatorio y rejectUnauthorized=true. Los parametros de URL no
  pueden sustituir CA, search_path o limites de recursos. Sin TLS local se usa
  false explicito, no una configuracion heredada del entorno del driver.
- Una sola fuente CA; rechazo de fuente ausente/invalida sin exponer rutas o
  credenciales en el error. Sin CA personalizada se usa confianza del sistema.
  Validacion PEM inicial, no prueba de cadena/remoto: la conexion TLS decide.
- Defaults: maximo10conexiones, espera de conexion/adquisicion10s, statement60s,
  espera de bloqueo10s, transaccion inactiva60s. Rangos acotados configurables,
  sin permitir0 ni valores no enteros. Limite absoluto20conexiones por instancia.
- Manejo de error de conexiones inactivas y transaccionales sin detalles privados.
  Rollback fallido conserva error original y descarta conexion; release siempre
  se ejecuta. No hay reintentos automaticos de escrituras/COMMIT.
- CLI de comprobacion de privilegios mediante transaccion READ ONLY, agregados
  y flags, sin leer registros TEMO. Detecta capacidades administrativas, membresias,
  propiedad de objetos, CREATE y acceso de anon/authenticated al esquema temo.
- Script de restauracion: limite de directorio con separador, archivo .dump,
  checksum con formato validado, carpeta unica, puerto libre y PID propio antes
  de restaurar; errores de preparacion/consulta final comprobados. Limpieza solo
  dentro de tmp y del cluster creado por esta ejecucion, ya detenido.

## Uso de la comprobacion de privilegios

Compilar backend y ejecutar:

```text
node scripts/check-database-privileges.mjs --preview
```

Modo --configured-readonly usa exclusivamente variables del proceso; no carga
archivos privados automaticamente ni acepta URL/clave como argumento. No se
ejecuto contra produccion en esta entrega. Salida0: sin senales de exceso bajo
estos criterios;1: senales encontradas;2: fallo de configuracion/conexion.

Preview detecta correctamente usuario administrativo y69objetos propios. Es
esperado para el cluster de pruebas, no evidencia de permisos productivos.
La herramienta no revoca permisos ni certifica privilegios minimos: faltan
grants por tabla/secuencia/funcion, SECURITY DEFINER, RLS y compatibilidad real.

## Verificacion

- Backend122/122 con preview y frontend21/21; build/lint backend correctos.
- Ocho pruebas nuevas: configuracion/TLS, parametros/limites invalidos,
  rollback, screening de privilegios, cancelacion/bloqueos, pool saturado,
  transaccion abandonada y desconexion de cliente inactivo.
- PostgreSQL real: statement_timeout cancela consulta y revierte DDL de fixture;
  lock_timeout vence; pool de1conexion rechaza espera excedida y se recupera;
  transaccion inactiva se termina sin caida del proceso y conexion es descartada.
- Se termina solo un backend de prueba identificado por su PID, no servidor ni
  conexiones de negocio; consulta posterior funciona. Pruebas locales aisladas.
- PowerShell: sintaxis y rechazo de README.md fuera de backups verificados.
  No se ejecuto una restauracion completa; RPO/RTO y respaldos reales pendientes.

## Puertas antes de publicar y limites

- Revisar DATABASE_URL real sin revelar credenciales: retirar parametros y
  trasladar TLS a DATABASE_SSL/CA. Un valor incompatible ahora impide arrancar;
  no asumir que configuracion remota ya es compatible.
- Probar TLS y limites contra endpoint/pooler usado realmente en Render, incluida
  compatibilidad de startup parameters. Defaults deben medirse con carga real.
- Estos son limites por sentencia y espera, no deadline total de transaccion
  ni limite global de cola/memoria. No resuelven DDoS distribuido.
- Si se pierde la respuesta de COMMIT, el resultado puede ser incierto. No
  afirmar que toda desconexion revierte lo guardado; conciliar antes de repetir.
  Idempotencia financiera sigue pendiente.
- SHA256 verifica integridad accidental, no cifrado ni autenticidad del backup.
  Proteger permisos locales, copia independiente y claves MFA separadas.
- Separacion efectiva API/migraciones, restauracion completa, restricciones de
  red, alertas y simulacro de incidente no completados por este bloque.

Referencias oficiales:
https://node-postgres.com/features/ssl
https://node-postgres.com/apis/pool
https://node-postgres.com/apis/client
