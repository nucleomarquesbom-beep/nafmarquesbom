# Secrets de email

Configurar nos secrets do Supabase:

- `RESEND_API_KEY`
- `MAIL_FROM`

Exemplo:

`MAIL_FROM=Núcleo Marques Bom <noreply@seudominio.pt>`

Nunca colocar `RESEND_API_KEY` no JavaScript do frontend.

A função `admin-mail` está preparada para Resend. Se o projeto já usar outro fornecedor de email, substituir apenas a função `sendEmail()`.

