# Revision de cargas lentas

Fecha: 2026-10-29. Cambios solo en desarrollo, sin publicar ni modificar planes.

## Hallazgos

- render.yaml conserva plan: free para temo-api. No es prueba de la configuracion efectiva del dashboard; se solicito confirmar Instance Type. Pagar workspace/ancho de banda no equivale a contratar computo para la API. Supabase y Render son servicios independientes.
- Segun Render, Free se duerme tras 15 minutos sin trafico y computo pagado no se duerme: https://render.com/docs/free y https://render.com/docs/faq. Cargos separados: https://render.com/pricing.
- Tres GET secuenciales a /api/health productivo desde este equipo: 1631, 15433 y 593 ms; todos ok/database ok. Lectura publica, sin credenciales ni escrituras. Muestra pequena sin aislamiento de red/servidor/base; no demuestra cold start ni dimensiona consultas autenticadas.
- Transacciones descarga todo el historial en lotes consecutivos de 200 y vuelve a descargarlo en refrescos. No hay filtro de fecha en servidor para esa consulta. Con mayor historial aumenta el numero de viajes HTTP y trabajo SQL; no se midio EXPLAIN ni perfiles productivos en este bloque.
- La vista esperaba tambien el detalle completo del turno para mostrar las transacciones. Arqueo renderizaba datos provisionales a cero y podia solicitar dos veces el detalle inicial del Administrador.
- Detalle de turno realiza varias lecturas SQL consecutivas. No se ha cambiado su estrategia ni aumentado el pool: paralelizar sin medir podria saturar las cinco conexiones configuradas.

## Correcciones en desarrollo

- Listado inicial de transacciones independiente de la carga del contexto del turno; errores separados y mensaje de carga. No se inicia el refresco periodico hasta terminar la carga inicial. No se ocultan los errores de lectura como si fueran una tabla vacia.
- Arqueo muestra carga/error antes de exponer datos financieros, sin ceros provisionales ni ausencia temporal de Saldos. Detalle inicial administrativo con un solo responsable; carga de turno actual/lista propia concurrente para Cajero.
- Traspaso solicita resumen y candidatos en paralelo despues de guardar los borradores y verificar traspasos pendientes. Conserva comprobaciones de version y confirmacion del receptor; no usa cache para autorizar ni omite lecturas financieras.
- Sin escrituras productivas, modificaciones de claves, planes o migraciones.

## Validacion y pendientes

- Build/lint frontend correctos; 34 pruebas unitarias y seis recorridos locales: monedas, Arqueo, cambios de transacciones, traspasos, turnos en revision y version de edicion.
- Prueba de red retenida en navegador: listado disponible antes de responder /shifts/current; Arqueo no presenta tablas mientras su detalle esta retenido y solo pide una vez el detalle administrativo.
- Estos recorridos interceptan API con datos sinteticos; no certifican tiempos de Render ni consultas con volumen real.
- Pendiente confirmar Instance Type efectivo de temo-api y regiones API/base, CPU/memoria y tiempos SQL durante la incidencia. No comprar ni cambiar planes automaticamente.
- Siguiente ajuste estructural: paginacion/filtros/ordenacion del lado servidor con totales y exportacion completos, conservando alcance por rol y sumas de grupos. No truncar historial o subir el limite para aparentar rapidez.
- Medir latencias por ruta sin registrar cuentas, contrasenas ni payloads, y comparar antes/despues con volumen representativo. Produccion sigue con el paquete anterior hasta autorizacion.
