# Correções consolidadas — Quotas / Ações / Drº Árbitro

## Ficheiros

- `js/admin-config.js` — mantém a configuração Supabase existente e carrega a camada final.
- `js/admin-final-fixes-20260826.js` — cria a aba Quotas, move todas as operações de quotas para lá, gera quotas anuais, lista dívida, envia avisos e impede duplicação do Drº Árbitro.
- `supabase/migrations/20260826_quotas_admin_module.sql` — cria a RPC segura para gerar quotas anuais sem duplicados.

## Instalação

1. Substituir `js/admin-config.js` pelo ficheiro deste pacote.
2. Copiar `js/admin-final-fixes-20260826.js` para a pasta `js/`.
3. Aplicar a migration `supabase/migrations/20260826_quotas_admin_module.sql` no projeto Supabase ligado à aplicação.
4. Não apagar nem substituir `admin.js`, `acoes-admin.js`, `dr-arbitro.js`, `socio.js` ou os restantes ficheiros existentes.
5. Fazer hard refresh (`Ctrl+F5`) depois do upload.

A aba Quotas é criada automaticamente no Admin; não é necessário editar manualmente `admin.html`.

A camada esconde as operações de quotas da lista de Sócios e disponibiliza-as na nova aba.

A anulação das ações é preservada na BD e é apresentada num histórico próprio no Admin. As inscrições do sócio continuam a apontar para a ação anulada e são apresentadas no histórico do sócio.

O Drº Árbitro mantém o módulo dedicado (`#dr-futebol` / `#dr-futsal`) e remove o segundo editor integrado criado pelo caminho legado.
