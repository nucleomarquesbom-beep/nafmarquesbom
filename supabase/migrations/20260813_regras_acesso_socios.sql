-- Regras: >6 meses sem acesso OU >=24 quotas mensais vencidas => inativo.
-- Executar no Supabase SQL Editor/migration runner.
alter table public.socios add column if not exists ultimo_acesso_em timestamptz;
alter table public.socios add column if not exists motivo_inatividade text;
create index if not exists idx_socios_ultimo_acesso on public.socios (ultimo_acesso_em) where ativo=true and is_admin=false;
create or replace function public.validar_acesso_socio()
returns table(socio_id uuid, permitido boolean, ativo boolean, motivo text, ultimo_acesso_em timestamptz, quotas_em_atraso integer)
language plpgsql security definer set search_path=public as $$
declare s public.socios%rowtype; n integer:=0; m text:=null;
begin
 select * into s from public.socios where user_id=(select auth.uid()) limit 1;
 if not found then return query select null::uuid,false,false,'A conta autenticada não está associada a um sócio.',null::timestamptz,0; return; end if;
 select count(*)::integer into n from public.quotas q where q.socio_id=s.id and q.ano is not null and q.mes is not null and make_date(q.ano,q.mes,1)<date_trunc('month',current_date)::date and coalesce(q.estado,'pendente') not in ('pago','paga','isento','anulado') and coalesce(q.pago,false)=false;
 if s.is_admin then update public.socios set ultimo_acesso_em=now(),motivo_inatividade=null,updated_at=now() where id=s.id; return query select s.id,true,true,null::text,now(),n; return; end if;
 if not s.ativo then return query select s.id,false,false,coalesce(s.motivo_inatividade,'Sócio inativo.'),s.ultimo_acesso_em,n; return; end if;
 if s.ultimo_acesso_em is not null and s.ultimo_acesso_em<now()-interval '6 months' then m:='Inativo por ausência de acesso ao site durante mais de 6 meses.'; elsif n>=24 then m:='Inativo por 2 anos ou mais de quotas em atraso.'; end if;
 if m is not null then update public.socios set ativo=false,motivo_inatividade=m,updated_at=now() where id=s.id; return query select s.id,false,false,m,s.ultimo_acesso_em,n; return; end if;
 update public.socios set ultimo_acesso_em=now(),motivo_inatividade=null,updated_at=now() where id=s.id;
 return query select s.id,true,true,null::text,now(),n;
end; $$;
revoke all on function public.validar_acesso_socio() from public,anon;
grant execute on function public.validar_acesso_socio() to authenticated;
