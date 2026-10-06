begin;

create table public.pagos (
  id uuid primary key default gen_random_uuid(),

  reservacion_id uuid not null
    references public.reservaciones(id),

  monto numeric(12, 2) not null
    check (monto > 0 and monto <= 9999999999.99),

  metodo text not null
    check (metodo in ('efectivo', 'transferencia')),

  referencia text
    check (
      referencia is null
      or char_length(referencia) <= 150
    ),

  observaciones text
    check (
      observaciones is null
      or char_length(observaciones) <= 1000
    ),

  solicitud_id uuid not null unique,

  registrado_por uuid not null default auth.uid()
    references auth.users(id),

  registrado_en timestamptz not null default now(),

  check (
    metodo <> 'transferencia'
    or (
      referencia is not null
      and char_length(trim(referencia)) > 0
    )
  )
);

create index pagos_reservacion_idx
on public.pagos(reservacion_id);

alter table public.pagos enable row level security;

revoke all on public.pagos from anon, authenticated;
grant select on public.pagos to authenticated;

create policy "Personal activo consulta pagos"
on public.pagos
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

create function public.registrar_pago(
  p_reservacion_id uuid,
  p_monto numeric,
  p_metodo text,
  p_solicitud_id uuid,
  p_referencia text default null,
  p_observaciones text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_reserva public.reservaciones%rowtype;
  v_pago public.pagos%rowtype;
  v_pago_id uuid;
  v_pagado numeric;
begin
  if v_usuario is null or not exists (
    select 1
    from public.perfiles
    where id = v_usuario
      and activo = true
      and rol in ('administrador', 'encargado')
  ) then
    raise exception 'No tenés permiso para registrar pagos.';
  end if;

  if p_solicitud_id is null then
    raise exception 'Falta el identificador de la operación.';
  end if;

  if p_monto is null
     or not (p_monto > 0 and p_monto <= 9999999999.99)
     or p_monto <> round(p_monto, 2) then
    raise exception 'Ingresá un monto positivo con hasta dos decimales.';
  end if;

  if p_metodo is null
     or p_metodo not in ('efectivo', 'transferencia') then
    raise exception 'Seleccioná un método de pago válido.';
  end if;

  if p_metodo = 'transferencia'
     and nullif(trim(p_referencia), '') is null then
    raise exception 'Ingresá la referencia de la transferencia.';
  end if;

  if char_length(p_referencia) > 150
     or char_length(p_observaciones) > 1000 then
    raise exception 'La referencia o las observaciones son demasiado largas.';
  end if;

  -- Serializa los pagos de esta reserva para proteger el saldo.
  select *
  into v_reserva
  from public.reservaciones
  where id = p_reservacion_id
  for update;

  if not found then
    raise exception 'La reservación no existe.';
  end if;

  -- Un reintento de la misma operación no duplica el pago.
  select *
  into v_pago
  from public.pagos
  where solicitud_id = p_solicitud_id;

  if found then
    if v_pago.reservacion_id = p_reservacion_id
       and v_pago.registrado_por = v_usuario
       and v_pago.monto = p_monto
       and v_pago.metodo = p_metodo
       and v_pago.referencia is not distinct from
         nullif(trim(p_referencia), '')
       and v_pago.observaciones is not distinct from
         nullif(trim(p_observaciones), '') then
      return v_pago.id;
    end if;

    raise exception 'El identificador corresponde a otra operación.';
  end if;

  if v_reserva.estado = 'cancelada' then
    raise exception 'No se pueden registrar pagos en una reserva cancelada.';
  end if;

  select coalesce(sum(monto), 0)
  into v_pagado
  from public.pagos
  where reservacion_id = p_reservacion_id;

  if p_monto > v_reserva.total - v_pagado then
    raise exception 'El pago supera el saldo pendiente.';
  end if;

  if v_reserva.estado = 'pendiente' then
    -- Mantiene estable el catálogo mientras se confirma.
    perform e.id
    from public.espacios e
    order by e.id
    for share;

    if not exists (
      select 1
      from public.reservacion_espacios
      where reservacion_id = p_reservacion_id
    ) then
      raise exception 'La reserva no tiene espacios incluidos.';
    end if;

    if exists (
      select 1
      from public.reservacion_espacios d
      join public.espacios e on e.id = d.espacio_id
      where d.reservacion_id = p_reservacion_id
        and e.activo = false
    ) then
      raise exception 'La reserva incluye un espacio inactivo.';
    end if;

    if v_reserva.quinta_completa and exists (
      select 1
      from public.espacios e
      where e.activo = true
        and not exists (
          select 1
          from public.reservacion_espacios d
          where d.reservacion_id = p_reservacion_id
            and d.espacio_id = e.id
        )
    ) then
      raise exception 'El catálogo cambió. Revisá los espacios de la quinta completa.';
    end if;

    -- La restricción de ocupaciones impide cruces,
    -- incluso si otra reserva se confirma simultáneamente.
    insert into public.ocupaciones (
      espacio_id,
      reservacion_id,
      tipo,
      inicio,
      fin,
      creado_por
    )
    select
      espacio_id,
      p_reservacion_id,
      'reservacion',
      v_reserva.inicio,
      v_reserva.fin,
      v_usuario
    from public.reservacion_espacios
    where reservacion_id = p_reservacion_id
    order by espacio_id;

    update public.reservaciones
    set estado = 'confirmada'
    where id = p_reservacion_id;
  end if;

  insert into public.pagos (
    reservacion_id,
    monto,
    metodo,
    referencia,
    observaciones,
    solicitud_id,
    registrado_por
  )
  values (
    p_reservacion_id,
    p_monto,
    p_metodo,
    nullif(trim(p_referencia), ''),
    nullif(trim(p_observaciones), ''),
    p_solicitud_id,
    v_usuario
  )
  returning id into v_pago_id;

  return v_pago_id;

exception
  when exclusion_violation then
    raise exception 'Un espacio ya está ocupado. No se registró el pago ni se confirmó la reserva.';
end;
$$;

revoke all on function public.registrar_pago(
  uuid, numeric, text, uuid, text, text
) from public, anon;

grant execute on function public.registrar_pago(
  uuid, numeric, text, uuid, text, text
) to authenticated;

commit;