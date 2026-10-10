# Dominio, correo y PostgREST

Fecha: 2026-10-09, America/Managua.

## Verificaciones publicas

- API propia: https://api.miscelaneaolivera.com/api/health responde 200 y base saludable; revision observada 13e690e88d49eea2addd3e4dd25c803c66d26424.
- Preflight de login permite https://temo.miscelaneaolivera.com y no devuelve permiso CORS al origen ajeno probado.
- Web propia accesible por HTTPS. En la comprobacion, bundle index-CJf_vxWS.js y cabecera CSP todavia apuntan a temo-api.onrender.com. Abrir el login no acredita migracion completa ni acceso autenticado.
- render.yaml preparado con VITE_API_URL del dominio propio y CSP que admite ambas APIs durante la transicion. La politica generada por el frontend solo admite la API configurada. No publicado por esta entrega.
- En servicios existentes, comprobar tambien las variables y cabeceras del Dashboard de Render: editar el YAML no garantiza que un servicio no administrado por Blueprint cambie su configuracion.
- Verificacion repetida a las 19:58 Managua: API/base 200, CORS correcto y frontend aun con URL/CSP anteriores. Pruebas frontend security-policy 3/3, compilacion frontend y git diff --check correctos (solo advertencias de conversion LF/CRLF).

## Correccion de PostgREST aplicada en produccion

Los mensajes checkpoint starting/complete, severidad LOG y SQLSTATE 00000, son eventos normales; no se desactiva su registro. El error 3F000 de PostgREST sobre pg_pgrst_no_exposed_schemas tiene una correccion oficial para Data API deshabilitada:

https://supabase.com/docs/guides/troubleshooting/schema-pg_pgrst_no_exposed_schemas-does-not-exist

Preflight: sin override pgrst.db_schemas, esquema de destino ausente, 221 relaciones en temo. Roles anon/authenticated sin USAGE sobre temo.

Aplicado en transaccion mediante TLS con CA verificada y limites de espera, sin reiniciar PostgreSQL:

```sql
create schema if not exists pgrst_no_exposed_schemas;
revoke all on schema pgrst_no_exposed_schemas from public, anon, authenticated;
alter role authenticator set pgrst.db_schemas = 'pgrst_no_exposed_schemas';
notify pgrst;
```

Verificado al confirmar: override presente; esquema vacio sin relaciones; anon/authenticated siguen sin USAGE sobre temo ni sobre el esquema vacio. Se conservaron los otros ajustes de authenticator. Sin cambios financieros, usuarios, claves ni habilitacion de tablas en la Data API.

Pendiente: observar logs posteriores en Supabase y confirmar que deja de repetirse ese 3F000. No se atribuyen todos los errores del panel a esta causa ni se afirma que desaparecieron sin observacion.

Reversion de la configuracion anterior (no elimina datos ni el esquema vacio):

```sql
alter role authenticator reset pgrst.db_schemas;
notify pgrst;
```

Esta reversion puede recuperar el ruido original. Es mantenimiento de configuracion administrada, no una migracion financiera de TEMO.

## Correo pendiente de configuracion externa

- Resend existente, confirmado por el usuario. Agregar y verificar notificaciones.miscelaneaolivera.com para envio; copiar exclusivamente los DNS generados por Resend. No inventar claves DKIM ni destinos MX.
- Remitente propuesto: TEMO <accesos@notificaciones.miscelaneaolivera.com>.
- Guardar RESEND_API_KEY con alcance de envio restringido y PASSWORD_RESET_EMAIL_FROM en temo-api, directamente en Render. Nunca compartir la clave por chat, frontend o repositorio. La existencia de variables locales no acredita las de Render.
- Mantener seguimiento de apertura/clic desactivado para recuperacion. Probar solicitud generica, entrega, codigo de un uso, expiracion y revocacion de sesiones. Recuperacion existente solo para Administrador; no ampliar a cajeros sin decision explicita.
- Cloudflare Email Routing: soporte@miscelaneaolivera.com hacia el destino privado confirmado por el usuario, omitido aqui deliberadamente. El titular debe verificar el destino y probar un mensaje externo.
- Los MX de recepcion del dominio raiz y los DNS de envio del subdominio tienen fines distintos. Seguir los valores del proveedor; un solo SPF por nombre DNS, no reemplazar registros de otro servicio a ciegas.
- Configurar DMARC inicialmente en observacion y endurecer despues de comprobar los remitentes legitimos. No afirmar entregabilidad hasta completar pruebas reales.

Referencias: https://resend.com/docs/dashboard/domains/introduction y https://developers.cloudflare.com/email-service/get-started/route-emails/.
