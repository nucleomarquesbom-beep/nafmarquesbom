# Auditoria completa — Núcleo Marques Bom

## Estado
Auditoria estática completa do projeto entregue no ZIP, com validação de sintaxe JavaScript, referências locais, estrutura HTML/CSS, análise dos módulos administrativos e revisão das migrações Supabase.

## Correções aplicadas

1. **Supabase/Admin runtime**
   - `js/naf-consolidated-runtime.js` passou a ser a origem única do cliente Supabase.
   - `js/admin.js` deixou de criar uma segunda instância do Supabase.
   - `js/admin.js` passou a obter a configuração dinamicamente.
   - `js/admin-runtime.js` ficou apenas como compatibilidade e não cria outro cliente.

2. **Login direto no Admin**
   - `admin.html` passa a apresentar formulário de login quando não existe sessão de administrador.
   - O login usa `signInWithPassword` e depois valida `is_admin`.
   - Sessões existentes continuam a ser reutilizadas.

3. **Abas da Administração**
   - Mantidas as áreas: Sócios, Quotas, Administradores, Email, Fun&Learn, Drº Árbitro, Questões e Ações.
   - Na administração integrada dentro de `socio.html`, Quotas e Email passam a ser abas próprias; Administradores só aparece para o administrador principal.
   - Ações, Questões e Drº Árbitro são acionados apenas quando a respetiva aba é aberta.

4. **Ações**
   - `js/acoes-admin.js` foi preservado como módulo principal.
   - Mantidas criação, edição, ativação/desativação, abertura/fecho de inscrições, inscritos, Excel e anulação.
   - A anulação preserva histórico/inscrições.
   - Evitada a dupla ligação dos botões de toggle.

5. **Email**
   - Corrigido o nome predefinido da Edge Function: o projeto contém `admin-mail`, não `send-email`.
   - Emails de Fun&Learn passaram a enviar payload compatível com `admin-mail` (`to`, `subject`, `text`).

6. **Carregamento de Sócios**
   - Uma falha ao carregar quotas ou pontos deixa de impedir todo o carregamento da lista de sócios; é registada no console e o restante Admin continua a funcionar.

7. **Criação de sócio**
   - `admin-criar-socio.js` reutiliza o cliente Supabase partilhado em vez de criar outro cliente.

## Problemas encontrados mas não alterados

- As migrações SQL têm várias versões históricas que recriam/alteram as mesmas funções e policies. Em grande parte são idempotentes, mas a sequência de migrations deve ser mantida e não deve ser executada manualmente fora de ordem.
- Não foi possível executar chamadas reais à API Supabase neste ambiente porque a resolução de DNS/rede externa está bloqueada. Portanto, permissões/RLS e Edge Functions foram auditadas pelo código, mas não foi possível testar uma transação real contra a BD.
- O teste Chromium local foi tentado, mas o processo não terminou dentro do ambiente de execução; por isso a validação final é estática + sintática, não uma sessão real autenticada.

## Ficheiros candidatos a eliminação

Estes ficheiros não são referenciados pelo HTML/JS atual e parecem ser restos de versões anteriores:

- `js/acoes-admin-integrated.js`
- `js/admin-integrated-fix.js`
- `js/admin-runtime.js`
- `js/dr-arbitro-admin-dedup.js`
- `js/questoes-socios.js`
- `js/socio-enhancements.js`
- `css/admin-final-fixes-20260827.css`
- `css/admin-questoes-placement.css`

**Não foram apagados nesta versão**, para evitar perda de histórico. Recomenda-se apagá-los apenas depois de confirmar no ambiente de produção que não existe nenhum carregamento dinâmico externo a referenciá-los.

`css/admin-runtime.css` foi mantido porque passou a ser carregado explicitamente pela integração administrativa dentro de `socio.html`.

## Validações executadas

- Todos os ficheiros `.js`: `node --check` — **0 erros de sintaxe**.
- Referências locais `.html`, `.css` e `.js`: **sem referências inexistentes**.
- Chaves `{}` dos CSS: **sem desequilíbrios**.
- Estrutura de `admin.html`: 8 áreas administrativas presentes.
- `acoes-admin.js`: módulo presente e ligado diretamente em `admin.html`.
- `admin-mail`: função existente e payload comparado com o frontend.
- Secrets: nenhuma service-role key foi encontrada nos ficheiros frontend; as funções usam variáveis de ambiente.
