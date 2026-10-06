begin;

create function public.crear_reservacion(
  p_cliente_id uuid,
  p_nombre_evento text,
  p_inicio timestamptz,
  p_fin timestamptz,
  p_cantidad_personas integer,
  p_quinta_completa boolean,
  p_detalles jsonb,
  p_observaciones text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_reservacion uuid;
  v_total numeric;
  v_cantidad integer;
  v_unicos integer;
begin
  -- Comprueba el usuario y sus permisos.
  if v_usuario is null or not exists (
    select 1
    from public.perfiles
    where id = v_usuario
      and activo = true
      and rol in ('administrador', 'encargado')
  ) then
    raise exception 'No tenés permiso para registrar reservaciones.';
  end if;

  if p_nombre_evento is null
     or char_length(trim(p_nombre_evento)) not between 2 and 150 then
    raise exception 'Ingresá un nombre de evento válido.';
  end if;

  if p_inicio is null or p_fin is null
     or not isfinite(p_inicio)
     or not isfinite(p_fin)
     or p_fin <= p_inicio then
    raise exception 'El período de la reserva no es válido.';
  end if;

  if p_cantidad_personas is null or p_cantidad_personas < 1 then
    raise exception 'La cantidad de personas debe ser mayor que cero.';
  end if;

  if p_quinta_completa is null then
    raise exception 'Indicá si se reserva la quinta completa.';
  end if;

  if p_observaciones is not null
     and char_length(p_observaciones) > 2000 then
    raise exception 'Las observaciones son demasiado largas.';
  end if;

  if not exists (
    select 1 from public.clientes
    where id = p_cliente_id
  ) then
    raise exception 'El cliente seleccionado no existe.';
  end if;

  if p_detalles is null
     or jsonb_typeof(p_detalles) <> 'array' then
    raise exception 'La lista de espacios no es válida.';
  end if;

  if jsonb_array_length(p_detalles) = 0 then
    raise exception 'Seleccioná al menos un espacio.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_detalles) as item
    where jsonb_typeof(item) <> 'object'
  ) then
    raise exception 'El detalle de los espacios no es válido.';
  end if;

  select
    count(*),
    count(distinct d.espacio_id),
    sum(d.importe)
  into v_cantidad, v_unicos, v_total
  from jsonb_to_recordset(p_detalles)
    as d(espacio_id uuid, importe numeric);

  if v_cantidad <> v_unicos then
    raise exception 'Hay espacios repetidos o sin identificar.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_detalles)
      as d(espacio_id uuid, importe numeric)
    where d.importe is null
       or d.importe < 0
       or d.importe > 9999999999.99
       or d.importe <> round(d.importe, 2)
  ) then
    raise exception 'Los importes deben ser válidos y tener hasta dos decimales.';
  end if;

  if v_total is null or v_total > 9999999999.99 then
    raise exception 'El total de la reserva supera el límite permitido.';
  end if;

  -- Bloquea los registros del catálogo durante esta operación.
  perform e.id
  from public.espacios e
  order by e.id
  for share;

  if exists (
    select 1
    from jsonb_to_recordset(p_detalles)
      as d(espacio_id uuid, importe numeric)
    left join public.espacios e on e.id = d.espacio_id
    where e.id is null or e.activo = false
  ) then
    raise exception 'Algún espacio no existe o está inactivo.';
  end if;

  if p_quinta_completa and exists (
    select 1
    from public.espacios e
    where e.activo = true
      and not exists (
        select 1
        from jsonb_to_recordset(p_detalles)
          as d(espacio_id uuid, importe numeric)
        where d.espacio_id = e.id
      )
  ) then
    raise exception 'La quinta completa debe incluir todos los espacios activos.';
  end if;

  if exists (
    select 1
    from public.ocupaciones o
    join jsonb_to_recordset(p_detalles)
      as d(espacio_id uuid, importe numeric)
      on d.espacio_id = o.espacio_id
    where tstzrange(o.inicio, o.fin, '[)')
       && tstzrange(p_inicio, p_fin, '[)')
  ) then
    raise exception 'Algún espacio está ocupado durante ese período.';
  end if;

  insert into public.reservaciones (
    cliente_id,
    nombre_evento,
    inicio,
    fin,
    cantidad_personas,
    quinta_completa,
    total,
    observaciones,
    creado_por
  )
  values (
    p_cliente_id,
    trim(p_nombre_evento),
    p_inicio,
    p_fin,
    p_cantidad_personas,
    p_quinta_completa,
    v_total,
    nullif(trim(p_observaciones), ''),
    v_usuario
  )
  returning id into v_reservacion;

  insert into public.reservacion_espacios (
    reservacion_id,
    espacio_id,
    importe
  )
  select
    v_reservacion,
    d.espacio_id,
    d.importe
  from jsonb_to_recordset(p_detalles)
    as d(espacio_id uuid, importe numeric);

  return v_reservacion;
end;
$$;

revoke all on function public.crear_reservacion(
  uuid, text, timestamptz, timestamptz,
  integer, boolean, jsonb, text
) from public, anon;

grant execute on function public.crear_reservacion(
  uuid, text, timestamptz, timestamptz,
  integer, boolean, jsonb, text
) to authenticated;

commit;