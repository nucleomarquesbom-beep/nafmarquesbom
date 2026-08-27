# Verificação do sistema de aniversários

A função existente `supabase/function/aniversarios/index.ts` está preparada para:
- usar a data no fuso Europe/Lisbon;
- encontrar sócios ativos com `data_nascimento` no dia atual;
- evitar duplicados através de `aniversarios_enviados` por ano;
- enviar o email de parabéns através da Resend.

Não foi alterado o texto nem a lógica funcional existente. A execução automática depende de existir um POST diário para a Edge Function `aniversarios`; sem esse agendamento, a função não é executada sozinha.
