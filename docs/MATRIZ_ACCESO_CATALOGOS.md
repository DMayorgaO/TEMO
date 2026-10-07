# Matriz de acceso a catalogos: primera entrega

Fecha: 2026-10-06. Implementacion en desarrollo; no desplegada.
Administrador conserva el codigo interno JEFA por compatibilidad de datos; las etiquetas visibles usan Administrador.

| Ruta GET /api/catalogs/ | Visitante | Cajero | Administrador |
| --- | --- | --- | --- |
| usuarios | 401 | 403 | Completo |
| roles | 401 | 403 | Completo |
| reglas-comisiones | 401 | 403 | Completo |
| cuentas-bancarias | 401 | Activas, alcance autorizado, sin numero de cuenta | Completo |

Operador de transferencias (TRANSFERISTA): conserva opciones de cuentas activas entre sucursales, igual que el contexto de transferencias ya autorizado, sin numero de cuenta. Usuarios/roles/comisiones siguen restringidos a Administrador. Esta compatibilidad se agrego durante la comprobacion final y se valido contra PostgreSQL preview.

Alcance autorizado de cuentas para Cajero: globales sin asignacion de sucursal, o vinculadas a una sucursal activa asignada al cajero o de su turno ABIERTO/PENDIENTE_APROBACION. Identidad y rol provienen del guard de autenticacion, nunca de parametros elegidos por el cliente. Perfiles distintos de CAJERO/JEFA/TRANSFERISTA no acceden a cuentas.

No bloquear usuarios/roles/comisiones solo en menus: comprobar la restriccion ante solicitudes directas. No basta con ocultar campos mediante CSS.

## Evidencia

- backend/tests/catalog-access.test.cjs prueba denegacion antes de consultar, parametros, alcance SQL contra preview y respuesta HTTP con autenticacion real.
- Integracion solo contra PostgreSQL local fijo de preview; servidor HTTP temporal cerrado al terminar. No utiliza credenciales de produccion.
- Ejecutar npm run build -w backend antes de los tests, porque estos importan dist.
- Ejecutar con TEMO_TEST_PREVIEW=1 para incluir integracion; sin esa variable las dos pruebas de integracion quedan omitidas.

## Limites y siguientes pruebas

La matriz no es una auditoria completa de autorizacion. Sucursales conserva metadatos necesarios para operacion; contexto de transferencias expone opciones de destino separadas. Revisar minimizacion y permisos de estas rutas antes de declarar cerrado el riesgo global de catalogos.

Probar manualmente apertura de turno y cuentas disponibles, transacciones en ambas monedas, liquidaciones y transferencias entre sucursales. Revisar los registros historicos y cuentas inactivas necesarios para lectura sin ampliar privilegios operativos.

Las pruebas no modifican movimientos financieros; el login de integracion si genera los eventos habituales exclusivamente en preview.
