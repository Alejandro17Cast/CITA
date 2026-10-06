begin;

alter table public.reservaciones
  add column cancelado_en timestamptz,
  add column cancelado_por uuid references auth.users(id),
  add column motivo_cancelacion text;

alter table public.reservaciones
  add constraint datos_cancelacion_validos
  check (
    (
      estado = 'cancelada'
      and cancelado_en is not null
      and cancelado_por is not null
      and motivo_cancelacion is not null
      and char_length(trim(motivo_cancelacion)) between 5 and 1000
    )
    or
    (
      estado <> 'cancelada'
      and cancelado_en is null
      and cancelado_por is null
      and motivo_cancelacion is null
    )
  ) not valid;

-- La restricción se aplica a nuevos cambios.
-- NOT VALID permite conservar posibles cancelaciones antiguas
-- que todavía no tengan estos datos.

create function public.cancelar_reservacion(
  p_reservacion_id uuid,
  p_motivo text
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
begin
  select rol
  into v_rol
  from public.perfiles
  where id = v_usuario
    and activo = true
    and rol in ('administrador', 'encargado');

  if not found then
    raise exception 'No tenés permiso para cancelar reservaciones.';
  end if;

  if p_motivo is null
     or char_length(trim(p_motivo)) not between 5 and 1000 then
    raise exception 'Ingresá un motivo de entre 5 y 1000 caracteres.';
  end if;

  -- Usa el mismo bloqueo que registrar_pago.
  -- Un pago y una cancelación no pueden modificar
  -- esta reserva al mismo tiempo.
  select *
  into v_reserva
  from public.reservaciones
  where id = p_reservacion_id
  for update;

  if not found then
    raise exception 'La reservación no existe.';
  end if;

  if v_rol <> 'administrador' and exists (
    select 1
    from public.pagos
    where reservacion_id = p_reservacion_id
  ) then
    raise exception 'Una reserva con pagos solo puede cancelarla el administrador.';
  end if;

  -- Reintentar una cancelación ya completada no cambia su historial.
  if v_reserva.estado = 'cancelada' then
    return v_reserva.id;
  end if;

  update public.reservaciones
  set
    estado = 'cancelada',
    cancelado_en = now(),
    cancelado_por = v_usuario,
    motivo_cancelacion = trim(p_motivo)
  where id = p_reservacion_id;

  -- Libera los espacios; conserva la reserva y su detalle.
  delete from public.ocupaciones
  where reservacion_id = p_reservacion_id
    and tipo = 'reservacion';

  return p_reservacion_id;
end;
$$;

revoke all on function public.cancelar_reservacion(
  uuid, text
) from public, anon;

grant execute on function public.cancelar_reservacion(
  uuid, text
) to authenticated;

commit;