# Ensayo de recuperacion de preview

Fecha: 2026-10-10. Solo desarrollo; sin despliegue ni acceso a produccion.

Actualizacion posterior del mismo dia: el manifiesto formato2 agrega vistas
y configuracion/estado de secuencias. Ver VALIDACION_VISTAS_SECUENCIAS_2026-10-10.md.
Las cifras y exclusiones siguientes describen el ensayo inicial, no anulan
la evidencia ampliada posterior. Las puertas de produccion siguen pendientes.

## Resultado

- Respaldo custom de PostgreSQL mediante snapshot exportado: el dump y su
  manifiesto corresponden a la misma instantanea consistente, incluso con
  actividad concurrente en preview.
- Restauracion real en cluster temporal propio, limitado a127.0.0.1:55439.
  El origen es exclusivamente temo_preview en127.0.0.1:55433.
- Coinciden conteos y huellas del contenido de60 tablas del esquema temo.
  Se comparan1430 elementos: columnas, restricciones, indices, triggers,
  funciones/procedimientos y enumeraciones. Las vistas no forman parte de
  esta comparacion; el conteo basico de62 incluye tablas y vistas.
- pgcrypto genera y verifica un hash de una clave sintetica en el destino.
- Ensayo observado: aproximadamente8 segundos para el script de restauracion
  completo; comparacion final122ms. NO constituye RTO de produccion.
- Cluster temporal detenido y carpeta del cluster eliminada al finalizar.
- Backend130/130 y frontend21/21; compilacion y lint backend correctos.

## Repeticion local

Requiere preview activo, Node/dependencias y herramientas PostgreSQL instaladas.
No carga archivos .env ni admite URLs/credenciales remotas.

```powershell
node scripts/preview-recovery.mjs --backup
# Usar la ruta devuelta por el comando anterior:
./scripts/test-backup-restore.ps1 -BackupPath './backups/preview-recovery/temo-preview-<id>.dump' -VerifyPreview
```

Se conservan dump, checksum SHA256 y manifiesto en backups/preview-recovery,
fuera de Git. No adjuntarlos a informes ni compartirlos: incluso los datos de
prueba pueden contener hashes o secretos cifrados. Los logs temporales tambien
permanecen locales. Borrarlos conforme a la politica de retencion que se defina.

## Protecciones y alcance

- Ruta del dump restringida a backups; checksum requerido antes de restaurar.
- Puerto ocupado, PID ajeno o carpeta preexistente detienen el ensayo.
- Limpieza restringida a la carpeta temporal propia; si no se confirma parada,
  no se borra el cluster. No detiene el servidor de preview.
- Fallos de datos o estructura detienen la validacion; no se imprimen filas,
  contrasenas, definiciones completas ni detalles de conexion.
- PostgreSQL18 reexpresa dos CHECK conocidos con casts por elemento en lugar
  de cast del array. Solo se normalizan esas dos formas exactas equivalentes;
  una regla alterada sigue fallando. Pruebas especificas cubren ambos CHECK.
- Las huellas sirven para comprobar consistencia, NO constituyen cifrado,
  firma de autenticidad ni garantia frente a un atacante que controle archivos.
- Agregacion de huellas pensada para el pequeno conjunto de preview; no usar
  este script contra grandes bases productivas ni asumir rendimiento equivalente.

## Pendientes reales

- Restaurar un respaldo reciente de produccion en entorno aislado autorizado,
  con acceso restringido y manejo de datos conforme a su sensibilidad.
- Validar vistas, secuencias, permisos/propietarios, politicas RLS, extensiones
  y configuracion completa: no cubiertas por el manifiesto actual. El restore
  usa --no-owner --no-acl; no demuestra que los privilegios se recuperen.
- Probar login/MFA y flujos financieros contra el entorno restaurado. El smoke
  de pgcrypto no equivale a estos recorridos completos.
- Respaldo cifrado independiente con retencion, responsables y acceso auditado;
  conservar/recuperar aparte la clave de cifrado MFA y secretos de servicios.
- Acordar y medir RPO/RTO con volumen real; probar reconstruccion de API/web,
  DNS, correo y plan de retorno. Una base recuperada no reconstruye todo TEMO.

Este ensayo mejora la evidencia de continuidad; no cierra el bloque de
recuperacion productiva ni acredita seguridad absoluta.
