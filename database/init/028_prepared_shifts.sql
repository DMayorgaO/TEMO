-- Permite preparar arqueos y saldos antes de que el cajero abra formalmente el turno.
SET search_path TO temo, public;

ALTER TYPE estado_turno ADD VALUE IF NOT EXISTS 'PENDIENTE_APERTURA' BEFORE 'ABIERTO';

