# Contrato com o banco

O app e o site usam o **mesmo projeto Supabase de produção**
(`fvyhjrqzklbfkmpajoyj`): mesmos usuários, mesmas tabelas, mesma RLS. O banco
é a única coisa que os dois dividem. Este arquivo é a lista fechada do que o app
lê e grava lá, para a pessoa do site saber o que não pode sumir ou mudar de
formato sem avisar.

Quem muda esta lista: o PR do app que passa a usar algo novo do banco atualiza
este arquivo no mesmo PR.

## Regras

1. **O app só acrescenta.** Nunca altera, renomeia ou apaga tabela, coluna,
   função, política de RLS, gatilho ou edge function que o site usa.
2. **Objeto novo do app tem prefixo:** `app_` no banco (tabela, função, view,
   job) e `app-` nas edge functions. Fica em `supabase/migrations/` e
   `supabase/functions/` **deste** repositório.
3. **Função `app_` é `SECURITY INVOKER`:** roda com a permissão de quem está
   logado e respeita a mesma RLS do site.
4. **Gatilho em tabela do site é proibido.** O que o app precisar observar, ele
   lê (consulta ou job `app_` no pg_cron).
5. **Toda migração `app_` passa pela revisão da pessoa do site**, é aplicada
   primeiro no projeto de teste (`tbkgkifybhuaqlhywfby`) e depois na produção,
   com o mesmo nome de arquivo.
6. **Configuração do Auth é do site** (Site URL, endereços de retorno, modelos
   de e-mail). O app só usa.

## O que o app usa hoje

### Auth
| Uso | Onde |
|---|---|
| Entrar com e-mail e senha (`signInWithPassword`) | `src/contexts/AuthContext.tsx` |
| Renovar e ler a sessão (`getSession`, renovação automática) | `src/contexts/AuthContext.tsx` |
| Sair **só deste aparelho** (`signOut({ scope: "local" })`): o site continua logado | `src/contexts/AuthContext.tsx`, `src/contexts/SellerContext.tsx` |
| E-mail de troca de senha (`resetPasswordForEmail`), com retorno para a página do site `https://app.segundavenda.com.br/reset-password` | `src/app/telas/Entrar.tsx` |

O app **não cria conta** (`signUp`) e não troca senha por conta própria.

### Leitura
| Objeto | Como | Onde |
|---|---|---|
| `seller_members` | `seller_id, created_at` do usuário logado | `src/contexts/SellerContext.tsx` |
| `sellers` | `*` dos sellers do usuário (até 50) | `src/contexts/SellerContext.tsx` |
| `affiliates` | `status` do usuário logado | `src/app/dados/useEhAfiliado.ts` |
| RPC `my_member_permissions(_seller_id)` | áreas que o membro pode ver | `src/hooks/useAreaPermissions.ts` |
| Edge function `check-subscription` | plano e contagem de captura do mês | `src/contexts/SubscriptionContext.tsx` |

### Gravação
| Objeto | Quando | Onde |
|---|---|---|
| RPC `log_security_event` | login que falhou (mesmo registro do site, com `origem: "app"` no detalhe) | `src/contexts/AuthContext.tsx` |

O `SellerContext` copiado do site tem `createSeller`, `updateSellerActive` e
`deleteSeller`, que gravam em `sellers`. **O app não chama nenhuma delas.**

### Objetos próprios do app (`app_`)
Nenhum ainda.
