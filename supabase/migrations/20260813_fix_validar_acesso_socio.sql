-- Regra de acesso aos sócios: aplicada diretamente no projeto Supabase em 2026-08-13.
-- Mantida no repositório para reprodutibilidade.

begin;
create or replace function public.validar_acesso_socio()
returns table(permitido boolean, motivo text, socio jsonb)
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_socio public.socios;
  v_overdue_months integer := 0;
  v_reason text := null;
begin
  if v_uid is null then return query select false, 'Sessão não autenticada.', null::jsonb; return; end if;
  select * into v_socio from public.socios where user_id = v_uid limit 1;
  if not found then return query select false, 'A conta autenticada não está associada a um sócio.', null::jsonb; return; end if;
  select count(*)::integer into v_overdue_months from public.quotas q
    where q.socio_id = v_socio.id
      and make_date(q.ano,q.mes,1) < date_trunc('month',current_date)::date
      and coalesce(q.pago,false)=false
      and lower(coalesce(q.estado,'pendente')) not in ('pago','paga','isento','anulado');
  if coalesce(v_socio.ativo,false)=false then
    v_reason := coalesce(v_socio.motivo_inatividade,'O acesso deste sócio encontra-se inativo.');
  elsif v_socio.ultimo_acesso_em is not null and v_socio.ultimo_acesso_em <= now() - interval '6 months' then
    v_reason := 'O acesso foi marcado como inativo por ausência de acesso superior a 6 meses.';
  elsif v_overdue_months >= 24 then
    v_reason := 'O acesso foi marcado como inativo por 2 anos ou mais de quotas em atraso.';
  end if;
  if v_reason is not null then
    update public.socios set ativo=false,motivo_inatividade=v_reason,updated_at=now() where id=v_socio.id;
    return query select false,v_reason,to_jsonb(v_socio); return;
  end if;
  update public.socios set ultimo_acesso_em=now(),updated_at=now() where id=v_socio.id;
  select * into v_socio from public.socios where id=v_socio.id;
  return query select true,null::text,to_jsonb(v_socio);
end;
$$;
revoke all on function public.validar_acesso_socio() from public,anon;
grant execute on function public.validar_acesso_socio() to authenticated;
create index if not exists idx_socios_user_id on public.socios(user_id);
create index if not exists idx_quotas_socio_ano_mes on public.quotas(socio_id,ano,mes);
commit;
