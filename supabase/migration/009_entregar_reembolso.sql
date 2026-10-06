begin;

create function public.entregar_reembolso(
  p_reembolso_id uuid,
  p_metodo text,
  p_referencia text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_reembolso public.reembolsos%rowtype;
  v_referencia text := nullif(trim(p_referencia), '');
begin
  -- Solo un administrador activo puede registrar la entrega.
  if v_usuario is null or not exists (
    select 1
    from public.perfiles
    where id = v_usuario
      and activo = true
      and rol = 'administrador'
  ) then
    raise exception 'Solo el administrador puede registrar la entrega del reembolso.';
  end if;

  if p_metodo is null
     or p_metodo not in ('efectivo', 'transferencia') then
    raise exception 'Seleccioná un método de devolución válido.';
  end if;

  if char_length(v_referencia) > 150 then
    raise exception 'La referencia no puede superar 150 caracteres.';
  end if;

  if p_metodo = 'transferencia'
     and v_referencia is null then
    raise exception 'Ingresá la referencia de la transferencia.';
  end if;

  -- Impide registrar dos entregas simultáneas del mismo reembolso.
  select *
  into v_reembolso
  from public.reembolsos
  where id = p_reembolso_id
  for update;

  if not found then
    raise exception 'El reembolso no existe.';
  end if;

  -- Un reintento idéntico conserva la entrega original.
  if v_reembolso.estado = 'entregado' then
    if v_reembolso.metodo = p_metodo
       and v_reembolso.referencia is not distinct from v_referencia then
      return v_reembolso.id;
    end if;

    raise exception 'Este reembolso ya fue entregado con otros datos.';
  end if;

  if v_reembolso.estado <> 'pendiente'
     or v_reembolso.monto <= 0 then
    raise exception 'Este registro no tiene una devolución pendiente.';
  end if;

  if not exists (
    select 1
    from public.reservaciones
    where id = v_reembolso.reservacion_id
      and estado = 'cancelada'
  ) then
    raise exception 'La reservación debe estar cancelada.';
  end if;

  update public.reembolsos
  set
    estado = 'entregado',
    entregado_por = v_usuario,
    entregado_en = now(),
    metodo = p_metodo,
    referencia = v_referencia
  where id = p_reembolso_id;

  return p_reembolso_id;
end;
$$;

revoke all on function public.entregar_reembolso(
  uuid, text, text
) from public, anon;

grant execute on function public.entregar_reembolso(
  uuid, text, text
) to authenticated;

create index reembolsos_entregados_fecha_idx
on public.reembolsos(entregado_en)
where estado = 'entregado';

commit;