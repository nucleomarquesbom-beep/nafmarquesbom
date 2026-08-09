# NAF Marques Bom — pacote de implementação das funcionalidades em falta

Este pacote foi preparado para completar as funcionalidades administrativas sem redesenhar o site.

## Funcionalidades

- Lista de sócios para administrador (mantém a existente e disponibiliza API JS).
- Importação/atualização de sócios a partir de PDF com PDF.js.
- Avisos individuais de quotas em atraso.
- Envio de PDF + mensagem para toda a lista de sócios.
- Retirada de pontos Fun&Learn.
- Verificação de saldo antes da retirada.
- Registo da retirada em `public.funlearn_pontos` com pontos negativos.
- Email ao sócio depois da retirada.
- Verificação administrativa no backend através de `public.socios`.
- Nenhuma alteração ao CSS.

## 1. Copiar o JavaScript

Substituir:

`js/admin-funcionalidades.js`

pelo ficheiro deste pacote.

Não é necessário alterar `socio.html` se ele já tiver:

```html
<script type="module">
  import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  window.pdfjsLib = pdfjsLib;
  import './js/socio.js';
  import './js/admin-funcionalidades.js';
</script>
```

## 2. Copiar as Edge Functions

Copiar as três pastas:

- `supabase/functions/admin-mail`
- `supabase/functions/admin-funlearn`
- `supabase/functions/admin-import-pdf`

Se essas funções já existirem no projeto, substituir o conteúdo pelos ficheiros deste pacote.

## 3. Secrets

No Supabase, configurar:

- `RESEND_API_KEY`
- `MAIL_FROM`

Exemplo:

`MAIL_FROM=Núcleo Marques Bom <noreply@seudominio.pt>`

Nunca colocar a chave Resend no JavaScript.

O envio de email através de Edge Functions é a abordagem suportada pelo Supabase para integrações de email; as credenciais devem ficar nos secrets do projeto.

## 4. Deploy

Com o projeto Supabase ligado:

```bash
supabase functions deploy admin-mail
supabase functions deploy admin-funlearn
supabase functions deploy admin-import-pdf
```

## 5. Verificação

Testar pela ordem:

1. Login do administrador 9999.
2. Abrir Área do Administrador.
3. Confirmar lista de sócios.
4. Importar um PDF pequeno de teste.
5. Confirmar inserção/atualização.
6. Marcar um sócio com `quotas` diferente de `Em dia`.
7. Enviar lembrete de quotas.
8. Enviar um PDF de teste para toda a lista.
9. Retirar 1 ponto a um sócio que tenha saldo.
10. Confirmar saldo.
11. Confirmar registo negativo em `funlearn_pontos`.
12. Confirmar email de retirada.
13. Testar com utilizador que não seja administrador.

## Formato recomendado do PDF de sócios

O formato mais seguro é uma tabela de texto com cabeçalho:

```text
N.º de sócio;Nome;Email;Telemóvel
1;João Silva;joao@example.com;912345678
2;Ana Costa;ana@example.com;913456789
```

Também são aceites `|` e TAB como separadores.

### Importante

Um PDF que seja apenas uma imagem/scanner não contém texto selecionável. Nesse caso é necessário OCR; este pacote não inventa dados nem faz OCR silencioso.

## Limitações deliberadas

- O CSS não é alterado.
- Não são criadas tabelas novas desnecessárias.
- A estrutura existente `public.funlearn_pontos` é usada para retiradas.
- A autorização real é feita no backend; o frontend apenas controla a interface.
- O número 9999 não é usado como única barreira no backend: a função verifica a sessão e o registo `socios` com `is_admin=true` e `ativo=true`.
