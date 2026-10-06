begin;

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null
    check (char_length(trim(nombre)) between 2 and 150),
  telefono text not null
    check (char_length(trim(telefono)) between 8 and 25),
  correo text
    check (correo is null or char_length(correo) <= 254),
  observaciones text
    check (
      observaciones is null
      or char_length(observaciones) <= 2000
    ),
  creado_por uuid not null default auth.uid()
    references auth.users(id),
  creado_en timestamptz not null default now()
);

alter table public.clientes enable row level security;

revoke all on public.clientes from anon, authenticated;

grant select, insert on public.clientes to authenticated;

-- Administradores y encargados activos pueden consultar clientes.
create policy "Personal activo consulta clientes"
on public.clientes
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

-- Cada registro debe quedar asociado al usuario que lo creó.
create policy "Personal activo registra clientes"
on public.clientes
for insert
to authenticated
with check (
  creado_por = (select auth.uid())
  and exists (
    select 1
    from public.perfiles
    where id = (select auth.uid())
      and activo = true
      and rol in ('administrador', 'encargado')
  )
);

commit;