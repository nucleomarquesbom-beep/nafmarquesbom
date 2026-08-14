-- Quotas anuais por Excel: dívida total em múltiplos de 12 €.
-- A distribuição começa no ano definido (por omissão, ano atual) e recua 1 ano por cada 12 €.

create or replace function public.admin_importar_divida_anual_excel(
  p_rows jsonb,
  p_ano_inicial integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_numero integer;
  v_nome text;
  v_divida numeric;
  v_anos integer;
  v_socio_id uuid;
  v_ano_base integer := coalesce(p_ano_inicial, extract(year from current_date)::integer);
  v_cont integer := 0;
  v_quotas integer := 0;
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

  for r in select value from jsonb_array_elements(p_rows)
  loop
    v_cont := v_cont + 1;

    v_numero := nullif(trim(r->>'numero_socio'),'')::integer;
    v_nome := nullif(trim(r->>'nome'),'');
    v_divida := nullif(replace(trim(coalesce(r->>'valor_divida','')),',','.'),'')::numeric;

    if v_numero is null or v_numero <= 0 then
      raise exception 'Linha %: Nº Sócio inválido', v_cont;
    end if;

    if v_nome is null then
      raise exception 'Linha %: Nome é obrigatório', v_cont;
    end if;

    if v_divida is null or v_divida <= 0 then
      raise exception 'Linha %: Valor em dívida inválido', v_cont;
    end if;

    if mod(v_divida, 12) <> 0 then
      raise exception 'Linha %: O valor em dívida tem de ser múltiplo de 12 €', v_cont;
    end if;

    select id into v_socio_id
      from public.socios
     where numero_socio = v_numero
     limit 1;

    if v_socio_id is null then
      raise exception 'Linha %: O Nº Sócio % não existe', v_cont, v_numero;
    end if;

    v_anos := (v_divida / 12)::integer;

    for v_ano in 1..v_anos loop
      -- Cada quota anual é representada na tabela com mes=12 e valor=12 €.
      insert into public.quotas (
        socio_id, ano, mes, valor, pago, data_pagamento,
        observacoes, estado
      )
      values (
        v_socio_id,
        v_ano_base - (v_ano - 1),
        12,
        12,
        false,
        null,
        'Importado por Excel como dívida anual de quota',
        'em_atraso'
      )
      on conflict (socio_id, ano, mes) do update
        set valor = excluded.valor,
            pago = false,
            data_pagamento = null,
            observacoes = excluded.observacoes,
            estado = 'em_atraso';

      v_quotas := v_quotas + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'linhas_excel', v_cont,
    'quotas_geradas', v_quotas,
    'ano_inicial', v_ano_base
  );
end;
$$;

revoke all on function public.admin_importar_divida_anual_excel(jsonb, integer) from public, anon;
grant execute on function public.admin_importar_divida_anual_excel(jsonb, integer) to authenticated;


create or replace function public.admin_exportar_divida_anual_excel(
  p_ano_inicial integer default null
)
returns table (
  numero_socio integer,
  nome text,
  valor_divida_total numeric
)
language sql
security definer
set search_path = public
as $$
  select
    s.numero_socio,
    s.nome,
    coalesce(sum(q.valor),0)::numeric as valor_divida_total
  from public.socios s
  join public.quotas q on q.socio_id = s.id
  where public.is_admin()
    and q.pago = false
    and lower(coalesce(q.estado,'em_atraso')) in (
      'em_atraso','pendente','nao_paga','não_paga'
    )
    and q.mes = 12
    and q.valor = 12
    and q.ano <= coalesce(p_ano_inicial, extract(year from current_date)::integer)
  group by s.numero_socio, s.nome
  having coalesce(sum(q.valor),0) > 0
  order by s.numero_socio;
$$;

revoke all on function public.admin_exportar_divida_anual_excel(integer) from public, anon;
grant execute on function public.admin_exportar_divida_anual_excel(integer) to authenticated;
