begin;

create table public.reembolsos (
  id uuid primary key default gen_random_uuid(),

  reservacion_id uuid not null unique
    references public.reservaciones(id),

  tipo text not null
    check (tipo in ('ninguno', 'total', 'porcentaje', 'monto')),

  valor numeric(12, 2) not null
    check (valor >= 0 and valor <= 9999999999.99),

  total_pagado numeric(12, 2) not null
    check (total_pagado >= 0 and total_pagado <= 9999999999.99),

  monto numeric(12, 2) not null
    check (monto >= 0 and monto <= total_pagado),

  motivo text not null
    check (char_length(trim(motivo)) between 5 and 1000),

  estado text not null
    check (estado in ('no_aplica', 'pendiente', 'entregado')),

  autorizado_por uuid not null references auth.users(id),
  autorizado_en timestamptz not null default now(),

  entregado_por uuid references auth.users(id),
  entregado_en timestamptz,

  metodo text
    check (metodo in ('efectivo', 'transferencia')),

  referencia text
    check (
      referencia is null
      or char_length(referencia) <= 150
    ),

  check (
    (monto = 0 and estado = 'no_aplica')
    or
    (monto > 0 and estado in ('pendiente', 'entregado'))
  ),

  check (
    (
      estado = 'entregado'
      and entregado_por is not null
      and entregado_en is not null
      and metodo is not null
      and (
        metodo = 'efectivo'
        or nullif(trim(referencia), '') is not null
      )
    )
    or
    (
      estado <> 'entregado'
      and entregado_por is null
      and entregado_en is null
      and metodo is null
      and referencia is null
    )
  )
);

alter table public.reembolsos enable row level security;

revoke all on public.reembolsos from anon, authenticated;
grant select on public.reembolsos to authenticated;

create policy "Personal activo consulta reembolsos"
on public.reembolsos
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

create function public.cancelar_con_reembolso(
  p_reservacion_id uuid,
  p_motivo text,
  p_tipo text,
  p_valor numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_rol text;
  v_reserva public.reservaciones%rowtype;
  v_pagado numeric;
  v_monto numeric;
  v_id uuid;
begin
  select rol
  into v_rol
  from public.perfiles
  where id = v_usuario
    and activo = true
    and rol in ('administrador', 'encargado');

  if not found then
    raise exception 'No tenés permiso para realizar esta operación.';
  end if;

  if p_motivo is null
     or char_length(trim(p_motivo)) not between 5 and 1000 then
    raise exception 'Ingresá un motivo de entre 5 y 1000 caracteres.';
  end if;

  if p_tipo is null
     or p_tipo not in ('ninguno', 'total', 'porcentaje', 'monto') then
    raise exception 'Seleccioná una opción de reembolso válida.';
  end if;

  if p_valor is null
     or not (p_valor >= 0 and p_valor <= 9999999999.99)
     or p_valor <> round(p_valor, 2) then
    raise exception 'El valor debe ser válido y tener hasta dos decimales.';
  end if;

  select *
  into v_reserva
  from public.reservaciones
  where id = p_reservacion_id
  for update;

  if not found then
    raise exception 'La reservación no existe.';
  end if;

  if exists (
    select 1
    from public.reembolsos
    where reservacion_id = p_reservacion_id
  ) then
    raise exception 'Esta reserva ya tiene una decisión de reembolso registrada.';
  end if;

  select coalesce(sum(monto), 0)
  into v_pagado
  from public.pagos
  where reservacion_id = p_reservacion_id;

  -- Las decisiones sobre dinero recibido corresponden al administrador.
  if v_rol <> 'administrador'
     and (v_pagado > 0 or p_tipo <> 'ninguno') then
    raise exception 'La decisión de reembolso requiere un administrador.';
  end if;

  if p_tipo = 'ninguno' then
    if p_valor <> 0 then
      raise exception 'Sin reembolso debe tener valor cero.';
    end if;
    v_monto := 0;

  elsif p_tipo = 'total' then
    if p_valor <> 0 then
      raise exception 'La devolución total se calcula automáticamente.';
    end if;
    v_monto := v_pagado;

  elsif p_tipo = 'porcentaje' then
    if p_valor <= 0 or p_valor > 100 then
      raise exception 'El porcentaje debe ser mayor que cero y hasta 100.';
    end if;
    v_monto := round(v_pagado * p_valor / 100, 2);

  else
    if p_valor <= 0 then
      raise exception 'El monto de devolución debe ser positivo.';
    end if;
    v_monto := p_valor;
  end if;

  if p_tipo <> 'ninguno' and v_monto <= 0 then
    raise exception 'No hay un importe positivo para devolver.';
  end if;

  if v_monto > v_pagado then
    raise exception 'El reembolso no puede superar lo pagado.';
  end if;

  -- Cancela y libera espacios usando la operación existente.
  -- Si algo falla después, también se revierte esta cancelación.
  perform public.cancelar_reservacion(
    p_reservacion_id,
    p_motivo
  );

  insert into public.reembolsos (
    reservacion_id,
    tipo,
    valor,
    total_pagado,
    monto,
    motivo,
    estado,
    autorizado_por
  )
  values (
    p_reservacion_id,
    p_tipo,
    p_valor,
    v_pagado,
    v_monto,
    trim(p_motivo),
    case when v_monto = 0 then 'no_aplica' else 'pendiente' end,
    v_usuario
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.cancelar_con_reembolso(
  uuid, text, text, numeric
) from public, anon;

grant execute on function public.cancelar_con_reembolso(
  uuid, text, text, numeric
) to authenticated;

commit;