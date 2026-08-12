# Drº Árbitro — Futebol + Futsal

Este ZIP contém a primeira estrutura integrada da funcionalidade.

## Incluído
- SQL completo para Futebol e Futsal.
- Edições com número variável de testes.
- Inscrições.
- Janela de disponibilidade de cada teste.
- Duração individual da tentativa.
- Uma tentativa por sócio/teste.
- Edge Function para iniciar/submeter e corrigir sem expor a resposta correta ao navegador.
- Bucket privado para PDFs.
- Interface administrativa e área do sócio.

## Instalação
1. Executar `supabase/migrations/20260810_dr_arbitro.sql` no SQL Editor.
2. Publicar `supabase/functions/dr-arbitro-test/index.ts` como Edge Function `dr-arbitro-test`.
3. Em `admin.html`, depois de `admin.js`, carregar `css/dr-arbitro.css` e `js/dr-arbitro.js`.
4. Em `socio.html`, depois do cliente Supabase e do `socio.js`, carregar `css/dr-arbitro.css` e `js/dr-arbitro.js`.

## Formato do PDF
Cada pergunta deve conter quatro opções e a indicação explícita da correta, por exemplo:

1. Pergunta...
A) ...
B) ...
C) ...
D) ...
Resposta correta: C

A importação automática das perguntas do PDF é a próxima peça a ligar à interface. O SQL já está preparado para guardar perguntas, quatro opções e resposta correta.

## Nota importante
Antes de produção, testar RLS/Storage e a lógica temporal com pelo menos duas contas de sócio de teste. Não executar alterações de RLS existentes fora das tabelas `dr_arbitro_*` sem revisão.
