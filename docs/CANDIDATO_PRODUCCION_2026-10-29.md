# Candidato acumulado para produccion

Actualizado: 2026-10-30, America/Managua. Preparado y comprobado en desarrollo. Sin commit, push, SQL productivo ni despliegue por esta preparacion. Requiere autorizacion posterior.

Publicacion posterior autorizada y completada tecnicamente el 2026-10-30: API/web 6f39eb8, migracion 055 aplicada y preflight de 55 migraciones aprobado. Ver DESPLIEGUE_2026-10-30.md para evidencia final y QA autenticado pendiente. Las listas inferiores conservan el alcance y las puertas del candidato original.

## Paquete

- Identidad de caja: version exacta obligatoria en operaciones/recibos y Directorio; cuatro escrituras de apertura/correccion de turno revalidan al actor dentro de la transaccion. Traspasos rechazan identidades mal formadas antes de bloquear. Ver IDENTIDAD_OPERACIONES_2026-10-30.md.

- Escrituras administrativas: version de sesion obligatoria, cambio obligatorio rechazado y usuario/rol bloqueados durante guardado/auditoria. Matriz de nueve entradas y concurrencia real en ambos ordenes. Ver SESION_CATALOGOS_2026-10-30.md.

- Transferencias: recibos de edicion/anulacion, version de registro/denominaciones, auditoria atomica y ventana TEMO de anulacion. Migracion 055 pendiente de produccion.
- Directorio: actor vigente en escritura, auditoria minimizada, version contra formularios antiguos, contratos estrictos y titular bajo la cedula en ventana flotante.
- Exportaciones: identidad vigente y auditoria en una sentencia antes de autorizar datos; registro declarativo sin perder reintentos ni eventos al saturar el agrupador.
- Contratos estrictos de aperturas/ediciones/cierres, correccion historica de turno, arqueos, saldos y transferencias. Bloques y filas anidados rechazan campos ajenos. Sin cambiar limites, monedas, centavos, reglas de saldo o permisos existentes.
- Consultas: contratos de paginacion/fechas estrictos, perfil explicito en las cinco lecturas de Transacciones y presupuesto concurrente exclusivo de reportes pesados (4 por actor, 16 por proceso). Ver SEGURIDAD_CONSULTAS_2026-10-29.md; no implementa aun la optimizacion del historial.
- Captura auxiliar de accesos/consultas con confirmacion, reintentos y agrupacion acotada; diagnostico agregado del proceso exclusivo de Administrador y aviso en Auditoria ante fallos/omisiones. Ver AUDITORIA_CAPTURA_2026-10-29.md; no sustituye auditoria financiera ni captura durable de cada acceso.
- Filtros de monedas, grafica mensual con cantidades, saldo del cliente fijado en encabezado y ajuste de altura; cargas de consulta independientes y sin ceros provisionales.
- render.yaml refleja el Compute Plan 0.5c-512mb confirmado por el titular, sin cambiar servicios remotos. Identificador contrastado con https://render.com/docs/compute-plans y https://render.com/docs/blueprint-spec. No se modifico el control interno de gastos.

## Verificacion local

- Node portable 22.23.4; build/lint de ambos proyectos correctos.
- 316 pruebas backend y 34 frontend aprobadas, sin omitidas. Matriz HTTP: 12 rutas de escritura verificadas con contrato valido, campos adicionales, anonimo, sesion revocada, perfil no soportado y cambio obligatorio de contrasena. Matrices adicionales de consultas repetidas, roles, diagnostico administrativo y presupuesto concurrente con peticiones HTTP pendientes. Servicios simulados para comprobar la frontera, no para acreditar todas las reglas por registro. Once de sesion administrativa incluyen concurrencia real en ambos ordenes; ocho casos SQL repetidos bajo rol restringido. Nueve nuevas de identidad de caja cubren limites sin coercion, fronteras de escritura y PostgreSQL real.
- Veinticuatro pruebas de operaciones/recibos y Directorio repetidas bajo rol SQL restringido tras exigir version de sesion; todas aprobadas.
- 39 pruebas criticas adicionales bajo rol SQL restringido aprobadas: Directorio, exportaciones, recibos financieros y cambios de transferencias; datos de prueba revertidos.
- Doce recorridos de navegador local con APIs interceptadas aprobados, repetidos el 2026-10-30, incluido el aviso de captura auxiliar. Primeros intentos del bloque previo detectaron una espera inicial del Panel y una asercion adelantada al montaje del resumen; se agrego diagnostico al primero y espera explicita del elemento al segundo. No son prueba de latencia o de operaciones productivas.
- Preflight de preview correcto: identidades/roles/indices, aislamiento, recibos, bloqueos y versionado de transferencias presentes.
- Respaldo local nuevo restaurado en PostgreSQL temporal aislado: datos/estructura de 62 tablas, 1533 elementos estructurales y 7 secuencias coinciden; pgcrypto funcional. No acredita un respaldo productivo nuevo ni ensayo desde la base productiva actual.
- npm audit --omit=dev: cero vulnerabilidades conocidas reportadas. Auditoria completa: tres entradas bajas ligadas a deepmerge/fork-ts-checker-webpack-plugin/@nestjs/cli, solo herramientas de compilacion. No se aplico downgrade automatico. Revisar nuevamente al publicar.
- Revision local de candidatos: configuraciones privadas, certificados, backups, tmp, Control de gastos e informe privado excluidos. Escaneo de valores privados de configuracion sin coincidencias en los archivos candidatos; no sustituye revision humana de todo el diff ni detecta secretos desconocidos.

## Pasos antes de autorizar

1. Titulares revisan en desarrollo alta/edicion/anulacion de Directorio (dos ventanas), filtros y grafica, Excel/PDF/PNG, transferencias y saldo fijo del cliente. Validar apertura/cierre/traspaso con aceptacion/rechazo/cancelacion y aislamiento de ambos turnos.
2. Confirmar alcance final del commit. No incluir archivos ignorados con -f ni el informe privado. Revisar los cambios acumulados; esta preparacion no ha creado ningun commit.
3. Confirmar Live y configuracion efectiva de ambos servicios: Compute Plan de API comunicado por usuario, Node 22.23.4, API URL productiva, CORS HTTPS exacto, CSP y variables necesarias sin copiarlas al repositorio. Verificar runtime/CA desde Render sigue pendiente.
4. Con nueva autorizacion, coordinar pausa de escrituras. Ejecutar preflight productivo de solo lectura y obtener respaldo productivo reciente con restauracion/ensayo aislado. Segun la ultima evidencia publicada, produccion tiene 054; comprobar estado real y hashes, no asumirlo.
5. Ensayar y aplicar 055 con sus hashes y validacion, sin reejecutar migraciones anteriores ya registradas. Esta entrega no agrega otro SQL. No arrancar API nueva contra esquema anterior.
6. Publicar API y verificar revision/health/no-store/CORS/rechazo de anonimos; publicar web compatible y comprobar assets/CSP. Coordinar recarga de clientes: Directorio exige expectedVersion y contratos estrictos no aceptan cuerpos ajenos a la interfaz soportada.
7. Titulares confirman login/MFA/logout, recuperacion con codigo nuevo y operaciones/exportaciones reales autorizadas. Sin suplantar sesiones, compartir codigos o inventar transacciones sobre caja real para probar.

## Retorno y seguimiento

- Ante fallo de arranque/configuracion, mantener pausa y revisar logs por requestId sin claves ni payloads. Volver API/web a un par compatible solo tras verificarlo; las protecciones del codigo anterior pueden ser menores.
- No borrar la columna/recibos de 055 ni restaurar la base antigua automaticamente despues de nuevas operaciones: podria perder movimientos y auditoria. Plan SQL de retorno separado y revisado segun el estado real.
- El esquema es aditivo, pero eso no certifica por si solo compatibilidad operativa del rollback. Antes de reabrir, verificar lecturas y reglas financieras en la version elegida.
- Siguen pendientes paginacion/filtros/totales/exportaciones en servidor, medicion autenticada despues del cambio de plan, retencion/alertas, infraestructura/Zero Trust y matriz completa por rol/sucursal/turno. No se declara terminado el checklist general de seguridad.
