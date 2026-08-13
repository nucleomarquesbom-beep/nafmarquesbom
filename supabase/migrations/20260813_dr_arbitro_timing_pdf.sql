-- Drº Árbitro: duração do teste + proteção administrativa.
-- IMPORTANTE: a aplicação desta migration é necessária para o campo
-- duracao_minutos existir na tabela dos testes.

alter table public.dr_arbitro_testes
  add column if not exists duracao_minutos integer;

update public.dr_arbitro_testes
   set duracao_minutos = 60
 where duracao_minutos is null;

alter table public.dr_arbitro_testes
  alter column duracao_minutos set default 60;

alter table public.dr_arbitro_testes
  drop constraint if exists dr_arbitro_testes_duracao_ck;

alter table public.dr_arbitro_testes
  add constraint dr_arbitro_testes_duracao_ck
  check (duracao_minutos between 1 and 600);

create index if not exists idx_dr_arbitro_testes_schedule
  on public.dr_arbitro_testes(edicao_id, inicio_em, fim_em, ativo);

-- O bucket privado "dr-arbitro" e as policies de storage para admins
-- já existem no projeto.
