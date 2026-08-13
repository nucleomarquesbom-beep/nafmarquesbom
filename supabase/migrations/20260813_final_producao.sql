-- Migration final de produção: regras e RPCs aplicadas na BD pvaupgdhtrmbumaxvvrj.
-- Não contém dados pessoais nem credenciais.
-- Em instalações novas, executar depois da estrutura base de socios/quotas.

create or replace function public.is_root_admin() returns boolean
language sql stable security definer set search_path=public,auth as $$
 select lower(coalesce((select email from auth.users where id=(select auth.uid())),''))='nucleomarquesbom@gmail.com';
$$;
revoke all on function public.is_root_admin() from public,anon;
grant execute on function public.is_root_admin() to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path=public,auth as $$
 select public.is_root_admin() or exists(select 1 from public.socios s where s.user_id=(select auth.uid()) and s.is_admin=true and s.ativo=true);
$$;
revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_definir_admin(p_socio_id uuid,p_is_admin boolean) returns public.socios
language plpgsql security definer set search_path=public,auth as $$
declare v public.socios;
begin
 if not public.is_root_admin() then raise exception 'Apenas o administrador principal pode atribuir ou retirar administradores.'; end if;
 select * into v from public.socios where id=p_socio_id for update;
 if not found then raise exception 'Sócio não encontrado.'; end if;
 if lower(coalesce(v.email,''))='nucleomarquesbom@gmail.com' or v.numero_socio=9999 then raise exception 'O administrador principal não pode perder os seus privilégios.'; end if;
 update public.socios set is_admin=coalesce(p_is_admin,false),tipo_utilizador=case when coalesce(p_is_admin,false) then 'admin'::public.tipo_utilizador else 'socio'::public.tipo_utilizador end,updated_at=now() where id=p_socio_id returning * into v;
 return v;
end; $$;
revoke all on function public.admin_definir_admin(uuid,boolean) from public,anon;
grant execute on function public.admin_definir_admin(uuid,boolean) to authenticated;

create or replace function public.admin_listar_permissoes_admin() returns table(id uuid,numero_socio integer,nome text,email text,is_admin boolean,ativo boolean)
language sql stable security definer set search_path=public,auth as $$
 select s.id,s.numero_socio,s.nome,s.email,s.is_admin,s.ativo from public.socios s where public.is_root_admin() and lower(coalesce(s.email,''))<>'nucleomarquesbom@gmail.com' order by s.numero_socio;
$$;
revoke all on function public.admin_listar_permissoes_admin() from public,anon;
grant execute on function public.admin_listar_permissoes_admin() to authenticated;

create or replace function public.proteger_campos_privilegiados_socio() returns trigger
language plpgsql security definer set search_path=public,auth as $$
begin
 if tg_op='UPDATE' and (new.is_admin is distinct from old.is_admin or new.tipo_utilizador is distinct from old.tipo_utilizador or new.ativo is distinct from old.ativo or new.user_id is distinct from old.user_id or new.numero_socio is distinct from old.numero_socio) and not public.is_root_admin() then
  raise exception 'Campos privilegiados só podem ser alterados pelo administrador principal.';
 end if;
 return new;
end; $$;
drop trigger if exists trg_proteger_campos_privilegiados_socio on public.socios;
create trigger trg_proteger_campos_privilegiados_socio before update on public.socios for each row execute function public.proteger_campos_privilegiados_socio();

create or replace function public.obter_estado_quotas_socio(p_socio_id uuid) returns table(em_atraso boolean,meses_em_atraso integer,valor_em_atraso numeric,mes_atual_pago boolean)
language sql stable security definer set search_path=public as $$
 select coalesce(bool_or(q.mes is not null and make_date(q.ano,q.mes,1)<date_trunc('month',current_date)::date and coalesce(q.pago,false)=false and coalesce(q.estado,'pendente') not in ('pago','paga','isento','anulado')),false),
 count(*) filter(where q.mes is not null and make_date(q.ano,q.mes,1)<date_trunc('month',current_date)::date and coalesce(q.pago,false)=false and coalesce(q.estado,'pendente') not in ('pago','paga','isento','anulado'))::integer,
 coalesce(sum(q.valor) filter(where q.mes is not null and make_date(q.ano,q.mes,1)<date_trunc('month',current_date)::date and coalesce(q.pago,false)=false and coalesce(q.estado,'pendente') not in ('pago','paga','isento','anulado')),0),
 coalesce(bool_or(q.mes is not null and date_trunc('month',make_date(q.ano,q.mes,1))=date_trunc('month',current_date) and (coalesce(q.pago,false)=true or q.estado in ('pago','paga','isento')),false)
 from public.quotas q where q.socio_id=p_socio_id;
$$;
revoke all on function public.obter_estado_quotas_socio(uuid) from public,anon;
grant execute on function public.obter_estado_quotas_socio(uuid) to authenticated;
