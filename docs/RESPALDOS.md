# Respaldo y restauracion de TEMO

## Crear un respaldo de produccion

1. Ejecute `Respaldar Supabase.bat` (usa las herramientas PostgreSQL instaladas).
3. El resultado se guarda en `backups/production` con su checksum y manifiesto.
4. Copie los tres archivos a almacenamiento cifrado fuera del equipo.

Los respaldos contienen datos financieros y personales. Nunca deben enviarse
por correo sin cifrar ni agregarse a Git.

## Probar que el respaldo funciona

1. Ejecute `Probar Restauracion.bat` y pegue la ruta del `.dump`.
3. El script valida el checksum, restaura en la base local temporal
   aislada, comprueba tablas y usuarios, detiene el servidor y elimina sus archivos.

Este procedimiento no sobrescribe la base local `temo` ni la base de Supabase.
Una restauracion real en produccion debe autorizarse expresamente,
documentar el incidente y realizar antes un respaldo del estado actual.

## Programacion semanal

`Configurar Respaldo Semanal.bat` crea una tarea de Windows para cada domingo a
las 8:00 p. m. Los respaldos locales se conservan 90 dias y los resultados se
registran en `logs/backups`. El equipo debe estar encendido y conectado a
internet en ese momento. Ademas, conserve una copia externa cifrada.

## Separacion de desarrollo

- `main` corresponde al codigo desplegado en produccion.
- `develop` corresponde al trabajo de desarrollo y usa la base PostgreSQL local
  definida en `config/environments/development.env.example`.
- Las credenciales de produccion se conservan unicamente en `.env.production`,
  que esta excluido de Git.
- Para probar reportes con datos reales, restaure una copia del respaldo en una
  base local aislada. No conecte el backend de desarrollo directamente a
  Supabase con credenciales de escritura.
