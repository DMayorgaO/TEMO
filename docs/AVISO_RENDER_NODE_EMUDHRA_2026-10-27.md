# Aviso de Render: Node.js, eMudhra y PHP

Revision: 2026-10-27. Solo analisis, preparacion local y checklist. No se ha desplegado, conectado a la base productiva, rotado secretos ni actualizado el Node global.

## Impacto en TEMO

| Componente | Evidencia local | Evaluacion |
| --- | --- | --- |
| temo-api | render.yaml usaba runtime node y NODE_VERSION=22.14.0 | Requiere parche de Node; la version efectiva de Render no se verifico |
| temo-web | Sitio estatico con build npm/Vite y NODE_VERSION=22.14.0 | Actualizar Node de compilacion y reconstruir; el navegador no ejecuta ese Node |
| Correo de recuperacion | auth.service.ts usa fetch HTTPS hacia api.resend.com | Revisar confianza TLS del cliente que envia el correo; no demuestra filtracion |
| PostgreSQL/Supabase | database.config.ts conserva rejectUnauthorized:true, con CA configurable | Mantener verificacion y revisar procedencia/cadena de la CA personalizada si se usa; no asumir que el almacen del sistema la reemplaza |
| Desarrollo | Node global 24.11.1; portable aislado 22.23.4 verificado | El portable permite calificar el paquete sin sustituir la instalacion global; no usar el global para publicar |
| PHP | No hay PHP ni Docker de PHP en los archivos rastreados; los servicios declarados son Node/estatico | PHP2Shell no aplica directamente a TEMO; confirmar otros servicios del workspace por separado |

El correo no prueba que TEMO haya sido comprometido. Las entradas HTTPS de Cloudflare no sustituyen el parche del proceso Node ni la validacion de sus conexiones salientes. El ajuste no requiere comprar otro plan ni cambiar el dominio.

El parser HTTP de la API admite inflacion por defecto; no debemos asumir que no usar Brotli expresamente elimina su superficie. El fetch de Node tambien procesa respuestas externas. No se realizaron pruebas de explotacion ni se enviaron entradas Brotli maliciosas.

## Fuentes oficiales verificadas

- [Render: eMudhra](https://render.com/docs/advisory-emudhra): actualizar runtimes/CA y reconstruir; incluye sitios estaticos cuando compilan con Node o usan HTTPS.
- [Node.js: aviso de seguridad del 21 de octubre](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases): parches de validacion TLS, Brotli y componentes integrados. Las ramas corregidas empiezan en 22.23.4, 24.22.1 y 26.12.1.
- [Node.js 22.23.4](https://nodejs.org/en/blog/release/v22.23.4): incluye certificados raiz actualizados y correcciones del runtime. Un npm audit limpio no acredita ese parche.
- [Render: prioridad de version](https://render.com/docs/node-version): NODE_VERSION del servicio prevalece sobre .node-version, .nvmrc y engines.
- [Render: despliegues](https://render.com/docs/deploys#manual-deploys): un rebuild y un reinicio no son equivalentes; elegir un commit especifico desde el dashboard desactiva auto-deploys.
- [Render: PHP2Shell](https://render.com/docs/advisory-php2shell): afecta aplicaciones PHP; no implica introducir PHP en TEMO.

## Preparado localmente

- render.yaml apunta a Node 22.23.4 en los dos servicios. Se conserva la rama 22 para reducir el alcance del parche.
- .node-version contiene 22.23.4 como respaldo de configuracion. Ninguno de estos archivos cambia por si solo un servicio existente o la instalacion de Windows.
- scripts/check-runtime-security.mjs compara el Node del proceso con los minimos de este aviso, revisa banderas TLS y muestra solo metadatos/banderas. No contacta servicios, no usa credenciales, no instala paquetes ni afirma validar produccion o rechazo de CA.
- Tres pruebas de runtime-security.test.cjs aprobadas: pisos de versiones, ambos servicios alineados con el pin y ausencia de valores privados en el reporte.
- Al ejecutarlo con el Node local actual informa patchedForOctoberAdvisory=false. Es un rechazo esperado, no una incidencia financiera ni una remediacion completada.

## Checklist urgente, separado del paquete funcional

1. Inventariar los servicios reales de Render, incluidos workers/cron si existen. Registrar commit Live, version efectiva y overrides NODE_VERSION/NODE_OPTIONS/CA sin copiar secretos. El HEAD local 8c0d0a5 no acredita el commit Live.
2. Mantener una salida de hotfix independiente si el paquete funcional se demora. Puede publicarse junto al paquete una vez superadas sus puertas de salida; no postergar indefinidamente el parche por QA funcional.
3. En temo-api y temo-web revisar NODE_VERSION y fijar 22.23.4 o un parche posterior de la misma rama, tras comprobar compatibilidad. La configuracion del dashboard puede sobrescribir el repositorio.
4. Construir de nuevo los servicios con el commit productivo confirmado. Si se usa Deploy a specific commit, registrar el cambio de auto-deploy y decidir su restauracion despues. No publicar latest sin revisar que sea el codigo autorizado; Restart service no sustituye el rebuild necesario.
5. Confirmar version de Node en logs de compilacion de ambos servicios y en el proceso de la API. Un estado Live, la version del navegador o el Node de esta computadora no acreditan el runtime remoto.
6. Revisar almacen de certificados renovado y cualquier CA adicional; conservar DATABASE_SSL=true y rejectUnauthorized:true. No usar NODE_TLS_REJECT_UNAUTHORIZED=0 ni ignorar errores TLS para conseguir que conecte.
7. Verificar desde el Node real de Render, ya parcheado, rechazo de los destinos de prueba de certificados comprometidos indicados por Render y una conexion HTTPS de control valida. No enviar claves, tokens ni cuerpos privados. Un timeout, error DNS o prueba desde curl/navegador no demuestra rechazo por certificado.
8. Comprobar /api/health, conexion real a PostgreSQL con TLS validado, login/MFA/logout, CORS y recuperacion de contrasena con codigo nuevo. No modificar movimientos reales como prueba del parche.
9. Actualizar el Node usado en desarrollo. Preferentemente alinear con 22.23.4; si se conserva la rama 24, su minimo para este aviso es 24.22.1. Repetir instalacion reproducible, build/lint y regresiones bajo el ejecutable nuevo. Las 230 pruebas del bloque anterior no son evidencia de esta compatibilidad ni de este parche.
10. Revisar actividad anomala de Render, Resend y accesos de TEMO. Si hay indicios, activar respuesta a incidentes y rotar las credenciales afectadas de forma controlada; no rotar indiscriminadamente MFA_ENCRYPTION_KEY sin plan de recifrado/recuperacion.
11. Revisar antes de reutilizar los scripts auxiliares antiguos test-pending-cash-summary.mjs y test-preferential-cash.mjs: contienen rejectUnauthorized:false. No fueron ejecutados ni son la configuracion de TLS productiva inspeccionada.

En una version que incluya el script nuevo:

```powershell
node -p "process.version"
node scripts/check-runtime-security.mjs
```

El segundo comando falla deliberadamente cuando el runtime sigue sin parche. Si el hotfix utiliza el commit productivo anterior, el script puede no existir alli: verificar el Node efectivo y las pruebas TLS sin asumir que el fichero local ya fue desplegado.

Destinos negativos publicados por Render, solo despues de aplicar el parche y desde el cliente de la API:

- https://dv-g3b-emudhra.we-have-a-problem.com/
- https://dv-g3b-aaa-emudhra.we-have-a-problem.com/

Ambos deben fallar por validacion de certificado, no por falta de red. El 27 de octubre, con el portable local Node 22.23.4, ambos fallaron con CERT_REVOKED y el control https://nodejs.org/ respondio 200. No se probaron desde Render; esta evidencia no sustituye la verificacion remota.

## Calificacion conjunta en desarrollo

Se descargo el ZIP oficial de Node 22.23.4 para Windows x64 dentro de tmp ignorado. Se comprobo SHA-256 contra la distribucion oficial y la firma Authenticode valida de OpenJS Foundation antes de ejecutarlo. Hash del node.exe: dccc52de28d8df2ee22d2062424f8c563070d95d8ad70c54c4bf01d590dec14f.

Con ese ejecutable pasaron build/lint, 233 pruebas backend y 27 frontend, preflight local y seis scripts de navegador (versionado, correcciones, liquidaciones, transacciones en revision, traspasos y arqueo). La instalacion limpia y repeticion final se registran en CIERRE_BLOQUE_SEGURIDAD_2026-10-27.md. Se agregaron dos escenarios adicionales POR_PAGAR NIO/USD; pasaron junto al versionado y correcciones con rol SQL restringido (29 pruebas).

Esto habilita preparar un candidato combinado; no prueba que el servicio de Render este parcheado. La instalacion global sigue sin actualizar. Recordatorio solicitado por el usuario: revisar e incluir el parche al cerrar este bloque, antes de publicar; sin alarma con fecha inventada.

## Criterio de cierre

Mantener pendientes las casillas productivas hasta contar con build nuevo, version efectiva corregida, revision de CA/overrides y smoke test del servicio real. La prueba de CA aporta evidencia adicional del cliente efectivo. Registrar tambien la version de desarrollo y su regresion. No cerrar el aviso solo porque render.yaml cambio, npm audit reporte cero o haya una reconstruccion fallida.
