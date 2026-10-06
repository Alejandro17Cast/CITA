-- Perfiles vinculados a las cuentas de Supabase Auth.
create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '',
  rol text not null default 'encargado'
    check (rol in ('administrador', 'encargado')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- Activa la protección por filas.
alter table public.perfiles enable row level security;

-- Cada usuario solo puede consultar su propio perfil.
create policy "Consultar perfil propio"
on public.perfiles
for select
to authenticated
using (id = (select auth.uid()));

-- Permite consultar perfiles, pero no modificarlos desde la aplicación.
revoke all on public.perfiles from anon, authenticated;
grant select on public.perfiles to authenticated;

-- Crea un perfil cuando se registra una nueva cuenta.
create function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id)
  values (new.id);

  return new;
end;
$$;

revoke all on function public.crear_perfil() from public;

create trigger al_crear_usuario
after insert on auth.users
for each row
execute function public.crear_perfil();

-- Agrega los perfiles de las cuentas que ya existen.
insert into public.perfiles (id)
select id
from auth.users
on conflict (id) do nothing;