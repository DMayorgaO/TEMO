-- Almacena una fotografia compacta por usuario para mostrarla en cualquier dispositivo.
SET search_path TO temo, public;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS foto_perfil TEXT;

