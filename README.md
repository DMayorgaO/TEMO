# TEMO

Sistema Web de Transacciones Economicas de Miscelanea Olivera.

## Etapa 1

Arquitectura local en red:

- Frontend: React + TypeScript + Vite.
- Backend: NestJS + TypeScript.
- Base de datos: PostgreSQL local.
- Inicializacion: `database/init/001_create_temo_database.sql`.
- Grupos y arqueos de transacciones: `database/init/002_transaction_groups_and_cash_settlements.sql`.
- Saldos bancarios de apertura y cierre por turno: `database/init/004_shift_account_balances.sql`.
- Migraciones posteriores: `database/migrations`.
- Definicion funcional: `docs/02-procesos-pantallas-accesos.md`.

## Primer arranque local

1. Copiar `.env.example` como `.env`.
2. Levantar PostgreSQL:

```powershell
docker compose up -d postgres
```

3. Instalar dependencias:

```powershell
npm install
```

4. Iniciar TEMO sin duplicar procesos:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-temo.ps1
```

El script conserva cualquier instancia que ya este activa, inicia solamente los
servicios faltantes y muestra la direccion vigente para los otros dispositivos.
El inicio manual sigue disponible en terminales separadas:

```powershell
npm run dev:backend
npm run dev:frontend
```

El frontend quedara en `http://localhost:3000` y el backend en `http://localhost:4000`.
PostgreSQL queda expuesto en el host por `localhost:55432` para no chocar con una instalacion local de PostgreSQL ni con los puertos reservados por Windows.

## Modelo de multi-transacciones

- `grupos_transacciones` representa una atencion completa de un cliente.
- `transacciones.id_grupo_transacciones` y `orden_grupo` conservan las operaciones y su secuencia.
- `arqueos` distingue el efectivo recibido, el entregado y el vuelto por grupo y moneda.
- `arqueos_denominaciones` guarda montones de 25 y unidades sueltas por denominacion.
- `arqueos.diferencia` se calcula automaticamente entre el monto fisico y el esperado.
- `vw_grupos_transacciones_liquidacion` expone montos recibidos, entregados, netos y diferencias en NIO y USD.

## Guardado atomico

El formulario de transacciones envia todas sus pestanas y arqueos a
`POST /api/transactions/batch`. El backend valida el turno, los catalogos y las
monedas, y guarda grupo, transacciones, montos, pendientes, comisiones,
movimientos de efectivo, arqueos y bitacora dentro de una sola transaccion SQL.
Ante cualquier error se ejecuta `ROLLBACK` y no queda informacion parcial.

## Directorio de destinatarios frecuentes

El directorio se almacena normalizado en PostgreSQL: un destinatario puede
tener varios numeros, cedulas y referencias sin repetir sus datos generales.
Para reconstruir la carga inicial desde el libro local de 2026:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\extract-bank-directory-xlsb.ps1
node .\scripts\build-bank-directory-seed.mjs
Get-Content .\database\local-seeds\frequent-recipients.initial.sql -Raw |
  docker exec -i temo-postgres psql -v ON_ERROR_STOP=1 -U temo -d temo
```

Los archivos generados contienen cuentas y cedulas reales. Por seguridad se
guardan en `database/local-seeds/` y `database/seeds/*.initial.json`, rutas
excluidas de Git. La estructura vacia se crea con la migracion `015`.

Debe existir un turno abierto para registrar transacciones. En red local el
frontend usa automaticamente `http://<equipo-servidor>:4000/api`; para nube se
puede definir `VITE_API_URL`.

## Acceso desde otro equipo de la red

El frontend y el backend escuchan en `0.0.0.0`, por lo que pueden atender a la
red local. La IP puede cambiar al conectarse a otro Wi-Fi; `start-temo.ps1`
muestra siempre la direccion actual. En la red detectada actualmente, otro
equipo debe abrir:

```text
http://192.168.0.6:3000
```

Para permitir el acceso desde redes privadas o publicas de confianza, ejecutar
una vez el siguiente script. Windows solicitara permisos de administrador y las
reglas quedaran limitadas a la subred local:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\enable-local-network.ps1
```

Los dispositivos deben estar conectados al mismo router y la red no debe tener
habilitado el aislamiento entre clientes.

## Nota

El script SQL esta disenado para crear la base local desde cero cuando el volumen de PostgreSQL esta vacio. Si se cambia el script despues de haber levantado la base, se debe usar una migracion o reiniciar el volumen en desarrollo.
