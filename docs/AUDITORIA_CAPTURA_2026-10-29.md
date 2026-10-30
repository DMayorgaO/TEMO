# Captura de accesos y consultas

Solo desarrollo. Sin DDL, commit, push ni despliegue por este bloque.

## Persistencia y agrupacion

- Lecturas sensibles y accesos denegados conservan su registro auxiliar agrupado. No se modifica la auditoria financiera obligatoria y atomica, ni se bloquea una operacion por un fallo del registrador auxiliar.
- Una clave solo queda agrupada despues de confirmar exactamente una fila insertada. Fallos SQL o inserciones sin confirmacion no marcan exito y permiten el siguiente intento.
- Duplicados en curso se agrupan separadamente de registros confirmados. Al fallar el primero se libera la reserva; se evita guardar varias veces lo mismo por peticiones simultaneas sin suprimir futuros intentos.
- Cache acotada a 1000 claves por registrador. Al llenarse se elimina una entrada antigua de agrupacion, no se descarta silenciosamente todo evento nuevo. La agrupacion conserva sus ventanas actuales (60 s para denegaciones, 5 min para lecturas), pero una entrada expulsada puede volver a registrarse antes.
- Hasta 10 escrituras auxiliares en curso por registrador. Exceso se cuenta como omision por carga, sin cola ilimitada. Finalizacion/fallo libera recursos.
- Fallos y saturacion generan advertencias genericas limitadas a una por minuto por registrador. No se imprimen errores originales de PostgreSQL, cuentas, tokens, cuerpos ni cadenas de conexion.

## Privacidad

- Actor UUID y metodo validos; rutas de plantilla de la API o marcador no identificado. No se aceptan query strings, escapes, fragmentos, controles ni segmentos UUID concretos dentro de la ruta. UUID objetivo va en su campo separado validado, no en una URL completa.
- IP valida normalizada; valores invalidos se guardan como null. Claves de agrupacion normalizan mayusculas de UUID.
- Estadisticas agregadas separadas por ACCESO_DENEGADO/LECTURA_SENSIBLE: intentos, confirmados, agrupados, rechazados, fallos, saturacion, pendientes y expulsiones de cache, mas ultimas fechas de fallo/saturacion. No exponen actores, IP, rutas concretas ni contenidos.

## Diagnostico administrativo

- GET /catalogs/auditoria/estado-captura requiere sesion autenticada y Administrador sin cambio obligatorio. Ruta estatica antes del detalle UUID; devuelve copia de contadores, no objetos mutables internos.
- Alcance explicitamente current-process y startedAt. Contadores se reinician al reiniciar la API y no agregan replicas ni ofrecen historial durable. No se incorporan nuevas rutas publicas.
- Pantalla Auditoria muestra aviso solo si hay fallos/omisiones observados, o si no pudo comprobar el estado. No muestra una insignia verde que certifique integridad general.
- Consulta al montar y cada 60 segundos mientras la pestana esta visible, sin solapar solicitudes. El endpoint no se audita como lectura sensible para evitar un bucle de sondeo/auditoria.
- El navegador valida la forma del diagnostico y no interpreta una respuesta incompleta como estado saludable. Mensaje compacto con icono, sin tablas ni tarjetas adicionales; comprobado en escritorio/movil.

## Evidencia y limites

- Pruebas de fallo/reintento, duplicados en vuelo, cache de 1001 claves, 10 escrituras pendientes y omisiones medidas, insercion no confirmada, limpieza de reservas y privacidad de parametros/logs.
- Matriz HTTP de diagnostico: anonimo/revocado, Cajero, cambio obligatorio y Administrador; prioridad de ruta estatica sobre :id comprobada.
- Recorrido visual sintetico: parcial, no disponible, respuesta malformada y silencio en estado sin fallos; 1366x768 y 390x844. No utiliza registros productivos.
- Este mecanismo sigue siendo best effort y agrupado: no acredita todos los accesos, no conserva una cola durable ni permite recuperar eventos perdidos. Los contadores de fallos son intentos fallidos, no un conteo exacto de eventos distintos irrecuperables.
- Pendientes: persistencia/centralizacion de salud, alertas externas, retencion y respuesta ante incidentes. No confundir el aviso auxiliar con prueba de perdida de auditoria financiera ni con completitud de logs.
- Publicacion solo autorizada junto con el candidato acumulado; migracion 055 sigue pendiente del bloque anterior, sin otra migracion por este cambio.
