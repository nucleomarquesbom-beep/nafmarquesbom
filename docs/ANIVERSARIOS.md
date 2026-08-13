# Emails de aniversário

A função `supabase/function/aniversarios/index.ts` envia um email aos sócios ativos cujo `data_nascimento` coincide com o dia atual. A tabela `aniversarios_enviados` impede duplicados no mesmo ano.

Configure no Supabase: `RESEND_API_KEY`, `MAIL_FROM` e, para execução automática, `CRON_SECRET`.

Agende diariamente um POST autenticado para `/functions/v1/aniversarios` com `Authorization: Bearer <CRON_SECRET>`. A função pode ser chamada por cron externo ou pelo scheduler disponível na infraestrutura Supabase.
