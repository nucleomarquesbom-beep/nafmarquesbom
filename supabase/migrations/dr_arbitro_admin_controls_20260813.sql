-- Drº Árbitro: controlo administrativo seguro.
-- Aplicada no projeto Supabase pvaupgdhtrmbumaxvvrj.

create or replace function public.dr_arbitro_admin_definir_ativo(
  p_edicao_id uuid,
  p_ativo boolean
)
returns public.dr_arbitro_edicoes
language plpgsql
security definer
set search_path=public
as $$
declare v public.dr_arbitro_edicoes;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar o Drº Árbitro';
  end if;

  update public.dr_arbitro_edicoes
     set ativo=p_ativo, updated_at=now()
   where id=p_edicao_id
   returning * into v;

  if not found then
    raise exception 'Edição não encontrada';
  end if;

  return v;
end;
$$;

revoke all on function public.dr_arbitro_admin_definir_ativo(uuid,boolean) from public,anon;
grant execute on function public.dr_arbitro_admin_definir_ativo(uuid,boolean) to authenticated;

create or replace function public.dr_arbitro_admin_definir_inscricoes(
  p_edicao_id uuid,
  p_abertas boolean
)
returns public.dr_arbitro_edicoes
language plpgsql
security definer
set search_path=public
as $$
declare v public.dr_arbitro_edicoes;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar as inscrições';
  end if;

  update public.dr_arbitro_edicoes
     set inscricoes_abertas=p_abertas, updated_at=now()
   where id=p_edicao_id
   returning * into v;

  if not found then
    raise exception 'Edição não encontrada';
  end if;

  return v;
end;
$$;

revoke all on function public.dr_arbitro_admin_definir_inscricoes(uuid,boolean) from public,anon;
grant execute on function public.dr_arbitro_admin_definir_inscricoes(uuid,boolean) to authenticated;

create index if not exists idx_dr_arbitro_edicoes_ativo_created
  on public.dr_arbitro_edicoes(ativo,created_at desc);

create index if not exists idx_dr_arbitro_testes_edicao_ativo
  on public.dr_arbitro_testes(edicao_id,ativo,inicio_em,fim_em);

create index if not exists idx_dr_arbitro_perguntas_teste_numero
  on public.dr_arbitro_perguntas(teste_id,numero);
