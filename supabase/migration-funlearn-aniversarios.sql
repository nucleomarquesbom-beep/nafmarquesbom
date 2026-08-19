-- Esta migration já foi aplicada no projeto Supabase.
-- Fica aqui como fonte de referência/reprodução.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Os três RPCs Fun&Learn:
-- admin_funlearn_adicionar_pontos
-- admin_funlearn_retirar_pontos
-- admin_funlearn_importar_pontos
--
-- O envio automático de aniversários usa:
--   vault: naf_project_url
--   vault: naf_publishable_key
--   cron: naf-aniversarios-diario
--
-- O cron corre diariamente às 08:00 UTC.
