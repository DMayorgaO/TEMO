# Candidato conjunto: seguridad y cambios operativos

Estado actualizado: publicacion autorizada expresamente por el usuario el 2026-10-27, con pausa de operaciones confirmada. Se conserva abajo la evidencia y las puertas de preparacion originales. El estado efectivo se registra en DESPLIEGUE_2026-10-27.md; este documento no acredita por si solo una publicacion terminada ni todo el roadmap de seguridad.

## Alcance

- Traspaso aceptado por receptor, traspaso en revision con fondos aislados y posterior solicitud de cierre administrativo. Observaciones legibles y avisos renovados.
- Arqueo/saldos unificados, centavos NIO y calculos netos de compras de dolares.
- Sesion y permisos revalidados al escribir; recibos atomicos para altas, liquidaciones y correcciones/anulaciones; reenvio sin duplicacion y auditoria antes/despues.
- Versionado contra ediciones obsoletas en la web, lecturas coherentes y concurrencia real. Clientes anteriores sin expectedVersion no obtienen esa garantia.
- Dependencias corregidas y Node 22.23.4 fijado para ambos servicios de Render y .node-version.

## Evidencia de desarrollo

Node portable oficial 22.23.4 aislado en tmp, con checksum y firma OpenJS validos. No cambia el Node global ni servicios remotos.

- Build y lint correctos en ambos proyectos; primera regresion: 233/233 backend y 27/27 frontend, sin omitidas.
- Seis pruebas de navegador aprobadas: transaction-edit-version, transaction-change-security, pending-payment-security, review-transactions, shift-handovers y cash-workspace. API interceptada en estas pruebas; no acreditan usuarios o infraestructura productivos.
- Dos escenarios adicionales de pendientes de salida NIO/USD: pago, reenvio, reversion y rechazo del recibo revertido. Pruebas focalizadas con rol SQL restringido: 29/29 junto a versionado y correcciones.
- Preflight sobre PostgreSQL local aislado correcto, incluidas migraciones/versiones y nueve triggers habilitados.
- Node local acepta HTTPS valido (200) y rechaza ambos destinos eMudhra publicados por Render con CERT_REVOKED. Pendiente repetir desde el proceso real de Render.
- Instalacion limpia npm ci --ignore-scripts: cero vulnerabilidades conocidas reportadas; build/lint correctos. Regresion final, incluido el ajuste del verificador: 236/236 backend sin omitidas; frontend 27/27. No sustituye la evaluacion de runtime ni auditoria de codigo.
- Ensayo real de respaldo/restauracion local: coinciden 62 tablas, 1,525 objetos estructurales y 7 secuencias. Se corrigio la comparacion estricta de representaciones equivalentes de cuatro CHECK de traspasos/recibos/notificaciones en PostgreSQL 18. Se mantienen diferencias por valores alterados y nombres no autorizados; seis pruebas del verificador aprobadas. No se cambiaron restricciones SQL ni datos para hacer pasar el ensayo.

## Ajustes finales del panel y formularios

- Pestanas de transacciones compactas con banco, codigo y monto; encabezados, herramientas y acciones persistentes al desplazar formularios.
- Panel administrativo: dias abreviados, fecha al pasar el cursor, seleccion por arrastre y seleccion total; suma por dias conservando filtros de banco y moneda.
- Tabla superior sin limite de altura ni desplazamiento interno; grafica alineada que adapta dibujo, etiquetas y seleccion a su altura real. Pruebas sinteticas con 3, 12 y 24 combinaciones de sucursal/cajero en 1366x768 y 1920x1080. Una lista que exceda el monitor requiere desplazamiento de pagina, no oculta filas en un panel interno.
- Build y lint del frontend correctos, 33/33 pruebas unitarias y recorridos de navegador admin-dashboard-selection y cash-workspace aprobados. Vite advierte de un bundle mayor a 500 kB; no es fallo de compilacion. No acredita QA manual ni infraestructura productiva.
- Estos ajustes no agregan migraciones ni modifican permisos o datos productivos; siguen pendientes las puertas de publicacion de abajo.

## Puertas antes de publicar

Actualizacion posterior del 27 de octubre: el candidato incluye tambien SOLICITUDES_CIERRE_TRASPASO_2026-10-27.md y migracion 054. El rango de salida es ahora 044-054; las cifras anteriores documentan la etapa previa. El bloqueo por solicitud no se ha desplegado.

1. QA manual con Administradora y dos cajeros: aceptar/rechazar traspaso, corregir origen EN_REVISION sin afectar receptor, solicitar y aprobar cierre; saldos/arqueos/centavos y observaciones. Probar dos editores y reenvio manual tras resultado incierto. No se sustituye con pruebas interceptadas.
2. Medir carga/contencion representativa de los triggers de versionado; las pruebas concurrentes acreditan integridad, no capacidad productiva.
3. Revisar diff y migraciones 044-054; respaldo productivo reciente con verificacion de restauracion, responsable y ventana acordados. Un ensayo local no es un respaldo productivo.
4. Confirmar commit Live y variables reales de Render. NODE_VERSION del dashboard prevalece: ambos servicios deben construir con 22.23.4 o parche posterior compatible. Mantener TLS verificado y claves existentes; no rotar MFA_ENCRYPTION_KEY como parte de este cambio.
5. Autorizacion de publicacion. Evitar un push que active auto-deploy antes de preparar esquema y respaldo.

## Orden y retorno

Preparar respaldo/configuracion y pausar escrituras durante la ventana; aplicar solo migraciones faltantes 044-054 en orden, conservando hashes/registro. Desplegar API compatible con el esquema y luego web. Reconstruir ambos servicios: un reinicio no actualiza certificados/runtime.

Verificar logs/version efectiva, health, PostgreSQL con TLS, CORS/CSP, login/MFA/logout, recuperacion con codigo nuevo y rechazo de CA desde Node remoto. No inventar exito por un estado Live.

Ante fallo, mantener escrituras detenidas y distinguir error de configuracion de codigo/esquema. No borrar migraciones, recibos ni contadores para forzar retorno. No volver automaticamente a una API que ignore EN_REVISION/aislamiento tras existir traspasos nuevos. Restaurar respaldo solo como recuperacion coordinada, sin perder operaciones posteriores de forma silenciosa, invalidando sesiones/formularios anteriores. Conservar evidencia y reconciliar movimientos antes de reabrir.

## Recordatorio y exclusiones

Recordatorio solicitado para el cierre de este bloque: el parche de Node/eMudhra debe incluirse al publicar. Es compatible con preparar este paquete conjunto tras QA; si QA se demora, sacar el runtime como hotfix separado sin arrastrar funciones pendientes.

CONTROL_GASTOS_TEMO.md permanece interno, ignorado y no rastreado. Se excluyen tambien backups, tmp, certificados, archivos .env y credenciales. No publicar con git add indiscriminado. El resto del checklist (ampliar recibos/versionado a otras rutas, retencion y medidas de infraestructura) sigue abierto y no se presenta como terminado.
