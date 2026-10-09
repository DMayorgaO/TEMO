-- Login and recovery compare identities without case sensitivity.
-- Existing collisions require human review; never merge or delete accounts here.
do $$
begin
  if exists (select lower(usuario) from temo.usuarios group by lower(usuario) having count(*) > 1)
    or exists (select lower(correo) from temo.usuarios
      where correo is not null and btrim(correo) <> ''
      group by lower(correo) having count(*) > 1) then
    raise exception 'Existen usuarios o correos duplicados sin distinguir mayusculas. Revise las identidades antes de continuar.';
  end if;
end $$;

create unique index if not exists usuarios_usuario_normalizado_unique
  on temo.usuarios (lower(usuario));
create unique index if not exists usuarios_correo_normalizado_unique
  on temo.usuarios (lower(correo)) where correo is not null and btrim(correo) <> '';
