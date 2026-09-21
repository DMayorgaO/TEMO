# Despliegue de produccion de TEMO en Render

## Crear el servicio

1. Integre en `main` solamente cambios verificados desde `develop`.
2. Ingrese a Render y seleccione **New > Blueprint**.
3. Conecte el repositorio `DMayorgaO/TEMO`.
4. Render detectara `render.yaml` y mostrara el servicio `temo-api`.
5. Complete las variables marcadas como secretas y aplique el Blueprint.

## Variables secretas

### `DATABASE_URL`

Use la URI de Supabase de **Connect > Session pooler > URI**. Sustituya
`[YOUR-PASSWORD]` por la contrasena real de la base de datos. Si contiene
caracteres reservados en una URL, deben estar codificados.

### `DATABASE_SSL_CA_BASE64`

En PowerShell, desde la raiz del proyecto, obtenga el valor con:

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes((Resolve-Path '.certificates/supabase-ca.crt'))
)
```

Pegue solamente la cadena resultante en Render.

### `CORS_ORIGINS`

Durante la primera comprobacion puede usar la direccion local exacta del
frontend, por ejemplo `http://192.168.1.20:5173`. Cuando el frontend quede
desplegado, reemplacela por su URL HTTPS publica. Para mas de un origen,
separe los valores con comas.

## Comprobacion

Cuando Render muestre **Live**, abra:

```text
https://temo-api.onrender.com/api/health
```

El subdominio concreto puede variar si el nombre ya esta ocupado. La respuesta
debe indicar que tanto la API como la base de datos estan disponibles.

No ejecute las migraciones como parte del arranque. El esquema de Supabase ya
esta creado y las siguientes migraciones deben aplicarse de forma controlada.

`main` despliega produccion automaticamente. La rama `develop` no debe asociarse
a estos servicios ni utilizar las credenciales de la base productiva.

## Desplegar el frontend

El mismo `render.yaml` tambien declara el sitio estatico `temo-web`. En la
pagina del Blueprint seleccione **Manual Sync** despues de publicar el cambio.
Render compilara React/Vite y publicara `frontend/dist` en su CDN.

Cuando `temo-web` este disponible, copie su URL HTTPS y agreguela a la variable
`CORS_ORIGINS` del servicio `temo-api`. Si conserva otros origenes de prueba,
separe las direcciones con comas. Guarde la variable con la opcion de desplegar
el servicio nuevamente.

Finalmente compruebe el inicio de sesion desde la URL publica del frontend.
