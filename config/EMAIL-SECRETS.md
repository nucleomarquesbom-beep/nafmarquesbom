# Configuração segura do envio de emails

A Edge Function `admin-mail` usa o fornecedor Resend.

Configura os seguintes secrets no Supabase Dashboard → Edge Functions → Secrets:

- `RESEND_API_KEY`: chave da API Resend.
- `MAIL_FROM`: remetente com um endereço pertencente a um domínio verificado no Resend, por exemplo `Núcleo Marques Bom <emails@dominio-do-nucleo.pt>`.

**Importante:** não uses `nucleomarquesbom@gmail.com` como remetente no Resend, a menos que o fornecedor confirme explicitamente que esse remetente é permitido. O Resend normalmente exige um domínio verificado. Sem `MAIL_FROM`, a função devolve um erro explícito em vez de tentar enviar com um remetente por defeito que pode ser recusado.

Passos para concluir a configuração:

1. Adiciona e verifica no Resend um domínio que o Núcleo controla.
2. Configura os registos DNS solicitados pelo Resend.
3. Define os secrets `RESEND_API_KEY` e `MAIL_FROM` no Supabase.
4. Envia um email de teste para uma caixa autorizada e confirma a entrega, incluindo a pasta de spam.

Nunca coloques `RESEND_API_KEY` nem chaves Supabase secret/service-role no JavaScript público.
