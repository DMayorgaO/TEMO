# Proteccion de contenido y marcos

Fecha: 2026-10-07. Solo desarrollo; no desplegado ni enviado a main.

## Implementado

- Web: CSP restrictiva por defecto. Scripts solo del propio sitio; sin unsafe-eval ni scripts inline en compilacion. Conexiones al origen de API configurado y al propio sitio, no a cualquier servidor. Objetos y marcos hijos deshabilitados; base-uri none y formularios del mismo origen.
- Cabeceras HTTP frame-ancestors none y X-Frame-Options DENY impiden incrustar TEMO en otra pagina. Vite las aplica en desarrollo y preview; render.yaml prepara reglas para el hosting estatico.
- Meta CSP compilada ofrece proteccion de recursos aun si faltan reglas del hosting. No sustituye las cabeceras: frame-ancestors no funciona en meta.
- API: CSP default-src none y prohibicion de marcos; conserva CORS, no-store y controles de acceso. No cambia permisos ni limita registros financieros.
- Desarrollo permite scripts inline del runtime de Vite y WebSocket exclusivamente localhost/127.0.0.1. Esta excepcion no pasa al build estricto.
- Imagenes propias, data/blob y estilos inline siguen permitidos por compatibilidad con perfiles, graficas, estilos React y exportacion PDF. Esta flexibilizacion de estilos es un riesgo residual, no una CSP sin excepciones.

## Evidencia

- Build frontend/backend, lint y 20 pruebas backend con PostgreSQL de preview y rollback; ocho pruebas frontend, incluidas tres de politica. Pruebas HTTP comprueban cabeceras API incluso antes de autenticar.
- Cabeceras HTTP observadas en Vite3187, preview estricto3189 y API temporal4190. Nunca se apuntaron estas pruebas a la base de produccion.
- Navegador estricto: login qa.liquidacion, lectura de transacciones, calculadora 2+3=5. Sin errores de consola observados en este recorrido.
- Descarga Excel real transacciones (1).xls, 295 bytes, 2026-10-07, en Downloads. No equivale a abrirlo en Excel de todas las sucursales.
- Prueba local de script inline: no se ejecuto; atributo data-executed permanecio ausente. Pagina externa local4192 intento iframe hacia TEMO3189: navegador mostro rechazo de conexion del sub-marco, no login de TEMO.
- Pulsar PDF no genero errores CSP observados, pero la ventana de impresion no fue comprobada en el navegador integrado. La confirmacion PDF anterior no prueba esta nueva politica: repetir prueba manual antes de desplegar.

## Pendiente para produccion

- Confirmar PDF y exportacion PNG con el navegador habitual y politica estricta. Verificar foto de perfil y formularios habituales antes de aprobar.
- Aplicar/verificar cabeceras del sitio estatico en Render. Cambiar render.yaml no acredita que el panel de un servicio existente haya aplicado las reglas; verificar respuesta HTTP real.
- Al adquirir dominio actualizar origen API de CSP y CORS, compilacion, HTTPS y rutas. No utilizar comodines como alternativa.
- Mantener autorizacion expresa de despliegue y verificacion posterior. No se hicieron cambios en Render, Supabase ni DNS.

## Limites

CSP y anti-clickjacking reducen vectores del navegador; no sustituyen MFA, permisos por registro/sucursal, auditoria ni proteccion de sesiones. Un usuario autorizado o una sesion robada aun pueden consultar lo permitido por la API. La matriz completa de permisos y siguientes bloques permanecen abiertos.

Fuentes de diseno: [CSP de MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP), [frame-ancestors de MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors), [cabeceras estaticas de Render](https://render.com/docs/static-site-headers).
