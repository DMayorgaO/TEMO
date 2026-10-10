# Recuperacion: vistas y consecutivos

Fecha: 2026-10-10. Continuacion del ensayo de preview, exclusivamente local.
Sin despliegue, acceso a produccion ni modificacion de consecutivos existentes.

## Cobertura agregada

- Definiciones de vistas (incluidas materializadas si existieran) y reloptions.
- Configuracion de secuencias: tipo, inicio, incremento, min/max, cache, ciclo
  y vinculacion a tabla/columna mediante dependencia serial/identity.
- Estado de cada secuencia: last_value como texto (sin perder precision de
  bigint en JavaScript) e is_called, que determina si se devuelve el valor
  almacenado o se avanza en la siguiente asignacion.
- Nuevo formato2 del manifiesto: versiones anteriores se rechazan. Generar
  un nuevo respaldo con el script actual; no editar manualmente manifiestos.

Los scripts de captura/verificacion solo leen las secuencias. No usan nextval
ni setval, ni cambian la numeracion de TEMO.

## Consistencia durante respaldo

Las tablas conservan snapshot exportado compartido con pg_dump. Las secuencias
no son MVCC: se comparan antes de exportar snapshot, al terminar la captura
del manifiesto y despues de pg_dump. Si difieren, el ensayo falla y no genera
checksum/manifiesto aceptados. Puede quedar un dump incompleto/no aprobado;
no usarlo para recuperacion. Repetir cuando no haya actividad de escritura.

Este control detecta cambios observables; no es un bloqueo de las secuencias
ni garantia ante un actor privilegiado que altere y reponga el mismo estado.
No trasladar este ensayo pequeno a produccion sin disenar su procedimiento.

## Evidencia

- Respaldo nuevo y restauracion en PostgreSQL temporal local completados:
 60 tablas,2 vistas,7 secuencias,1439 elementos estructurales coincidentes;
  estado completo de las7 secuencias coincidente, pgcrypto funcional.
- Script completo aproximadamente8 segundos; verificacion final133ms.
  Estas mediciones de preview NO constituyen RTO productivo.
- Pruebas negativas comparan contadores, is_called, secuencias ausentes,
  bigint superior a Number.MAX_SAFE_INTEGER y formato anterior de manifiesto.
- Prueba PostgreSQL real crea vista/secuencia exclusivas dentro de transaccion,
  detecta avance de contador y cambio de SELECT de la vista; rollback elimina
  fixtures. No consume valores de secuencias existentes. Durante la suite
  paralela, compara solo el estado de su fixture para no confundir avances de
  otras pruebas financieras; el verificador de respaldo compara TODAS.
- Regresion completa136/136 backend y21/21 frontend; build/lint backend correctos.
- El cluster temporal se detiene y elimina; respaldo/checksum/manifiesto siguen
  privados y excluidos de Git conforme al ensayo anterior.

## Pendientes

La definicion de una vista no prueba sus resultados con todos los escenarios
financieros. No se comprueban aqui contenido de vistas materializadas,
propietarios/ACL, politicas RLS, privilegios de funciones ni roles reales;
restauracion sigue usando --no-owner --no-acl.

Pendientes: restauracion productiva aislada autorizada, permisos minimos en
Supabase/Render, prueba de login/MFA y flujos sobre destino restaurado, copia
cifrada independiente, recuperacion de clave MFA/secretos de infraestructura
y RPO/RTO con volumen real. No se considera cerrado el bloque de continuidad.
