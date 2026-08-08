# Núcleo Marques Bom — pacote completo para GitHub Pages + Supabase

Este pacote reúne o site e a área de sócios preparada para a estrutura Supabase que foi criada para o projeto.

## Incluído

- Página inicial
- História — página marcada como “está a ser construída”
- Corpos Sociais
  - enquadramento automático das fotografias através de análise de pose no navegador
  - o objetivo do enquadramento é cabeça + ombros, sem obrigar a editar as fotografias manualmente
- Plano de Atividades
  - todos os meses de setembro a agosto
  - mês correspondente à época aberto por defeito
  - ao passar o cursor por outro mês, abre esse mês
- Documentos
  - Leis de jogo futebol
  - Leis de jogo futsal
  - Alteração às Leis de jogo futebol 2026
  - Regulamento das competições da AF Coimbra
  - Regulamento de arbitragem da AF Coimbra
  - Normas e instruções para árbitros
  - Regulamento cartão branco
  - Protocolo anti-racismo
- Contactos
  - cartões com dimensões uniformes
  - mapa Google Maps da sede
- Área Sócio
  - login por email + palavra-passe
  - recuperação de palavra-passe
  - nº de sócio
  - nome
  - data de nascimento
  - morada
  - email
  - telemóvel
  - nº de árbitro
  - associação de futebol
  - modalidade
  - quotas
  - fotografia
  - até 12 PDFs pessoais
  - pontos Fun&Learn
  - histórico de pontos
- Administrador
  - sócio nº 9999
  - Núcleo Marques Bom
  - carregamento de PDF Fun&Learn
  - definição dos pontos
  - procura automática dos nomes no PDF
  - atribuição dos pontos aos sócios encontrados
- GitHub Pages workflow
- SQL de referência da estrutura Supabase

## 1 — O que vai para o GitHub

Subir o conteúdo desta pasta para o repositório GitHub, mantendo as pastas e ficheiros.

Não apagar:

- `css/`
- `js/`
- `imagens/`
- `.github/`

## 2 — Chave Supabase

Abrir:

`js/supabase-config.js`

E substituir:

`COLOCA_AQUI_A_TUA_CHAVE_ANON_OU_PUBLISHABLE`

pela chave pública **anon/publishable** do projeto Supabase.

NUNCA usar:

- `service_role`
- password do PostgreSQL
- qualquer chave secreta do servidor

A chave anon/publishable é a chave apropriada para um site público com RLS.

## 3 — Base de dados

A base de dados já foi preparada no Supabase com o SQL definido para este projeto.

O ficheiro `supabase-schema.sql` fica no pacote como referência da estrutura usada pelo site.

**Se já executaste o SQL e recebeste sucesso, não o executes novamente apenas por teres recebido este ZIP.** O script é de instalação/recriação e contém `drop table` para permitir uma instalação limpa.

## 4 — Administrador

O administrador é:

**Núcleo Marques Bom — nº de sócio 9999**

A palavra-passe não fica na tabela `socios`.

O login é gerido por:

Supabase → Authentication → Users

Depois de criares a conta Auth do administrador, é necessário associar o respetivo `user_id` ao registo de sócio 9999, caso isso ainda não tenha sido feito.

## 5 — Sócios

Cada sócio deve ter uma conta no Supabase Authentication e um registo na tabela `socios` com o mesmo `user_id`.

O nº de sócio é único e é mostrado na área pessoal.

O sócio só consegue consultar os seus próprios dados, documentos e pontos através das políticas RLS.

## 6 — Documentos pessoais

O sócio pode carregar PDFs até ao máximo de 12.

Os ficheiros ficam no bucket privado:

`documentos-socios`

## 7 — Fotografias dos sócios

As fotografias ficam no bucket privado:

`fotografias-socios`

Na página dos Corpos Sociais, as fotografias existentes são analisadas no navegador através do MediaPipe Pose Landmarker para tentar identificar cabeça e ombros e ajustar automaticamente o enquadramento.

Se uma fotografia não permitir deteção suficiente, é usado um enquadramento de segurança.

## 8 — Fun&Learn

Bucket:

`funlearn`

O administrador:

1. escolhe o PDF;
2. indica a atividade;
3. indica os pontos;
4. pode indicar uma descrição;
5. o navegador extrai o texto do PDF;
6. compara os nomes encontrados com os nomes dos sócios ativos;
7. cria a atribuição de pontos.

Cada sócio vê apenas os próprios pontos.

### Limitação atual

O processamento funciona para PDFs que tenham uma camada de texto pesquisável.

Se um PDF for apenas uma imagem/scanner, será necessário acrescentar OCR numa fase posterior.

## 9 — GitHub Pages

O workflow está em:

`.github/workflows/pages.yml`

No GitHub:

Settings → Pages → Source → GitHub Actions

O workflow publica automaticamente a branch `main`.

## 10 — Supabase Authentication

No Supabase, confirma em:

Authentication → URL Configuration

que o endereço final do GitHub Pages está autorizado como Site URL/Redirect URL.

O botão “Esqueci-me da palavra-passe” usa o endereço da página atual como destino de recuperação.

## 11 — Estrutura

```text
.
├── .github/
│   └── workflows/
│       └── pages.yml
├── css/
│   └── style.css
├── imagens/
│   ├── cabecalho.png
│   ├── logo.png
│   ├── corpos/
│   └── tomada-posse/
├── js/
│   ├── script.js
│   ├── socio.js
│   ├── supabase-config.js
│   └── supabase-config.js.example
├── index.html
├── historia.html
├── corpos-sociais.html
├── plano-atividades.html
├── documentos.html
├── contactos.html
├── socio.html
├── supabase-schema.sql
└── README.md
```

## 12 — Novo fluxo simplificado de criação de sócios

A versão atual permite ao administrador criar um sócio diretamente na página `socio.html`, sem preencher todos os dados.

### O administrador preenche apenas

- Nome
- Nº de sócio
- Email
- Telemóvel (opcional)

Ao clicar em **Criar sócio e enviar convite**, o site chama a Edge Function `criar-socio`.
A função confirma que quem está a fazer a operação é o administrador 9999, cria o convite do Supabase Auth e cria o registo correspondente em `public.socios`.

O convite é enviado pelo Supabase Auth e permite ao novo sócio definir a sua própria palavra-passe.

### Importante — Edge Function

A criação administrativa de utilizadores Auth **não pode ser feita com uma chave secreta no JavaScript do site**.
As secret keys do Supabase devem ficar apenas num ambiente seguro/Edge Function.

O código da função está em:

`supabase/functions/criar-socio/index.ts`

No Supabase:

1. Abrir **Edge Functions**.
2. Criar uma função chamada `criar-socio`.
3. Colar o conteúdo de `supabase/functions/criar-socio/index.ts`.
4. Fazer **Deploy**.

A função utiliza as credenciais seguras disponibilizadas pelo ambiente das Edge Functions. Não é necessário colocar `service_role` ou `sb_secret_...` no GitHub.

### Redirect do convite

No Supabase, em **Authentication → URL Configuration**, garantir que o endereço final do GitHub Pages está autorizado.

Exemplo:

`https://TEU-UTILIZADOR.github.io/TEU-REPOSITORIO/socio.html`

O endereço usado no convite deve estar incluído nos Redirect URLs permitidos.

### Edição pelo próprio sócio

O sócio pode editar:

- data de nascimento;
- morada;
- email;
- telemóvel;
- nº de árbitro;
- associação de futebol;
- modalidade.

O sócio **não pode alterar**:

- nome;
- nº de sócio;
- estado de administrador;
- estado ativo;
- quotas.

A migração necessária para reforçar esta regra na própria base de dados está em:

`supabase_migration_socio_edicao.sql`

Executar esta migração **uma única vez** no SQL Editor depois de o SQL principal já estar instalado.

A migração não apaga sócios, contas Auth, documentos ou pontos.

### Fluxo final

```text
ADMINISTRADOR
    │
    ├── Novo sócio
    │     ├── Nome
    │     ├── Nº sócio
    │     ├── Email
    │     └── Telemóvel
    │
    ▼
EDGE FUNCTION criar-socio
    │
    ├── cria convite Auth
    └── cria perfil em public.socios
            │
            ▼
       SÓCIO RECEBE EMAIL
            │
            ▼
       define password
            │
            ▼
       entra no site
            │
            ├── completa os seus dados
            ├── adiciona fotografia
            ├── carrega até 12 PDFs
            └── consulta os seus pontos Fun&Learn
```

### Segurança

O browser usa apenas a chave pública ANON/PUBLISHABLE. Secret keys não devem ser colocadas no HTML, JavaScript, GitHub ou qualquer ficheiro público.


## Recuperação da versão funcional
Esta versão preserva o HTML/CSS visual da versão anterior e não altera o SQL principal.

### Configuração Supabase
O ficheiro `js/supabase-config.js` deve conter o Project URL e a chave pública (Publishable key `sb_publishable_...` ou a chave legacy `anon`). Não colocar `sb_secret`/`service_role` no frontend.
