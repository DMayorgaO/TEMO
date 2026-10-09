# Seguridad integral de exportaciones

Estado: implementacion en desarrollo. No desplegado a produccion.
Este informe actualiza el mecanismo declarativo del informe
VALIDACION_EXPORTACIONES_AUDITORIA_2026-10-08.md; no borra esa evidencia historica.

## Inventario y controles

| Salida | Fuente autorizada | Control |
| --- | --- | --- |
| Excel y PDF de Transacciones | POST /transactions/export | Administrador o cajero propietario; para cajero, turno abierto o pendiente de aprobacion |
| Excel y PDF de Turnos | POST /shifts/export | Administrador o turnos propios del cajero |
| Excel y PDF de catalogos | POST /catalogs/export/:resource | Solo Administrador; lista cerrada de recursos |
| PNG de Inicio | POST /shifts/dashboard/export | Solo Administrador; fechas estrictas y rango de hasta 367 dias |
| TXT de recuperacion MFA | Codigos entregados por el flujo MFA | Descarga local de un uso; nunca copiar codigos a auditoria |

Catalogos habilitados: bancos, sucursales, cuentas, movimientos, reglas de
comision, usuarios, roles y auditoria. Reutilizan las consultas de lectura con
campos explicitamente seleccionados, no SELECT *. No entregan hashes de
contrasenas, semillas MFA ni tokens. Auditoria conserva su limite de 500 eventos.

Las configuraciones de reportes/importaciones sin fuente API verificada ya no
exportan filas locales de ejemplo. Sus botones quedan deshabilitados hasta
implementar su fuente real; no se simula una exportacion exitosa.

## Flujo de tablas

1. Cliente envia formato y UUID de las filas filtradas, no su contenido ni identidad.
2. API valida cuerpo estricto, rol y disponibilidad actual de todos los registros.
3. Si un ID es ajeno, inexistente o dejo de estar disponible, rechaza todo el conjunto.
4. API persiste EXPORTAR / EXPORTACION_AUTORIZADA con apartado, formato, IP valida y filas_verificadas.
5. Solo despues entrega las filas actuales en el orden solicitado.
6. Cliente comprueba que la sesion no cambio, escapa HTML y genera el archivo.

No hay fallback a cache ni descarga cuando falla permiso, red o auditoria.
La respuesta usa no-store global de la API. No se guardan archivos temporales
de reportes en servidor ni se crean URLs publicas de descarga.

## PNG

Se solicita una instantanea nueva del dashboard y se audita antes de entregarla.
La imagen se dibuja desde esos datos, conservando los filtros visibles. Cambio
de sesion/rango durante la solicitud o generacion cancela la descarga.
filas_verificadas representa las filas agregadas de counts entregadas por API,
no la cantidad de transacciones ni de barras de la imagen.

## Archivo y navegador

- Excel HTML: escape de titulo, cabeceras y celdas; cadenas con formato de texto
  y prefijo protector ante =, +, - o @ incluso despues de controles/espacios.
- Numeros negativos reales conservados. PDF no modifica el texto como formula.
- HTML Excel con charset UTF-8, BOM y CSP sin scripts, conexiones, formularios ni recursos externos.
- PDF con CSP restrictiva, sin opener, contenido escapado y error visible si no abre.
- Nombres de archivo acotados y sin rutas, controles o extensiones arbitrarias.
- URLs Blob revocadas tras la descarga; anclas eliminadas incluso si click falla.
- Botones no procesan solicitudes duplicadas simultaneas del mismo apartado.
- Recuperacion MFA comparte limpieza de descarga, pero no envia sus codigos a auditoria.

## Proteccion contra abuso

Solo las rutas de exportacion tienen cuota adicional por identidad autenticada:
30 solicitudes por minuto y 2 simultaneas por usuario. No comparte cuota entre
cajeros de una misma IP ni consume este contador al registrar operaciones.
Cada archivo tabular admite hasta 5000 IDs distintos para acotar memoria/cuerpo.
No es un limite diario de registros: para mas filas, exportar por filtros o lotes.

El contador reside en memoria por instancia, con hasta 1000 identidades activas;
se reinicia con la API. Un despliegue de multiples instancias requiere contador
compartido para una cuota global. Los limites generales existentes siguen vigentes.

## Evidencia

- 63/63 pruebas backend contra entorno local aislado; fixtures financieros con rollback.
- 13/13 pruebas frontend; compilacion y lint correctos.
- Pruebas HTTP reales: anonimo 401; cajero 403 para usuarios/PNG; exportacion
  de transacciones y turnos autorizados, cabecera no-store y auditoria persistida.
- IDs de transacciones/turnos de otro cajero real rechazados, misma y otra sucursal.
- Fallo de persistencia auditada impide devolver el conjunto; cuerpo/rol/fechas
  falsificados, recursos arbitrarios, duplicados y volumen excesivo rechazados.
- npm audit y npm audit --omit=dev: cero vulnerabilidades conocidas reportadas al ejecutar.
- Descarga desde UI con cajero.pruebas: Downloads/temo-transacciones.xls,
  cuatro filas; IDs TRA-000045-01 y TRA-000002-01 al 03 y sus cuatro importes
  comprobados en el archivo, ademas de UTF-8, CSP y formato de texto.
- La ventana PDF no fue observable en el navegador integrado; no se acredita
  impresion efectiva con este nuevo flujo. PNG probado por API y controles
  automaticos, falta descarga visual con Administrador usando su MFA normal.

## Limites de la garantia

EXPORTACION_AUTORIZADA prueba autorizacion y entrega prevista del conjunto;
no certifica guardado en disco, contenido final del archivo ni lectura posterior.
El renderizado es local; no se genera ni firma el archivo en API. Un usuario que
puede leer datos puede copiarlos, fotografiarlos o consultar la API autorizada.
Esto no es DLP ni previene toda extraccion por un empleado con acceso legitimo.

El endpoint anterior /catalogs/auditoria/exportaciones se conserva como
compatibilidad declarativa; no autoriza conjuntos de datos y los botones nuevos
no dependen de el. Usuarios con una pagina antigua abierta deben recargar al
desplegar. Las lecturas generales tienen su propia auditoria muestreada.

Excel sigue siendo HTML .xls, no XLSX nativo. Abrirlo en la aplicacion del negocio
es obligatorio para comprobar advertencias de formato y tratamiento de texto;
las pruebas automaticas no ejecutan Microsoft Excel ni certifican otros importadores.

## Checklist de salida

- [x] Implementacion y pruebas de permisos, datos actuales, auditoria y archivos.
- [x] Descarga Excel desde UI local y contenido verificado.
- [ ] Apertura en Excel habitual; probar texto =1+1, tabulacion + formula y negativos.
- [ ] PDF: abrir vista, comprobar filas/acentos/importes y guardar.
- [ ] PNG: Administrador con MFA, rango/filtros, imagen y evento de auditoria.
- [ ] Aprobar y desplegar paquete acumulado con respaldo y migraciones 040-042.
- [ ] Repetir controles de cabeceras, sesiones y permisos en produccion tras despliegue.
