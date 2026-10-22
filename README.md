# Barbearia Moriah

Site da barbearia com agendamento online e painel administrativo (`/admin`), usando **Supabase** (banco, login e Edge Functions) e **React + Vite**.

- Site público: página inicial (serviços, sobre, horários, contato) e `/agendar`.
- Painel: `/admin` com dashboard, agenda, disponibilidade, serviços, financeiro, clientes, configurações, usuários e registro de atividades.

## Estrutura

```
src/
  config/defaults.ts      valores padrão (só para a primeira instalação ou se o banco não responder)
  site/                   site público e agendamento
  admin/                  painel /admin
  lib/                    cliente Supabase, formatação, WhatsApp, permissões
supabase/
  migrations/             esquema do banco, RLS, funções e dados iniciais
  functions/              Edge Functions (admin-users, request-password-reset)
```

## Projeto Supabase

Já existe um projeto criado para a barbearia: **barbearia-moriah** (ref `qbaeodwiylukkgdrheqp`, região São Paulo).
As migrações e as duas Edge Functions já estão aplicadas nele.

Para instalar em outro projeto (por exemplo, na conta do cliente):

```bash
npm i -g supabase
supabase link --project-ref <ref-do-projeto>
supabase db push                      # aplica supabase/migrations
supabase functions deploy admin-users
supabase functions deploy request-password-reset --no-verify-jwt
```

### Configurações que precisam ser feitas no painel do Supabase

Em **Authentication → URL Configuration**:

- **Site URL**: o endereço do site publicado (ex.: `https://barbeariamoriah.com.br`).
- **Redirect URLs**: adicione `https://SEU-DOMINIO/admin/redefinir-senha` e `https://SEU-DOMINIO/admin/login`
  (e `http://localhost:5173/**` para desenvolvimento).

Em **Authentication → Sign In / Providers → Email**:

- **Confirm email**: pode desligar. Quem se cadastra fica "pendente" até o dono aprovar, então a confirmação de e-mail não é necessária. Se deixar ligada, a pessoa precisa clicar no link antes de entrar.

Em **Authentication → Emails → SMTP Settings**:

- O e-mail padrão do Supabase só envia para membros da equipe do projeto e tem limite baixo. Para o "Esqueci minha senha" e o "Enviar link por e-mail" funcionarem com qualquer pessoa, configure um SMTP (Resend, Brevo, Gmail com senha de app etc.).

### Segurança

- No navegador só vai a **chave publicável** (`VITE_SUPABASE_PUBLISHABLE_KEY`). A **service role key nunca vai para o código nem para o repositório**: ela existe só dentro das Edge Functions, onde o Supabase a injeta automaticamente.
- Todas as tabelas têm RLS. As políticas checam `status` e `permissoes` em `profiles`, não só se a pessoa está logada. Usuário pendente ou bloqueado não lê nem altera nada (só enxerga o próprio perfil, para saber o status).
- Visitantes leem configurações, serviços ativos, horários e bloqueios; registram `page_views`; agendam pela função `create_public_appointment` (que recalcula preço e duração no servidor e valida o horário); e consultam horários livres por `get_available_slots` / `get_busy_slots`, que devolvem só data e hora.
- Um agendamento pendente ou confirmado nunca se sobrepõe a outro (restrição `exclude` no banco).
- O **primeiro cadastro** do sistema vira o **dono** automaticamente. Depois disso ninguém mais recebe esse cargo, e o dono não pode ser rebaixado, bloqueado ou excluído.
  **Importante:** assim que o site for publicado, o dono deve se cadastrar em `/admin/cadastro` antes de qualquer outra pessoa.

## Rodar localmente

```bash
cp .env.example .env.local   # já vem com a URL e a chave publicável do projeto
npm install
npm run dev                  # http://localhost:5173
```

## Publicar (Vercel, Netlify ou similar)

- Comando de build: `npm run build` · Pasta: `dist`
- Variáveis de ambiente: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
- O `vercel.json` já redireciona todas as rotas para o `index.html` (necessário para `/admin/...` e `/agendar`).

## Como funciona

### Agendamento pelo site

1. O cliente escolhe os serviços; a soma das durações define quantos horários o agendamento ocupa (ex.: 60 min ocupa dois horários de 30 min).
2. Dias fechados e datas bloqueadas não aparecem como disponíveis; horários já ocupados, de almoço ou bloqueados parcialmente também não.
3. Ao clicar em **Confirmar pelo WhatsApp**, o agendamento é salvo como **pendente** e só depois o WhatsApp da barbearia abre com a mensagem pronta.
4. Cada página é registrada uma vez por sessão do navegador em `page_views` (id anônimo gerado no navegador).

### Acesso ao painel

1. `/admin/login` → **Solicitar acesso** → `/admin/cadastro` (nome, e-mail, WhatsApp, senha com mínimo de 8 caracteres).
2. A conta nasce **pendente**. Ao tentar entrar a pessoa vê "Seu acesso está aguardando aprovação do responsável".
3. O dono vê o sino com o contador e pode receber um aviso por WhatsApp (a tela de cadastro oferece o botão "Avisar o responsável", com o link "Ver solicitação").
4. O dono aprova escolhendo o cargo (os presets preenchem as permissões) e ajusta o que quiser.
5. Bloquear encerra a sessão na hora (o painel detecta pelo realtime) e o login para de funcionar (a conta é banida no Auth).
6. **Criar usuário**: o dono define nome, e-mail, cargo, permissões e senha provisória; no primeiro login a pessoa é obrigada a trocar a senha.
7. **Redefinir senha**: gera senha provisória ou envia link por e-mail.
8. **Esqueci minha senha** só envia o link para usuários aprovados.

### Permissões

| Permissão | Libera |
|---|---|
| `dashboard` | Dashboard e acessos |
| `agenda` | Ver e gerenciar agenda |
| `agendamento_manual` | Criar agendamento manual |
| `disponibilidade` | Horários, intervalo e bloqueios de datas |
| `servicos` | Serviços e preços |
| `financeiro` | Financeiro e exportação CSV |
| `clientes` | Lista de clientes |
| `configuracoes` | Textos, contatos e tema do site |

Presets: **Gerente** = tudo (menos usuários) · **Barbeiro** = agenda + agendamento manual · **Recepção** = agenda + clientes + agendamento manual.
Usuários e Atividades são exclusivos do dono.
