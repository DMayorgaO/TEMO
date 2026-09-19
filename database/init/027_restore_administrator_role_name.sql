SET search_path TO temo, public;

-- Conserva JEFA como codigo interno y restaura el nombre visible administrado desde el catalogo.
UPDATE roles
SET nombre = 'Administrador',
    descripcion = 'Acceso completo al sistema, usuarios, comisiones y cierres.'
WHERE codigo = 'JEFA';
