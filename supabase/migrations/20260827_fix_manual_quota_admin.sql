-- Corrige o pagamento manual quando a Edge Function usa o service role.
-- Mantém a assinatura antiga para compatibilidade e acrescenta uma assinatura
-- segura que recebe explicitamente o utilizador administrador autenticado.

create or replace function public.registar_pagamento_manual(
  p_socio_id uuid,
  p_valor numeric,
  p_metodo text
)
returns public.recibos_quotas
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public.registar_pagamento_manual(p_socio_id,p_valor,p_metodo,auth.uid());
end;
$$;

create or replace function public.registar_pagamento_manual(
  p_socio_id uuid,
  p_valor numeric,
  p_metodo text,
  p_admin_user_id uuid
)
returns public.recibos_quotas
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_socio public.socios;
  v_receipt public.recibos_quotas;
  v_remaining numeric := round(coalesce(p_valor,0),2);
  v_sum numeric := 0;
  v_quota record;
  v_items jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_year integer;
begin
  if p_admin_user_id is null then
    raise exception 'Administrador não identificado.';
  end if;

  if not (
    lower(coalesce((select u.email from auth.users u where u.id=p_admin_user_id),''))='nucleomarquesbom@gmail.com'
    or exists(select 1 from public.socios s where s.user_id=p_admin_user_id and s.is_admin=true and s.ativo=true)
  ) then
    raise exception 'Apenas administradores podem registar pagamentos manuais.';
  end if;

  if p_metodo not in ('transferencia','mbway','numerario') then
    raise exception 'Método de pagamento inválido.';
  end if;
  if p_valor is null or p_valor <= 0 or round(p_valor,2) <> p_valor then
    raise exception 'Indica um montante válido.';
  end if;
  if mod(round(p_valor * 100)::bigint,1200) <> 0 then
    raise exception 'O montante deve ser múltiplo de 12,00 €.';
  end if;

  select * into v_socio from public.socios where id=p_socio_id and ativo=true;
  if not found then raise exception 'Sócio não encontrado ou inativo.'; end if;

  -- Garante que existem quotas suficientes para o pagamento, sem duplicar anos.
  v_year := extract(year from current_date)::integer;
  while (
    select count(*) from public.quotas q
    where q.socio_id=p_socio_id
      and coalesce(q.pago,false)=false
      and lower(coalesce(q.estado,'pendente')) not in ('pago','paga','isento','anulado')
      and round(q.valor,2)=12.00
  ) < round(p_valor/12.00)::integer loop
    if not exists(select 1 from public.quotas where socio_id=p_socio_id and ano=v_year and mes=12) then
      insert into public.quotas(socio_id,ano,mes,valor,pago,data_pagamento,observacoes,estado)
      values(p_socio_id,v_year,12,12.00,false,null,'Quota anual criada automaticamente para pagamento manual.','pendente');
    end if;
    v_year := v_year - 1;
    if v_year < 2000 then raise exception 'Não foi possível criar quotas suficientes.'; end if;
  end loop;

  for v_quota in
    select q.id,q.ano,q.mes,q.valor,q.estado
    from public.quotas q
    where q.socio_id=p_socio_id
      and coalesce(q.pago,false)=false
      and lower(coalesce(q.estado,'pendente')) not in ('pago','paga','isento','anulado')
      and round(q.valor,2)=12.00
    order by q.ano asc,coalesce(q.mes,12) asc,q.created_at asc,q.id asc
    for update
  loop
    exit when v_remaining <= 0;
    v_remaining := round(v_remaining-12.00,2);
    v_sum := round(v_sum+12.00,2);
    v_count := v_count+1;
    v_items := v_items || jsonb_build_array(jsonb_build_object('quota_id',v_quota.id,'ano',v_quota.ano,'mes',v_quota.mes,'valor',12.00));
  end loop;

  if v_remaining <> 0 then raise exception 'Não existem quotas pendentes suficientes para registar este montante.'; end if;
  if v_count=0 then raise exception 'Este sócio não tem quotas pendentes para pagar.'; end if;

  insert into public.recibos_quotas(socio_id,valor_total,metodo_pagamento,quotas,emitido_por)
  values(p_socio_id,v_sum,p_metodo,v_items,p_admin_user_id)
  returning * into v_receipt;

  perform set_config('naf.allow_quota_payment','1',true);
  update public.quotas q
  set pago=true,data_pagamento=current_date,estado='pago',metodo_pagamento=p_metodo,
      observacoes=case when coalesce(q.observacoes,'')='' then 'Pagamento registado manualmente pela administração.' else q.observacoes || E'\nPagamento registado manualmente pela administração.' end
  where q.id in (select (x->>'quota_id')::uuid from jsonb_array_elements(v_items) x);

  return v_receipt;
end;
$$;

revoke all on function public.registar_pagamento_manual(uuid,numeric,text) from public,anon;
revoke all on function public.registar_pagamento_manual(uuid,numeric,text,uuid) from public,anon;
grant execute on function public.registar_pagamento_manual(uuid,numeric,text) to authenticated;
grant execute on function public.registar_pagamento_manual(uuid,numeric,text,uuid) to service_role;
