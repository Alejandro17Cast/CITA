begin;

-- Permite evitar períodos superpuestos para un mismo espacio.
create extension if not exists btree_gist;

create table public.reservaciones (
  id uuid primary key default gen_random_uuid(),

  cliente_id uuid not null
    references public.clientes(id),

  nombre_evento text not null
    check (char_length(trim(nombre_evento)) between 2 and 150),

  inicio timestamptz not null,
  fin timestamptz not null,

  cantidad_personas integer not null
    check (cantidad_personas > 0),

  quinta_completa boolean not null default false,

  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'confirmada', 'cancelada')),

  total numeric(12, 2) not null
    check (total >= 0),

  observaciones text
    check (
      observaciones is null
      or char_length(observaciones) <= 2000
    ),

  creado_por uuid not null default auth.uid()
    references auth.users(id),

  creado_en timestamptz not null default now(),

  check (
    isfinite(inicio)
    and isfinite(fin)
    and fin > inicio
  )
);

-- Espacios incluidos y precio acordado para cada uno.
create table public.reservacion_espacios (
  reservacion_id uuid not null
    references public.reservaciones(id),

  espacio_id uuid not null
    references public.espacios(id),

  importe numeric(12, 2) not null
    check (importe >= 0),

  primary key (reservacion_id, espacio_id)
);

-- Ocupación efectiva por reservas confirmadas o mantenimiento.
create table public.ocupaciones (
  id uuid primary key default gen_random_uuid(),

  espacio_id uuid not null
    references public.espacios(id),

  reservacion_id uuid
    references public.reservaciones(id),

  tipo text not null
    check (tipo in ('reservacion', 'mantenimiento')),

  inicio timestamptz not null,
  fin timestamptz not null,

  motivo text
    check (motivo is null or char_length(motivo) <= 1000),

  creado_por uuid not null default auth.uid()
    references auth.users(id),

  creado_en timestamptz not null default now(),

  check (
    isfinite(inicio)
    and isfinite(fin)
    and fin > inicio
  ),

  check (
    (tipo = 'reservacion' and reservacion_id is not null)
    or
    (tipo = 'mantenimiento' and reservacion_id is null)
  ),

  constraint impedir_ocupaciones_superpuestas
    exclude using gist (
      espacio_id with =,
      tstzrange(inicio, fin, '[)') with &&
    )
);

create index reservaciones_cliente_idx
on public.reservaciones(cliente_id);

create index reservacion_espacios_espacio_idx
on public.reservacion_espacios(espacio_id);

create index ocupaciones_reservacion_idx
on public.ocupaciones(reservacion_id);

alter table public.reservaciones enable row level security;
alter table public.reservacion_espacios enable row level security;
alter table public.ocupaciones enable row level security;

revoke all on public.reservaciones from anon, authenticated;
revoke all on public.reservacion_espacios from anon, authenticated;
revoke all on public.ocupaciones from anon, authenticated;

grant select on public.reservaciones to authenticated;
grant select on public.reservacion_espacios to authenticated;
grant select on public.ocupaciones to authenticated;

create policy "Personal activo consulta reservaciones"
on public.reservaciones
for select
to authenticated
using (
  exists (
    select 1 from public.perfiles
    where id = (select auth.uid())
      and activo = true
      and rol in ('administrador', 'encargado')
  )
);

create policy "Personal activo consulta detalle de reservas"
on public.reservacion_espacios
for select
to authenticated
using (
  exists (
    select 1 from public.perfiles
    where id = (select auth.uid())
      and activo = true
      and rol in ('administrador', 'encargado')
  )
);

create policy "Personal activo consulta ocupaciones"
on public.ocupaciones
for select
to authenticated
using (
  exists (
    select 1 from public.perfiles
    where id = (select auth.uid())
      and activo = true
      and rol in ('administrador', 'encargado')
  )
);

commit;