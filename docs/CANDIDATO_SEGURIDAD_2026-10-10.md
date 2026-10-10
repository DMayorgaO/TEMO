# Candidato acumulado de seguridad

Fecha: 2026-10-10. Estado: paquete publicado, API y web80d6594 verificadas a17:42
Managua. Ver ESTADO_DESPLIEGUE_2026-10-10.md. Confirmacion autenticada del titular
tras despliegue y pendientes generales del checklist siguen abiertos.

## Contenido del siguiente paquete

1. Recuperacion administrativa por correo: correccion de auditoria que hacia
   inutilizable el codigo enviado, limites persistentes entre instancias,
   preparacion atomica y envio con tiempo maximo. No amplia recuperacion a cajeros.
2. Autenticacion: schemas estrictos, bloqueo de intentos concurrentes, emision
   de sesion revalidada y politica de claves nuevas compatible con bcrypt/pgcrypto.
   Mantiene MFA ya publicado, enrolamientos y claves existentes.
3. Frontera HTTP: limitadores antes de parsear, errores seguros, CORS explicito
   y validacion UUID en23 rutas; pruebas de inventario publico/guard.
4. Base de datos: TLS remoto verificado, configuracion sin overrides en URL,
   pool y tiempos acotados, recuperacion de conexiones fallidas sin repetir
   escrituras automaticamente. Piloto de privilegios minimos, NO aplicado remoto.
5. Auditoria administrativa: antes/despues en siete catalogos, vinculos/efectos
   permitidos, numero de cuenta oculto y rechazo de IDs de vinculos ajenos.
6. Notificaciones: resumen de transferencias por sucursal/direccion/cajero,
   bancos digitales y monedas separadas, conservando confirmacion agrupada.
7. Continuidad: ensayo local real de backup/restore, manifiesto de datos,
   vistas/secuencias y estructura; guias de respuesta y riesgos pendientes.

## Comprobado localmente

- [x] Backend151/151 (TEMO_TEST_PREVIEW=1 y TEMO_TEST_RESTRICTED_ROLE=1).
- [x] Frontend21/21.
- [x] npm run build y npm run lint, backend y frontend completos.
- [x] npm audit completo:0 vulnerabilidades conocidas reportadas en esta revision.
- [x] Preflight exclusivamente preview: sin identidades duplicadas, tres roles
  esenciales activos, sin usuarios activos con perfil no soportado; indices y
  migraciones requeridos040-043 presentes. No demuestra el estado remoto actual.
- [x] Frontend compilado con VITE_API_URL=https://api.miscelaneaolivera.com/api,
  VITE_APP_ENV=production y VITE_SESSION_IDLE_MINUTES=30. No publicado.
- [x] Ensayo local de restauracion previo:60 tablas,2 vistas y7 secuencias,
 1439 elementos estructurales coincidentes. No equivale a restauracion productiva.

## Antes de commit/publicacion

- [x] Usuario confirma QA en navegador habitual: diferencias de auditoria nuevas (sucursal,
  cuenta y movimiento); resumen de transferencias; PDF/Excel/PNG, login/MFA,
  logout. No acredita todos los flujos financieros. Correo local sin proveedor;
  confirma recepcion en produccion, pendiente completar recuperacion tras despliegue.
- [x] Revision final del diff, incluidos nuevos archivos no rastreados. No usar
  git add indiscriminado: excluir respaldos, tmp, .env, secretos y documentos
  ajenos al paquete. Preservar informe de seguridad aportado por el usuario.
- [x] Autorizacion expresa del commit/push y despliegue. Un push a main puede
  disparar autoDeploy de Render; preparar API y web por separado.
- [x] Respaldo productivo reciente verificado/legible y plan de retorno con
  referencia previa13e690e88d49eea2addd3e4dd25c803c66d26424. Respaldo del
  2026-10-10 17:20 Managua restaurado en servidor local aislado:62 tablas/vistas.
  No borrar ni regenerar AUTH_SECRET/MFA_ENCRYPTION_KEY.
- [x] Arranque real de API con validacion estricta y health/base correctos; sin
  inspeccionar secretos del Dashboard. CORS inicialmente invalido fue corregido
  por el usuario. Validacion DATABASE_URL sin query (sslmode/options, etc.), TLS
  y CA compatibles, CORS_ORIGINS exactos HTTPS, recursos/limites adecuados.
  No basta editar render.yaml para asegurar cambios en servicios existentes.
- [x] Usuario confirma configuracion y recepcion real de correo en API:
  RESEND_API_KEY y PASSWORD_RESET_EMAIL_FROM,
  dominio verificado. Uso completo del codigo tras despliegue pendiente.
  Nunca exponerlos en frontend/logs.
- [x] Confirmar VITE_API_URL/APP_ENV/SESSION_IDLE por bundle exacto y CSP reales al publicar
  web. onrender.com sigue permitido transitoriamente en CSP; no es Zero Trust.
- [x] Preflight remoto de solo lectura y revisar necesidad real de migraciones.
 43 migraciones coincidentes, sin duplicados y con indices/roles requeridos.
  Este bloque no agrega SQL nuevo; no ejecutar migraciones historicas a ciegas.
  TLS del cliente verificado. pg_stat_ssl del backend del pooler devuelve false:
  no acredita cifrado de ese salto interno; pendiente verificar garantia del proveedor.

## Orden y retorno propuestos

1. Verificar configuracion y respaldo; publicar API primero y comprobar health,
   inicio/MFA, guard, auditoria y recuperacion de cuenta de prueba autorizada.
2. Publicar web con API propia/CSP y validar operaciones/archivos/avisos desde
   navegador habitual; confirmar login VIP Access por el titular, sin compartir OTP.
3. Revisar errores, latencia y Egress durante operaciones reales. No repetir
   transacciones de resultado incierto ni usar ausencia de actividad como prueba.
4. Ante regresion, detener publicacion restante y volver al codigo/configuracion
   previamente verificados. NO restaurar datos antiguos encima de operaciones
   nuevas como retorno automatico; conciliacion y restauracion requieren decision.

## No se considera terminado

Separacion real de credenciales API/migraciones, privilegios remotos minimos,
restauracion productiva aislada/RPO/RTO/copia cifrada/clave MFA, dispositivos
administrados/Zero Trust, sesiones individuales/cookies/CSRF, alertas e inventario,
matriz completa por ruta/sucursal/registro, idempotencia movil, retencion/rotacion,
PostgREST durante actividad, reenvio de soporte y prueba independiente autorizada.

Estas tareas no deben presentarse como implementadas por aprobar este paquete.
