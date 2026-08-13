# Drº Árbitro — integração

O módulo `js/dr-arbitro.js` foi preparado para ser carregado pela área de sócios.

## Integração

No `js/supabase-config.js`, depois dos exports, acrescentar:

```js
import './dr-arbitro.js';
```

O módulo cria dinamicamente:
- aba "Drº Árbitro" no espaço de sócio;
- painel do teste;
- resultados;
- painel administrativo;
- botões Ativar/Desativar;
- botões Abrir/Fechar inscrições.

A aba do sócio só fica disponível quando existe uma edição `dr_arbitro_edicoes` com `ativo = true`.

## BD

A migração `supabase/migrations/dr_arbitro_admin_controls_20260813.sql` corresponde às RPCs administrativas aplicadas no projeto.
