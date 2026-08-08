# Edge Function — criar-socio

Esta função permite ao administrador criar um sócio diretamente no site.

## O que faz

1. Confirma que o utilizador autenticado é o sócio 9999 e administrador.
2. Valida nº de sócio, nome, email e telemóvel.
3. Cria o utilizador no Supabase Auth através de convite por email.
4. Cria o perfil na tabela `public.socios` e associa o `user_id`.
5. Se a criação do perfil falhar, apaga o utilizador Auth criado para evitar um registo incompleto.

## Deploy

Criar uma Edge Function no Supabase Dashboard com o nome `criar-socio` e colocar o conteúdo de `index.ts`.

As secret keys ficam apenas no ambiente da Edge Function. Nunca colocar uma secret/service_role key no GitHub ou no browser.
