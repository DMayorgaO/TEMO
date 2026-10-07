# Validacion del primer paquete de seguridad

Fecha: 2026-10-06. Solo desarrollo, sin despliegue.

## Cambios candidatos

- Exportaciones HTML con texto escapado; PDF sin opener y CSP restrictiva.
- Lecturas de usuarios, roles y comisiones solo Administrador; catalogo operativo de cuentas limitado para Cajero.
- Cache operativa por sesion; limpieza al salir y proteccion contra respuestas tardias de catalogos.
- Respuestas API no-store; CORS sin configuracion no acepta origenes arbitrarios.

## Regresion financiera automatizada

backend/tests/financial-regression.test.cjs usa servicios reales compilados y PostgreSQL local de preview. No sustituye pruebas HTTP de cada escritura ni la revision visual de los formularios. Las pruebas HTTP de autenticacion/catalogos estan en catalog-access.test.cjs.

1. Administrador prepara turno de un usuario temporal; Cajero no puede prepararlo ni abrir el de otro. Apertura propia conserva C$1000 iniciales y cuentas BAC disponibles.
2. Deposito efectivo C$100 suma exactamente C$100 al esperado y aplica una vez el movimiento bancario; saldo sistema se actualiza.
3. Otro cajero no lee ni anula la transaccion mediante su ID.
4. Retiro C$100 y deposito C$60 requieren salida neta C$40. Se rechaza anulacion individual con arqueo compartido; anulacion por grupo restaura el esperado.
5. Pendientes C$30+C$40+C$50 no mueven efectivo al crearse. Liquidacion sin conteo rechazada sin abonos residuales. Conteo C$130 con vuelto C$10 liquida C$120 y no duplica efecto bancario.
6. Deposito efectivo USD100 usa compra36.40: suma C$3640 al consolidado. Anulacion restaura el esperado.
7. Retiro USD100 y deposito C$3655 con preferencial36.55 no crean faltante fisico ficticio. Marca/tasa persistida y anulacion del grupo comprobadas.
8. Egreso efectivo C$20 de Cajero resta del esperado; anulacion lo devuelve. Transferencia digital y lectura de transferencia ajena rechazadas.
9. Retiro C$380 liquida pendiente C$180 y deposita C$200 sin salida fisica: esperado sin faltante. Al anular grupo se reabre pendiente con saldo C$180.

## Aislamiento y ejecucion

La conexion esta fijada a 127.0.0.1:55433/temo_preview, sin reutilizar DATABASE_URL ni credenciales de produccion. Usuario/turno/movimientos temporales se crean en una transaccion externa y cada operacion usa savepoints. Al terminar se hace rollback y se verifica que no persista el usuario temporal. PostgreSQL puede avanzar secuencias aun tras rollback: puede haber saltos de IDs exclusivamente en preview.

```powershell
npm run build -w backend
$env:TEMO_TEST_PREVIEW = '1'
node --test backend/tests/*.test.cjs
node --test frontend/tests/*.test.mjs
Remove-Item Env:TEMO_TEST_PREVIEW
```

Resultado: 16/16 backend (nueve escenarios financieros mas contenedor y seis pruebas previas), 5/5 frontend. Sin TEMO_TEST_PREVIEW las pruebas de integracion se omiten; ese resultado no cuenta como validacion financiera.

## Puerta de despliegue

- Excel comprobado por descarga real desde frontend local: C:/Users/LEGION/Downloads/transacciones.xls, 660 bytes, cuatro filas y montos esperados. El seguimiento del evento download del navegador integrado agoto tiempo, pero el archivo se genero y su contenido fue verificado. Pendiente abrirlo en Excel utilizado por sucursales y verificar impresion PDF en su navegador habitual.
- CORS efectivo de produccion comprobado con OPTIONS de solo lectura: origen https://temo-web-7k9m.onrender.com recibe 204 con access-control-allow-origin exacto; https://untrusted.invalid recibe 204 sin autorizar ese origen. No se cambiaron variables ni registros en produccion. Esto verifica el comportamiento observado, no acceso al panel ni una lista exhaustiva de origenes.
- Recuperacion ante fallo de red comprobada en instancia temporal 3188/4188: formulario BAC/DC C$50 con un billete de C$50 conserva codigo, monto y denominacion tras detener API y pulsar Guardar; muestra RED-CON-002. Al restaurar API con misma clave de sesion conserva el formulario; cuatro transacciones antes y despues, sin reintento automatico. Se cancelo el formulario y se cerraron procesos temporales.
- Desplegar solo con autorizacion expresa, conservando version anterior para revertir codigo; no restaurar la base sobre transacciones nuevas.
- Despues del despliegue verificar login, consulta de cuentas, permisos y no-store; no realizar movimientos financieros ficticios en produccion.

Dependencias, MFA, dispositivos autorizados, CSP general y auditoria completa siguen pendientes. Este paquete reduce riesgos concretos; no cierra toda la etapa de seguridad.

## Comprobacion final realizada

- Build completo y lint; regresion backend 16/16 y frontend 5/5.
- Captura visual de Transacciones de Cajero y Panel General de Administrador sin errores de consola durante esta comprobacion. Logout y cambio de identidad comprobados sin movimientos ficticios.
- Correccion de compatibilidad: Operador de transferencias puede leer opciones de cuentas activas entre sucursales, sin numero de cuenta; conserva restricciones administrativas. Pruebas de parametros y SQL para TRANSFERISTA aprobadas.
- El navegador integrado no abrio una ventana imprimible observable al pulsar Exportar PDF. El usuario confirmo explicitamente: Abre y permite guardar el PDF, en su navegador habitual. Validacion PDF aprobada por usuario.
- .env.cloud local contiene un origen localhost; no es evidencia de la configuracion aplicada en Render. No se debe utilizar ese archivo para reemplazar indiscriminadamente las variables de produccion.
- Decision: paquete candidato aprobado con evidencia descrita; usuario autorizo despliegue a produccion. No requiere migraciones de base. Validar despliegue y respuestas no-store despues de publicar. Apertura del archivo en Excel de cada sucursal sigue como comprobacion de compatibilidad adicional, no se afirma que haya sido ejecutada.
