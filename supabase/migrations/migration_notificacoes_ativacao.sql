create table if not exists public.notificacoes_ativacao (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('acao','dr_arbitro')),
  recurso_id uuid not null,
  activation_token text not null,
  estado text not null default 'a_enviar',
  total_enviados integer not null default 0,
  total_falhados integer not null default 0,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  unique (tipo, recurso_id, activation_token)
);

alter table public.notificacoes_ativacao enable row level security;

-- Nenhum acesso direto do navegador. A Edge Function usa service role.
