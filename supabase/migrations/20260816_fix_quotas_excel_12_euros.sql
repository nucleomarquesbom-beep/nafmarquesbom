-- 20260816: align annual quota Excel import/export with the canonical 12 EUR annual quota.
-- Keeps the existing quotas table and its four-state constraint unchanged.
-- The Excel workflow stores outstanding historical annual quotas as 'pendente',
-- which is one of the existing allowed states.

drop function if exists public.admin_importar_divida_anual_excel(jsonb, integer);
drop function if exists public.admin_exportar_divida_anual_excel(integer);

create function public.admin_importar_divida_anual_excel(
  p_rows jsonb,
  p_ano_inicial integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  r jsonb;
  v_numero integer;
  v_nome text;
  v_divida numeric;
  v_anos integer;
  v_socio_id uuid;
  v_ano_base integer := coalesce(p_ano_inicial, extract(year from current_date)::integer);
  v_linhas integer := 0;
  v_quotas integer := 0;
  i integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem importar quotas em dívida';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'O Excel não contém linhas válidas';
  end if;

  if jsonb_array_length(p_rows) > 10000 then
    raise exception 'Máximo de 10.000 linhas';
  end if;

  if v_ano_base < 2000 or v_ano_base > 2100 then
    raise exception 'Ano inicial inválido';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_linhas := v_linhas + 1;
    v_numero := nullif(trim(r->>'numero_socio'), '')::integer;
    v_nome := nullif(trim(r->>'nome'), '');
    v_divida := nullif(replace(trim(coalesce(r->>'valor_divida','')), ',', '.'), '')::numeric;

    if v_numero is null or v_numero <= 0 then
      raise exception 'Linha %: Nº Sócio inválido', v_linhas;
    end if;

    if v_nome is null then
      raise exception 'Linha %: Nome é obrigatório', v_linhas;
    end if;

    if v_divida is null or v_divida <= 0 then
      raise exception 'Linha %: Valor em dívida inválido', v_linhas;
    end if;

    if mod(v_divida, 12) <> 0 then
      raise exception 'Linha %: O valor em dívida tem de ser múltiplo de 12 €', v_linhas;
    end if;

    select id into v_socio_id
      from public.socios
     where numero_socio = v_numero
     limit 1;

    if v_socio_id is null then
      raise exception 'Linha %: O Nº Sócio % não existe', v_linhas, v_numero;
    end if;

    v_anos := (v_divida / 12)::integer;

    for i in 1..v_anos loop
      insert into public.quotas(
        socio_id, ano, mes, valor, pago, data_pagamento, observacoes, estado
      )
      values(
        v_socio_id,
        v_ano_base-(i-1),
        12,
        12,
        false,
        null,
        'Importado por Excel como dívida anual de quota',
        'pendente'
      )
      on conflict(socio_id, ano, mes) do update
        set valor = 12,
            pago = false,
            data_pagamento = null,
            observacoes = 'Importado por Excel como dívida anual de quota',
            estado = 'pendente';

      v_quotas := v_quotas + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'linhas_excel', v_linhas,
    'quotas_geradas', v_quotas,
    'ano_inicial', v_ano_base,
    'valor_quota_anual', 12
  );
end;
$$;

create function public.admin_exportar_divida_anual_excel(
  p_ano_inicial integer default null
)
returns table(
  numero_socio integer,
  nome text,
  valor_divida_total numeric
)
language sql
security definer
set search_path=public
as $$
  select
    s.numero_socio,
    s.nome,
    coalesce(sum(q.valor),0)::numeric
  from public.socios s
  join public.quotas q on q.socio_id=s.id
  where public.is_admin()
    and q.pago=false
    and q.estado='pendente'
    and q.mes=12
    and q.valor=12
    and q.ano<=coalesce(
      p_ano_inicial,
      extract(year from current_date)::integer
    )
  group by s.numero_socio,s.nome
  having coalesce(sum(q.valor),0)>0
  order by s.numero_socio;
$$;

revoke all on function public.admin_importar_divida_anual_excel(jsonb, integer) from public, anon;
grant execute on function public.admin_importar_divida_anual_excel(jsonb, integer) to authenticated;

revoke all on function public.admin_exportar_divida_anual_excel(integer) from public, anon;
grant execute on function public.admin_exportar_divida_anual_excel(integer) to authenticated;
