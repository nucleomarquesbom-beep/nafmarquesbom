/*
 * NAF Marques Bom — correções funcionais de administração e área de sócio.
 * Idempotente: não apaga dados existentes.
 */

begin;

/* ---------------------------------------------------------------
   FOTOGRAFIAS DOS SÓCIOS
   --------------------------------------------------------------- */

insert into storage.buckets (id, name, public)
values ('fotografias-socios', 'fotografias-socios', false)
on conflict (id) do update set public = false;

drop policy if exists "fotografias_admin_insert" on storage.objects;
drop policy if exists "fotografias_admin_select" on storage.objects;
drop policy if exists "fotografias_admin_update" on storage.objects;
drop policy if exists "fotografias_admin_delete" on storage.objects;
drop policy if exists "fotografias_socio_insert" on storage.objects;
drop policy if exists "fotografias_socio_select" on storage.objects;
drop policy if exists "fotografias_socio_update" on storage.objects;

create policy "fotografias_admin_insert"
on storage.objects for insert
with check (
  bucket_id = 'fotografias-socios'
  and public.is_admin()
);

create policy "fotografias_admin_select"
on storage.objects for select
using (
  bucket_id = 'fotografias-socios'
  and public.is_admin()
);

create policy "fotografias_admin_update"
on storage.objects for update
using (
  bucket_id = 'fotografias-socios'
  and public.is_admin()
)
with check (
  bucket_id = 'fotografias-socios'
  and public.is_admin()
);

create policy "fotografias_admin_delete"
on storage.objects for delete
using (
  bucket_id = 'fotografias-socios'
  and public.is_admin()
);

create policy "fotografias_socio_insert"
on storage.objects for insert
with check (
  bucket_id = 'fotografias-socios'
  and (storage.foldername(name))[1] = (
    select s.id::text
    from public.socios s
    where s.user_id = auth.uid()
      and s.ativo = true
  )
);

create policy "fotografias_socio_select"
on storage.objects for select
using (
  bucket_id = 'fotografias-socios'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = (
      select s.id::text
      from public.socios s
      where s.user_id = auth.uid()
        and s.ativo = true
    )
  )
);

create policy "fotografias_socio_update"
on storage.objects for update
using (
  bucket_id = 'fotografias-socios'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = (
      select s.id::text
      from public.socios s
      where s.user_id = auth.uid()
        and s.ativo = true
    )
  )
)
with check (
  bucket_id = 'fotografias-socios'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = (
      select s.id::text
      from public.socios s
      where s.user_id = auth.uid()
        and s.ativo = true
    )
  )
);

/* ---------------------------------------------------------------
   COMPROVATIVOS DE QUOTAS
   --------------------------------------------------------------- */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovativos-quotas',
  'comprovativos-quotas',
  false,
  8388608,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = array['application/pdf']::text[];

drop policy if exists "quota_proofs_insert_own" on storage.objects;
drop policy if exists "quota_proofs_select_own_or_admin" on storage.objects;

create policy "quota_proofs_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'comprovativos-quotas'
  and (storage.foldername(name))[1] = (
    select s.id::text
    from public.socios s
    where s.user_id = auth.uid()
      and s.ativo = true
  )
);

create policy "quota_proofs_select_own_or_admin"
on storage.objects for select
using (
  bucket_id = 'comprovativos-quotas'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = (
      select s.id::text
      from public.socios s
      where s.user_id = auth.uid()
        and s.ativo = true
    )
  )
);

/* ---------------------------------------------------------------
   RLS DA TABELA DE COMPROVATIVOS
   --------------------------------------------------------------- */

drop policy if exists "quota_comprovativos_insert" on public.quota_comprovativos;

create policy "quota_comprovativos_insert"
on public.quota_comprovativos for insert
with check (
  socio_id = (
    select s.id
    from public.socios s
    where s.user_id = auth.uid()
      and s.ativo = true
  )
  and estado = 'pendente'
  and validated_at is null
  and validated_by is null
  and exists (
    select 1
    from public.quotas q
    where q.id = quota_comprovativos.quota_id
      and q.socio_id = quota_comprovativos.socio_id
      and coalesce(q.pago, false) = false
      and coalesce(q.estado, 'pendente') not in ('pago','paga','isento','anulado')
  )
);

commit;
