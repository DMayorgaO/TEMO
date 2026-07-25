# TEMO

Sistema Web de Transacciones Economicas de Miscelanea Olivera.

## Etapa 1

Arquitectura local en red:

- Frontend: React + TypeScript + Vite.
- Backend: NestJS + TypeScript.
- Base de datos: PostgreSQL local.
- Inicializacion: `database/init/001_create_temo_database.sql`.
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

4. Ejecutar backend:

```powershell
npm run dev:backend
```

5. Ejecutar frontend:

```powershell
npm run dev:frontend
```

El frontend quedara en `http://localhost:5173` y el backend en `http://localhost:4000`.
PostgreSQL queda expuesto en el host por `localhost:5433` para no chocar con una instalacion local de PostgreSQL.

## Acceso desde otro equipo de la red

El frontend se ejecuta con `--host 0.0.0.0`, por lo que puede escucharse desde la red local si Windows lo permite. Usar la IP real del adaptador de red, no las IP de WSL, VMware u otros adaptadores virtuales. En esta maquina, la IP de red detectada fue `192.168.0.17`, por lo que otro equipo deberia probar:

```text
http://192.168.0.17:5173
```

Si no abre desde otro equipo, revisar Firewall de Windows y permitir Node.js o abrir el puerto 5173 para red privada.

## Nota

El script SQL esta disenado para crear la base local desde cero cuando el volumen de PostgreSQL esta vacio. Si se cambia el script despues de haber levantado la base, se debe usar una migracion o reiniciar el volumen en desarrollo.
