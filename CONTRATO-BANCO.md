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

Tudo abaixo é o que as telas de celular do site já fazem, com as mesmas
consultas (as telas do app são cópias delas) e sempre filtrado pela loja ativa
(`seller_id`). Telas: Início, Pedidos, Clientes, Marketplaces (lista e
detalhe com as abas), Minha Conta e Menu. A ficha do cliente abre a partir de
Início, Pedidos, Clientes e Marketplaces.

### Auth
| Uso | Onde |
|---|---|
| Entrar com e-mail e senha (`signInWithPassword`) | `src/contexts/AuthContext.tsx` |
| Renovar e ler a sessão (`getSession`, renovação automática) | `AuthContext.tsx`, Minha Conta antes de salvar o perfil |
| Sair **só deste aparelho** (`signOut({ scope: "local" })`): o site continua logado | `AuthContext.tsx`, `SellerContext.tsx` |
| E-mail de troca de senha (`resetPasswordForEmail`), com retorno para a página do site `https://app.segundavenda.com.br/reset-password` | `src/app/telas/Entrar.tsx` |

O app **não cria conta** (`signUp`) nem convida membro (o "Adicionar Membro"
abre o site). O dono da loja pode trocar a senha de um membro pela edge
function `update-member-password`, igual ao site.

### Tabelas lidas
| Tabela | O que | Telas |
|---|---|---|
| `seller_members` | lojas do usuário (`seller_id, created_at`) | todas (SellerContext) |
| `sellers` | `*` das lojas do usuário; `max_members` da loja | todas; Minha Conta |
| `affiliates` | `status` do usuário logado | Menu |
| `profiles` | `full_name, email, company_name, cnpj, whatsapp` do usuário logado | Minha Conta |
| `member_permissions` | `member_id` da loja (contagem de áreas) | Minha Conta (Membros) |
| `orders` | lista, contagem, busca e sugestões de pedidos; últimos pedidos; pedidos do cliente; `id, whatsapp_contacted_at` | Início, Pedidos, Marketplaces, ficha |
| `shipments`, `shipment_events` | entrega dos pedidos da página e linha do tempo | Pedidos, Marketplaces |
| `clients` | ficha e edição do cliente; reserva da busca de pedidos | Pedidos, ficha |
| `clients_sellers` | contagem para exportar clientes | Clientes |
| `client_pipeline` (com `pipeline_stages`), `pipeline_stages` | fase do cliente e fases da loja | Clientes, ficha |
| `client_interactions`, `client_metrics`, `client_rfv` | histórico, métricas e RFV do cliente | ficha |
| `conversations`, `messages` | conversas do cliente e as últimas mensagens | ficha |
| `workflow_executions` (com `workflows(name)`), `workflows` | automações do cliente; automações ativas da loja | ficha |
| `sms_messages`, `email_logs` | envios ao cliente | ficha |
| `numeros_errados` | marcação de número errado ativa | ficha |
| `seller_marketplace_aliases` | nomes e cores dos marketplaces da loja | Início, Pedidos, Clientes, Marketplaces |
| `product_categories` | categorias de produto da loja | Marketplaces (aba Produtos) |

### Funções (RPC) lidas
| Função | Telas |
|---|---|
| `my_member_permissions` | todas (áreas que o membro vê; guarda das rotas) |
| `get_dashboard_overview`, `get_dashboard_revenue_timeseries`, `get_dashboard_crm_funnel`, `get_dashboard_recent_orders` | Início |
| `get_marketplace_metrics` | Início, Marketplaces |
| `get_regions_overview` | Início, Marketplaces |
| `get_state_detail` | Início (toque num estado) |
| `get_pedidos_kpis`, `get_pedidos_count`, `get_pedidos_chart_series`, `get_pedidos_order_statuses`, `get_whatsapp_conversao_7d`, `search_kanban_clients` | Pedidos |
| `get_clients_with_deduped_metrics`, `get_clientes_kpis`, `get_clients_store_distribution`, `get_clients_growth_series`, `get_clientes_demografia`, `get_clients_page_extras`, `get_seller_order_statuses` | Clientes, Marketplaces (aba Clientes) |
| `list_birthday_today_clients`, `list_active_conversation_clients`, `list_one_time_clients` | Clientes, Marketplaces |
| `get_clientes_facetas` | Pedidos, Clientes, Marketplaces |
| `rfv_summary` | Pedidos, Clientes, Marketplaces |
| `get_marketplace_network_summary`, `get_marketplace_revenue_sparkline`, `lojas_do_marketplace`, `get_marketplace_top_products`, `get_clientes_exclusividade` | Marketplaces |
| `get_product_ranking_stats`, `get_product_detail_stats`, `get_category_detail_stats` | Marketplaces (aba Produtos) |
| `rfv_client_timeline`, `get_client_order_status_history` | ficha |
| `list_seller_members`, `member_permissions_of` | Minha Conta (Membros) |

### Gravação (sempre por ação da pessoa, igual ao site)
| Objeto | Quando | Telas |
|---|---|---|
| `orders.whatsapp_contacted_at` (update por `id`) | toque no WhatsApp de um pedido | Início, Pedidos, Marketplaces |
| `clients` (update), `client_pipeline` (upsert), `client_interactions` (insert) | Editar na ficha (cadastro e fase) | ficha |
| RPC `enqueue_workflow` | botão Workflow na ficha | ficha |
| RPC `numero_errado_desfazer` | desfazer "número errado" na ficha | ficha |
| `product_categories` (insert, update do nome, delete) | aba Produtos > Categorias | Marketplaces |
| RPC `set_products_category`, `set_product_fields` | aba Produtos | Marketplaces |
| `profiles` (update de `full_name, company_name, cnpj, whatsapp`) | Salvar em Dados cadastrais | Minha Conta |
| `seller_members` (delete por `id` e `seller_id`) | Remover membro | Minha Conta |
| RPC `set_member_permissions` | Permissões de um membro | Minha Conta |
| RPC `log_security_event` | login que falhou (com `origem: "app"` no detalhe) | Entrar |

### Edge functions
| Função | Quando | Telas |
|---|---|---|
| `check-subscription` | ao abrir (limite de captura do mês) | todas |
| `export-clients` | Exportar Dados (devolve a URL do CSV, que abre no navegador) | Clientes |
| `update-member-password` | dono troca a senha de um membro | Minha Conta |

### No código copiado, mas o app não chama
- `createSeller`, `updateSellerActive` e `deleteSeller` do `SellerContext`
  (gravam em `sellers`).
- Edge function `invite-seller-member` (o "Adicionar Membro" abre o site).
- Edge function `export-orders` e a RPC `get_seller_marketplaces`
  (exportar pedidos abre o site).
- RPCs `get_marketplace_weekday_distribution` e `get_product_marketplaces`.

### Objetos próprios do app (`app_`)
Nenhum ainda.
