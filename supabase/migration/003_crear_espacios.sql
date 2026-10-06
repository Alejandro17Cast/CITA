begin;

create table public.espacios (
  id uuid primary key default gen_random_uuid(),

  nombre text not null
    check (char_length(trim(nombre)) between 2 and 100),

  tipo text not null
    check (tipo in ('habitacion', 'salon', 'cancha', 'area')),

  capacidad integer not null
    check (capacidad > 0),

  tarifa numeric(12, 2) not null
    check (tarifa >= 0),

  unidad_tarifa text not null
    check (unidad_tarifa in ('hora', 'dia', 'noche', 'evento')),

  descripcion text
    check (
      descripcion is null
      or char_length(descripcion) <= 2000
    ),

  activo boolean not null default true,

  creado_por uuid not null default auth.uid()
    references auth.users(id),

  creado_en timestamptz not null default now()
);

-- Evita nombres repetidos, ignorando mayúsculas y espacios exteriores.
create unique index espacios_nombre_unico
on public.espacios (lower(trim(nombre)));

alter table public.espacios enable row level security;

revoke all on public.espacios from anon, authenticated;

grant select, insert on public.espacios to authenticated;

-- El personal activo puede consultar los espacios.
create policy "Personal activo consulta espacios"
on public.espacios
for select
to authenticated
using (
  exists (
    select 1
    from public.perfiles
    where id = (select auth.uid())
      and activo = true
      and rol in ('administrador', 'encargado')
  )
);

-- Solo el administrador activo puede registrar espacios y tarifas.
create policy "Administrador registra espacios"
on public.espacios
for insert
to authenticated
with check (
  creado_por = (select auth.uid())
  and exists (
    select 1
    from public.perfiles
    where id = (select auth.uid())
      and activo = true
      and rol = 'administrador'
  )
);

commit;