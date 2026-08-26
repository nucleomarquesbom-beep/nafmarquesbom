/* NAF Marques Bom — correção consolidada de Ações + Quotas
   Idempotente e sem apagar registos existentes.
*/

begin;

/* =========================
   AÇÕES — anulação/histórico
   ========================= */

alter table public.acoes
  add column if not exists anulada boolean not null default false;

alter table public.acoes
  add column if not exists anulada_em timestamptz;

alter table public.acoes
  add column if not exists anulada_por uuid;

create index if not exists idx_acoes_estado_publico
  on public.acoes(ativa, inscricoes_abertas, anulada);

/* Uma ação anulada nunca pode voltar a ficar ativa/aberta. */
update public.acoes
   set ativa = false,
       inscricoes_abertas = false
 where anulada = true
   and (ativa = true or inscricoes_abertas = true);

/* Sócios podem ver uma ação ativa e aberta OU a ação associada à sua própria inscrição.
   Isto permite preservar o histórico de inscrições depois de uma anulação. */
drop policy if exists acoes_socios_active_select on public.acoes;
create policy acoes_socios_active_select
on public.acoes for select to authenticated
using (
  (anulada = false and ativa = true and inscricoes_abertas = true)
  or exists (
    select 1
      from public.acoes_inscricoes ai
      join public.socios s on s.id = ai.socio_id
     where ai.acao_id = public.acoes.id
       and s.user_id = auth.uid()
       and s.ativo = true
  )
);

/* =========================
   QUOTAS — consistência
   ========================= */

alter table public.quotas
  add column if not exists valor numeric(10,2);

/* Não inventamos valores para linhas existentes que possam estar incompletas.
   Para novas quotas mensais, o valor por omissão é 1 € apenas se o projeto já
   depender de preenchimento posterior; a regra anual de 12 € é aplicada pelas
   funções abaixo. */

create unique index if not exists quotas_socio_ano_mes_uq
  on public.quotas(socio_id, ano, mes);

/* Leitura das próprias quotas pelo sócio e gestão pelo administrador.
   São políticas adicionais e permissivas; não removem outras políticas válidas. */
drop policy if exists quotas_socio_select_own on public.quotas;
create policy quotas_socio_select_own
on public.quotas for select to authenticated
using (
  exists (
    select 1 from public.socios s
     where s.id = public.quotas.socio_id
       and s.user_id = auth.uid()
       and s.ativo = true
  )
);

drop policy if exists quotas_admin_all on public.quotas;
create policy quotas_admin_all
on public.quotas for all to authenticated
using (public.is_admin())
with check (public.is_admin());

/* =========================
   QUOTAS — dívida anual Excel
   ========================= */

drop function if exists public.admin_importar_divida_anual_excel(jsonb, integer);
create function public.admin_importar_divida_anual_excel(
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
      ) values (
        v_socio_id,
        v_ano_base - (i - 1),
        12,
        12,
        false,
        null,
        'Importado por Excel como dívida anual de quota',
        'pendente'
      )
      on conflict (socio_id, ano, mes) do update
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

revoke all on function public.admin_importar_divida_anual_excel(jsonb, integer) from public, anon;
grant execute on function public.admin_importar_divida_anual_excel(jsonb, integer) to authenticated;

drop function if exists public.admin_exportar_divida_anual_excel(integer);
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
set search_path = public
as $$
  select
    s.numero_socio,
    s.nome,
    coalesce(sum(q.valor),0)::numeric
  from public.socios s
  join public.quotas q on q.socio_id = s.id
  where public.is_admin()
    and q.pago = false
    and lower(coalesce(q.estado,'pendente')) in ('em_atraso','pendente','nao_paga','não_paga')
    and q.mes = 12
    and q.valor = 12
    and q.ano <= coalesce(p_ano_inicial, extract(year from current_date)::integer)
  group by s.numero_socio, s.nome
  having coalesce(sum(q.valor),0) > 0
  order by s.numero_socio;
$$;

revoke all on function public.admin_exportar_divida_anual_excel(integer) from public, anon;
grant execute on function public.admin_exportar_divida_anual_excel(integer) to authenticated;

commit;
