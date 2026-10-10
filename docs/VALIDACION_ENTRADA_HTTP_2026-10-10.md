# Entrada HTTP y configuracion CORS - 2026-10-10

Estado: solo desarrollo, sin despliegue, migraciones ni acceso a datos productivos.

## Implementado

1. Los limitadores existentes de login, MFA, recuperacion, escrituras y lecturas
   se ejecutan antes de los analizadores del cuerpo. Una solicitud que excede
   el cupo recibe429 antes de parsear JSON o descomprimir su contenido.
   Cupos, ventanas y separacion entre consultas/escrituras permanecen iguales.
2. Errores reconocidos del parser se convierten en respuestas controladas:
   JSON/formato invalido400, exceso de cuerpo o parametros413 y codificacion
   no soportada415. Se utiliza tipo y estado, no coincidencias de mensajes.
   No se propagan cuerpo, stack, charset arbitrario ni mensaje del parser.
   Errores desconocidos siguen la ruta interna de error; no se ocultan como400.
3. Se conservan limites JSON256KiB y formularios64KiB. La prueba con gzip
   confirma rechazo del cuerpo expandido demasiado grande. No se deshabilita
   la compatibilidad existente de compresion ni las fotos dentro del limite.
4. Validacion de CORS al arrancar: origenes exactos separados por coma, sin
   rutas, credenciales, query, fragmentos o comodines. HTTPS obligatorio en
   piloto/produccion; HTTP local permitido en desarrollo. Se deduplican origenes.
   Configuracion vacia en desarrollo mantiene CORS deshabilitado, no abierto.

## Evidencia

- Build y lint backend correctos; 106/106 pruebas backend con preview aislado.
- 21/21 pruebas frontend correctas.
- HTTP real con API temporal: JSON malformado, cuerpo grande, gzip expandido,
  charset/encoding no admitidos, formulario grande y1001parametros.
- Rechazos conservan no-store, CORS del origen permitido, nosniff y referencia
  de error; origen ajeno no recibe autorizacion CORS. Sin cuerpo ni stack en
  respuestas ni marcador privado en logs capturados del proceso temporal.
- La solicitud21 de login recibe429 incluso con JSON malformado; Retry-After
  presente. Health sigue200, recuperacion conserva su cupo independiente y
  OPTIONS permitido responde204 sin consumir intentos de login.
- Cuerpo de foto200000caracteres llega al control401 para anonimos; escrituras
  de transacciones siguen401 sin sesion. Regresiones financieras/MFA aprobadas.

Referencia del comportamiento del parser:
https://expressjs.com/en/resources/middleware/body-parser/

## Pendientes y limites

- Antes de publicar, revisar CORS_ORIGINS real de Render: por ejemplo
  https://temo.miscelaneaolivera.com (sin barra final). No se inspeccionaron ni
  modificaron variables remotas en este bloque.
- CORS protege interacciones del navegador, no autoriza usuarios ni bloquea
  clientes externos. Los permisos de API siguen siendo obligatorios.
- Limitadores HTTP siguen en memoria por instancia/IP; no son cuota global
  persistente ni proteccion completa contra DDoS o IPs distribuidas. Los
  controles persistentes de cuenta/MFA/recuperacion permanecen separados.
- La API conserva trust proxy=1. Auditar la cadena Cloudflare/Render y acceso
  directo al origen antes de usar IP como identidad fuerte o permitir dispositivos.
- Un limitador HTTP no evita todo costo de transporte: el proxy/servidor puede
  recibir bytes antes del rechazo. Protecciones del borde y monitoreo pendientes.
- No se modifican reglas financieras, snapshots ni politica de reintentos.

Sigue pendiente la publicacion autorizada del paquete y la prueba real de
recuperacion por correo una vez desplegada su correccion acumulada.
