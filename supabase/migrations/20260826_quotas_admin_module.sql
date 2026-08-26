-- NAF Marques Bom — módulo administrativo de quotas
-- Cria quotas anuais de 12 € sem duplicar registos existentes.
-- Pode ser usado para todos os sócios ativos ou para uma lista de sócios.

create or replace function public.admin_gerar_quotas_anuais(
  p_ano integer,
  p_valor numeric default 12.00,
  p_socio_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_created integer := 0;
  v_existing integer := 0;
  v_id uuid;
  v_target_ids uuid[];
  v_exists boolean;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem gerar quotas.';
  end if;

  if p_ano < 2000 or p_ano > 2100 then
    raise exception 'Ano inválido.';
  end if;

  if p_valor is null or p_valor <= 0 then
    raise exception 'Valor de quota inválido.';
  end if;

  if p_socio_ids is null then
    select coalesce(array_agg(id), '{}') into v_target_ids
    from public.socios
    where ativo = true;
  else
    select coalesce(array_agg(s.id), '{}') into v_target_ids
    from public.socios s
    where s.ativo = true
      and s.id = any(p_socio_ids);
  end if;

  foreach v_id in array v_target_ids loop
    v_total := v_total + 1;

    select exists(
      select 1
      from public.quotas q
      where q.socio_id = v_id
        and q.ano = p_ano
        and q.mes = 12
    ) into v_exists;

    if v_exists then
      v_existing := v_existing + 1;
    else
      insert into public.quotas(
        socio_id, ano, mes, valor, pago, data_pagamento, observacoes, estado
      ) values (
        v_id, p_ano, 12, round(p_valor, 2), false, null,
        'Quota anual gerada pela administração.', 'pendente'
      );
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'ano', p_ano,
    'valor', round(p_valor, 2),
    'socios_processados', v_total,
    'quotas_geradas', v_created,
    'ja_existiam', v_existing
  );
end;
$$;

revoke all on function public.admin_gerar_quotas_anuais(integer,numeric,uuid[]) from public, anon;
grant execute on function public.admin_gerar_quotas_anuais(integer,numeric,uuid[]) to authenticated;
