create table if not exists public.acoes (
 id uuid primary key default gen_random_uuid(), titulo text not null, descricao text, data date, hora time, local text,
 prazo_inscricao timestamptz, limite_inscricoes integer, ativa boolean not null default false,
 inscricoes_abertas boolean not null default false, pagamento_obrigatorio boolean not null default false,
 valor numeric(10,2) not null default 0 check (valor >= 0), comprovativo_obrigatorio boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (limite_inscricoes is null or limite_inscricoes > 0),
 check (comprovativo_obrigatorio = false or pagamento_obrigatorio = true)
);
create table if not exists public.acoes_inscricoes (
 id uuid primary key default gen_random_uuid(), acao_id uuid not null references public.acoes(id) on delete cascade,
 socio_id uuid not null references public.socios(id) on delete cascade, data_inscricao timestamptz not null default now(),
 estado text not null default 'pendente' check (estado in ('pendente','confirmada','cancelada','rejeitada')),
 pagamento_confirmado boolean not null default false, comprovativo_path text, comprovativo_nome text,
 comprovativo_tipo text, comprovativo_tamanho bigint, observacoes text, updated_at timestamptz not null default now(),
 unique (acao_id, socio_id)
);
create index if not exists idx_acoes_ativas on public.acoes(ativa, inscricoes_abertas);
create index if not exists idx_acoes_inscricoes_acao on public.acoes_inscricoes(acao_id);
create index if not exists idx_acoes_inscricoes_socio on public.acoes_inscricoes(socio_id);
alter table public.acoes enable row level security;
alter table public.acoes_inscricoes enable row level security;
drop policy if exists acoes_admin_all on public.acoes;
create policy acoes_admin_all on public.acoes for all to authenticated using (exists(select 1 from public.socios s where s.user_id=auth.uid() and s.ativo=true and s.is_admin=true)) with check (exists(select 1 from public.socios s where s.user_id=auth.uid() and s.ativo=true and s.is_admin=true));
drop policy if exists acoes_socios_active_select on public.acoes;
create policy acoes_socios_active_select on public.acoes for select to authenticated using (ativa=true and inscricoes_abertas=true);
drop policy if exists acoes_inscricoes_admin_all on public.acoes_inscricoes;
create policy acoes_inscricoes_admin_all on public.acoes_inscricoes for all to authenticated using (exists(select 1 from public.socios s where s.user_id=auth.uid() and s.ativo=true and s.is_admin=true)) with check (exists(select 1 from public.socios s where s.user_id=auth.uid() and s.ativo=true and s.is_admin=true));
drop policy if exists acoes_inscricoes_own_select on public.acoes_inscricoes;
create policy acoes_inscricoes_own_select on public.acoes_inscricoes for select to authenticated using (exists(select 1 from public.socios s where s.id=socio_id and s.user_id=auth.uid() and s.ativo=true));
drop policy if exists acoes_inscricoes_own_insert on public.acoes_inscricoes;
create policy acoes_inscricoes_own_insert on public.acoes_inscricoes for insert to authenticated with check (
 exists(select 1 from public.socios s where s.id=socio_id and s.user_id=auth.uid() and s.ativo=true)
 and exists(select 1 from public.acoes a where a.id=acao_id and a.ativa=true and a.inscricoes_abertas=true and (a.prazo_inscricao is null or a.prazo_inscricao>=now())
 and (a.limite_inscricoes is null or (select count(*) from public.acoes_inscricoes ai where ai.acao_id=a.id and ai.estado<>'cancelada') < a.limite_inscricoes))
);
drop policy if exists acoes_inscricoes_own_update on public.acoes_inscricoes;
create policy acoes_inscricoes_own_update on public.acoes_inscricoes for update to authenticated using (exists(select 1 from public.socios s where s.id=socio_id and s.user_id=auth.uid() and s.ativo=true)) with check (exists(select 1 from public.socios s where s.id=socio_id and s.user_id=auth.uid() and s.ativo=true));
insert into storage.buckets(id,name,public) values('comprovativos-acoes','comprovativos-acoes',false) on conflict(id) do nothing;
drop policy if exists acoes_storage_insert_own on storage.objects;
create policy acoes_storage_insert_own on storage.objects for insert to authenticated with check(bucket_id='comprovativos-acoes' and split_part(name,'/',1)=(select s.id::text from public.socios s where s.user_id=auth.uid() and s.ativo=true limit 1));
drop policy if exists acoes_storage_select on storage.objects;
create policy acoes_storage_select on storage.objects for select to authenticated using(bucket_id='comprovativos-acoes' and (split_part(name,'/',1)=(select s.id::text from public.socios s where s.user_id=auth.uid() and s.ativo=true limit 1) or exists(select 1 from public.socios s where s.user_id=auth.uid() and s.ativo=true and s.is_admin=true)));
drop policy if exists acoes_storage_delete on storage.objects;
create policy acoes_storage_delete on storage.objects for delete to authenticated using(bucket_id='comprovativos-acoes' and (split_part(name,'/',1)=(select s.id::text from public.socios s where s.user_id=auth.uid() and s.ativo=true limit 1) or exists(select 1 from public.socios s where s.user_id=auth.uid() and s.ativo=true and s.is_admin=true)));
