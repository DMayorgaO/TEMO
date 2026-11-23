# Candidato acumulado para producción — 23 de noviembre de 2026

Preparación iniciada el 22 y cerrada el 23 de noviembre de 2026, America/Managua.

Estado: preparación local; no publicado. La petición actual autoriza completar otro bloque y preparar el paquete, no ejecutar el despliegue.

## Referencias y alcance

Rama de trabajo: develop, base local cf08337b26d533f3e74aa4c32695da62515a3c6a. GitHub main coincide con esa base según ls-remote. GitHub develop apunta a 8c0d0a5f2c58a9c839f55679f285993bb8ed9e88; la rama main local sigue atrasada. No usar un push implícito ni forzar referencias.

API productiva comprobada mediante health: 0a6b23ca93522c51a37f43e5740b49fe0f0eb7f4, PostgreSQL ok. Web 200 y cinco rutas protegidas con 401/no-store. Estas consultas fueron públicas/de solo lectura; no prueban todos los recorridos autenticados.

El paquete incluye los cambios acumulados desde esa base:

- Políticas explícitas y contratos de Auth, Catálogos, Directorio, Turnos y rutas financieras; sesión vigente, permisos y revalidación transaccional.
- Directorio con recibos idempotentes; conservación de intención/referencia al reintentar tras respuesta incierta y reordenación de filas.
- Recuperación vinculada a versión/correo; caducidad y bloqueos correctos después de esperas SQL; refuerzos de MFA y sesión.
- Correcciones/cierre de turnos bajo bloqueo, ámbito de consultas/exportaciones y pendientes por día local de Nicaragua.
- Auditoría auxiliar/errores seguros, controles de consultas y exportaciones, manteniendo la auditoría financiera obligatoria.
- Botón D desde el primer depósito NIO pagado en USD, sin cambiar la compra de USD a tasa normal; diferencias de cierre históricas, indicadores de saldo, encabezado y copiado de Directorio/Saldos.
- Nuevo control reproducible del candidato y actualización compatible de herramientas de lint.

Control de gastos permanece fuera. No incluye .env privados, credenciales, certificados, respaldos, tmp ni el informe privado. Las plantillas públicas .env.example existentes no son credenciales de producción.

## Nuevo bloque: integridad del candidato

scripts/prepare-release-candidate.mjs genera un manifiesto SHA-256 del árbol de archivos publicables, base Git, rama, eliminaciones y cambios. --verify vuelve a calcularlo y rechaza diferencias. Incluye archivos nuevos y cambios del índice y del directorio de trabajo; también escanea el contenido almacenado en el índice aunque la copia de trabajo ya se haya corregido; no cambia el índice principal ni hace commits/push.

Rechaza rutas privadas, enlaces/junctions, conflictos, submódulos/entradas especiales y marcas assume-unchanged/skip-worktree. Escanea todos los archivos candidatos contra credenciales conocidas de las configuraciones privadas de producción/piloto, sus variantes escapadas y marcadores de claves privadas. No imprime valores de secretos. No es una herramienta universal de detección de secretos desconocidos ni una firma digital.

Pruebas: backend/tests/release-candidate.test.cjs, cuatro pruebas con repositorios sintéticos. Cubren rutas prohibidas, escape de directorio, credenciales, cambios posteriores, archivos nuevos/staged/unstaged, flags de Git, conflictos y enlaces. El manifiesto final se conserva fuera de Git en tmp/release-nov23-final.json. Cualquier edición posterior exige revisarlo y regenerarlo; no se reutiliza una verificación antigua.

## Esquema y ensayo

Preflight productivo READ ONLY con TLS verificado: 56 migraciones locales, 55 aplicadas coincidentes, sin hashes modificados. Falta únicamente 056_directory_request_receipts.sql. Sin identidades duplicadas, tres roles operativos y perfiles activos soportados. El preflight estricto informa ready=false por esa migración pendiente; no se presenta como aprobado antes de aplicarla.

056 amplía solo el CHECK de solicitudes_financieras para CREAR_DIRECTORIO/EDITAR_DIRECTORIO. Debe aplicarse antes de la API. Se conservan recibos existentes, triggers y permisos; no modifica movimientos ni Directorio.

Respaldo privado creado para esta preparación: backups/production/temo-production-20261122-200515.dump.
SHA-256: 1c78f6dc5753e44c9880869b9648afecb6e9fd08b79b2e440eedf354b10ce141.

Restaurado en clúster temporal exclusivo de loopback 55439, sin tocar preview ni producción. Ensayo de 056 aprobado: 62 tablas de datos y 7 secuencias sin cambios; estructura intacta excepto el CHECK esperado, que conserva las nueve operaciones anteriores y añade las dos nuevas. Herramienta scripts/verify-directory-release.mjs y opción -VerifyDirectoryRelease del verificador de respaldos. PostgreSQL productivo 17 y restauración local 18 según entorno existente; el ensayo no certifica ACLs restauradas porque el respaldo usa --no-owner/--no-acl.

El respaldo se tomó sin pausa de usuarios: es consistente en su instante, no cubre movimientos posteriores. Antes del despliegue efectivo, coordinar pausa y obtener/verificar un respaldo actualizado si hubo actividad. Nunca restaurar este archivo automáticamente sobre movimientos nuevos.

## Compatibilidad e impacto

- Directorio requiere el cliente nuevo: los clientes viejos sin referencia recibirán 400 al guardar y deben recargar.
- Los códigos de recuperación emitidos antes del formato nuevo dejarán de funcionar; solicitar uno nuevo, respetando el límite de envíos.
- Cambiar correo revoca sesiones/desafíos anteriores. MFA conserva su clave y enrolamientos; no rotar MFA_ENCRYPTION_KEY.
- API y web usan Node 22.23.4. No se modifica plan de Render, certificados, reglas de Cloudflare ni credenciales.

## Validación y dependencias

Instalación limpia npm ci --ignore-scripts aprobada después de detener únicamente los procesos propios de desarrollo que bloqueaban el binario de compilación. Build y lint aprobados; compilación productiva explícita con VITE_API_URL=https://api.miscelaneaolivera.com/api, VITE_APP_ENV=production y 30 minutos de inactividad.

Regresión final: 477 pruebas backend y 37 frontend aprobadas, sin fallos ni omitidas. Se repitieron 79 comprobaciones de finanzas, Directorio, ámbito HTTP y mutaciones de turnos con TEMO_TEST_RESTRICTED_ROLE=1; el rol restringido se aplica en los casos transaccionales que implementan ese helper, no a todos los casos concurrentes. Son repeticiones de cobertura incluida en el total, no 79 pruebas adicionales. Las cuatro pruebas del nuevo control de candidato se repitieron después de reforzar la comprobación del índice; los mínimos de dependencias se verificaron de nuevo.

21 suites de navegador aprobadas con APIs sintéticas interceptadas: tabla, filtros de moneda, revisión, pagos, edición/anulación/versiones, transferencias, Directorio (versión/titular/recibos), primera transacción D, saldo vivo, diferencias históricas, copiado simulado/nativo, compensación y monedas cruzadas, traspasos, Arqueo, panel y estado de auditoría. La prueba histórica recibió una espera explícita por los valores cargados; sus comparaciones no se relajaron. La actualización posterior solo afecta herramientas de lint; el build de aplicación conservó los mismos assets de desarrollo.

Se fijaron @typescript-eslint/parser y eslint-plugin 8.73.0 en ambos workspaces, compatibles con Node/TypeScript existentes. Auditoría de ejecución final: cero vulnerabilidades conocidas reportadas. Auditoría completa: tres entradas moderadas en @nestjs/cli, glob y minimatch. npm propone CLI 12 para resolverlas; no se fuerza ese salto mayor sobre la herramienta actual 11. Permanecen documentadas para actualización y validación separadas. Vite conserva el aviso de bundle superior a 500 kB.

Assets productivos preparados en tmp/release-nov22-web:

- index-BAqiBAPY.js: fff32bd1b1e274f8bbe29d686ebc86937919ebf987fdb9cf30d2aeb05065b8ba.
- index-oLI64kAe.css: 78e0cc45cae6dcf8cff5c1c900241ef58091c1350042d4ace6f0ea9d08c70635.

Recomprobación del 23 de noviembre: main/develop remotos sin cambios y preflight productivo de solo lectura sigue indicando únicamente 056 pendiente, con TLS válido y sin hashes alterados. Desarrollo reiniciado con datos conservados y correo deshabilitado; web/health 200 y consulta anónima rechazada con 401.

Para preparar/verificar el manifiesto usar `node scripts/prepare-release-candidate.mjs --prepare tmp/release-nov23-final.json` y `--verify` con el mismo archivo. La preparación no sobrescribe un manifiesto existente. Si se cambia el candidato, generar uno nuevo y conservar la evidencia anterior. No se debe hacer commit del archivo de tmp.

## Secuencia prevista para una publicación autorizada

1. Verificar nuevamente el manifiesto y main remoto; preparar commit solo con el candidato, sin incluir archivos privados. Si main cambió, revisar e integrar antes de continuar.
2. Coordinar pausa de escrituras, respaldo vigente y comprobaciones de base. Conservar la revisión anterior y artefactos para retorno.
3. Aplicar únicamente 056 mediante el ejecutor con TLS verificado; comprobar historial y CHECK. No editar ni reaplicar las 55 anteriores.
4. Publicar el commit autorizado. Render tiene autodespliegue de API y web en main y puede construir ambos en paralelo: mantener la pausa, supervisar las dos revisiones y habilitar el uso solo cuando la API y la web nuevas estén listas. No asumir un orden garantizado entre servicios.
5. Verificar health/revisión, esquema, CORS, cabeceras, acceso anónimo rechazado y assets. Recarga completa; el titular verifica login/MFA, Directorio, exportación y Arqueo con operaciones autorizadas.
6. Registrar resultado y reabrir operación solo tras comprobaciones satisfactorias.

Si falla antes de publicar API/web, mantener la pausa y diagnosticar. Si se requiere retorno de código, volver API y web a la revisión funcional anterior conjuntamente; conservar 056, que es aditiva. No retirar recibos ni deshacer 056 automáticamente después de escrituras. No restaurar el respaldo sobre movimientos posteriores sin conciliación explícita.

## Límites y pendientes independientes

La conexión productiva configurada localmente tiene capacidades amplias (DDL, modificación de auditoría, objetos propios, etc.) y no supera el filtro de rol restringido. Esta comprobación no acredita el rol efectivo del runtime de Render; hace falta verificarlo allí y planificar menor privilegio sin cortar operaciones. No se cambiaron roles/ACLs productivos.

Siguen pendientes la matriz completa de todos los módulos, CA desde Render, retención/centralización/alertas externas, controles de infraestructura y una revisión independiente. Preparar este candidato no declara cerrado todo el checklist ni verifica todos los flujos financieros en producción.
