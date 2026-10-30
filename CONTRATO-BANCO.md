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
detalhe com as abas), WhatsApp, CRM, Automações, Performance (com o detalhe de
cada modelo), Análise RFV, Produtos, Regiões, Minha Conta e Menu. A ficha do
cliente abre a partir de Início, Pedidos, Clientes, Marketplaces, WhatsApp,
CRM, Performance, Análise RFV e Produtos.

Conferido no banco de produção, só com leitura, em 30/10/2026: as 66 funções e
as 39 tabelas citadas no código do app existem, e todas as funções podem ser chamadas por quem
está logado (`authenticated`).

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
| `seller_members` | lojas do usuário (`seller_id, created_at`); `seller_id` do usuário nas respostas rápidas e nos números de WhatsApp | todas (SellerContext); WhatsApp, Automações |
| `sellers` | `*` das lojas do usuário; `max_members` da loja | todas; Minha Conta |
| `admin_users` | `id` do usuário logado (`maybeSingle`): o admin vê a chave "Incluir dados de teste" | Performance |
| `profiles` | `full_name, email, company_name, cnpj, whatsapp` do usuário logado | Minha Conta |
| `member_permissions` | `member_id` da loja (contagem de áreas) | Minha Conta (Membros) |
| `orders` | lista, contagem, busca e sugestões de pedidos; últimos pedidos; pedidos do cliente; `id, whatsapp_contacted_at`; último pedido do card e fase por regra; marketplace dos clientes da conversa; estimativa do disparo | Início, Pedidos, Marketplaces, WhatsApp, CRM, Automações, ficha |
| `shipments`, `shipment_events` | entrega dos pedidos da página e linha do tempo | Pedidos, Marketplaces |
| `clients` | ficha e edição do cliente; cliente das conversas; busca por nome, e-mail e WhatsApp; exportar a seleção do CRM | Pedidos, WhatsApp, CRM, ficha |
| `clients_sellers` | contagem para exportar clientes; clientes da loja achados na busca; estimativa do disparo | Clientes, WhatsApp, Automações |
| `client_pipeline` (com `pipeline_stages`), `pipeline_stages` | fase do cliente e fases da loja; colunas do Kanban (contagem e página de 20); filtro por fase | Clientes, WhatsApp, CRM, Automações, Performance, ficha |
| `client_interactions`, `client_metrics`, `client_rfv` | histórico, métricas e RFV do cliente; etiqueta RFV dos cards; condição das fases por regra | CRM, WhatsApp, ficha |
| `client_tags`, `client_tag_assignments` | etiquetas e etiquetas dos clientes da lista | WhatsApp |
| `conversations` | conversas abertas da loja (página de 20, busca, filtros, `?client_id=`); conversas do cliente | WhatsApp, Automações (estimativa), ficha |
| `messages` | a conversa aberta; modelo, automação e sentimento da IA na lista; falhas de envio | WhatsApp, Performance, Automações (estimativa), ficha |
| `sms_messages`, `email_logs` | envios ao cliente; a conversa aberta (thread com WhatsApp); SMS do período | WhatsApp, Performance, ficha |
| `whatsapp_cloud_instances` | números de WhatsApp da loja (`id, label, business_phone_number, status`) | WhatsApp, Automações, Performance |
| `whatsapp_templates` | modelos aprovados (`status = APPROVED`) | WhatsApp, Automações |
| `whatsapp_conversion_cases` | oportunidades detectadas pela IA (`detected`, `validated_case`) | WhatsApp |
| `quick_replies` | respostas rápidas da loja | WhatsApp |
| `seller_hub_vinculos` | se o suporte do Mercado Livre está ligado (`ml_suporte_ativo`) | WhatsApp |
| `ml_conversas` | conversas do Mercado Livre (30 por página) | WhatsApp |
| `workflows` | automações da loja (lista, ativas, nomes) | Automações, CRM, Performance, ficha |
| `workflow_executions` (com `workflows(name)`) | automações do cliente | ficha |
| `workflow_queue` | campanha do disparo retroativo; falhas das últimas 24 h | Automações, Performance |
| `workflow_test_runs` | teste interativo de uma automação | Automações |
| `email_templates` | nome do modelo de e-mail | Performance |
| `sms_templates` (com `sms_template_categories`) | modelos de SMS ativos | Performance |
| `numeros_errados` | marcação de número errado ativa | ficha |
| `seller_marketplace_aliases` | nomes e cores dos marketplaces da loja | Início, Pedidos, Clientes, Marketplaces, CRM, Automações |
| `product_categories` | categorias de produto da loja | Produtos, Marketplaces (aba Produtos) |

### Funções (RPC) lidas
| Função | Telas |
|---|---|
| `my_member_permissions` | todas (áreas que o membro vê; guarda das rotas) |
| `get_dashboard_overview`, `get_dashboard_revenue_timeseries`, `get_dashboard_crm_funnel`, `get_dashboard_recent_orders` | Início |
| `get_marketplace_metrics` | Início, Marketplaces |
| `get_regions_overview` | Início, Marketplaces, Regiões |
| `get_state_detail` | Início e Regiões (toque num estado) |
| `get_pedidos_kpis` | Pedidos, Performance (Recompra) |
| `get_pedidos_count`, `get_pedidos_chart_series`, `get_pedidos_order_statuses`, `get_whatsapp_conversao_7d` | Pedidos |
| `search_kanban_clients` | Pedidos, CRM |
| `get_clients_with_deduped_metrics`, `get_clientes_kpis`, `get_clients_store_distribution`, `get_clients_growth_series`, `get_clientes_demografia`, `get_clients_page_extras`, `get_seller_order_statuses` | Clientes, Marketplaces (aba Clientes) |
| `list_birthday_today_clients`, `list_active_conversation_clients`, `list_one_time_clients` | Clientes, Marketplaces |
| `get_clientes_facetas` | Pedidos, Clientes, Marketplaces |
| `rfv_summary` | Pedidos, Clientes, Marketplaces, WhatsApp, CRM, Análise RFV |
| `rfv_clients` | Análise RFV (clientes do segmento, só com a folha aberta) |
| `get_marketplace_network_summary`, `get_marketplace_revenue_sparkline`, `lojas_do_marketplace`, `get_marketplace_top_products`, `get_clientes_exclusividade` | Marketplaces |
| `get_product_ranking_stats`, `get_product_detail_stats`, `get_category_detail_stats` | Produtos, Marketplaces (aba Produtos) |
| `get_product_marketplaces` | Produtos (filtro Loja) |
| `get_omnichannel_marketplaces`, `conversation_ids_by_rfv_segments` | WhatsApp (filtros) |
| `get_pipeline_metrics`, `get_kanban_filter_options`, `get_pipeline_stage_clients`, `list_clients_without_stage` | CRM |
| `disparo_retroativo_progresso` | Automações (a cada 30 s com o painel de disparo aberto) |
| `get_performance_stats`, `get_whatsapp_median_read_minutes`, `get_email_performance_stats`, `get_sms_performance_stats`, `get_active_template_counts`, `admin_seller_channel_summary` | Performance |
| `get_template_performance`, `get_template_classification_breakdown`, `get_email_template_performance`, `get_sms_template_performance` | Performance (detalhe de cada modelo) |
| `rfv_client_timeline`, `get_client_order_status_history` | ficha |
| `list_seller_members`, `member_permissions_of` | Minha Conta (Membros) |

### Gravação (sempre por ação da pessoa, igual ao site)
| Objeto | Quando | Telas |
|---|---|---|
| `orders.whatsapp_contacted_at` (update por `id`) | toque no WhatsApp de um pedido | Início, Pedidos, Marketplaces |
| `clients` (update), `client_pipeline` (upsert), `client_interactions` (insert) | Editar na ficha (cadastro e fase) | ficha |
| `client_pipeline` (update, insert e upsert), `client_interactions` (insert `stage_changed`) | mover cliente de fase: card, seleção em massa, "clientes sem fase"; ao excluir uma fase os clientes voltam à anterior | CRM, Performance (Mover destinatários) |
| `pipeline_stages` (insert, update de `name` e `color`, delete) | Nova fase, renomear, cor e Excluir fase | CRM |
| RPC `definir_fase_de_entrada`, `initialize_default_pipeline_stages` | menu da coluna; só quando a loja não tem fase nenhuma | CRM |
| RPC `enqueue_workflow` | botão Workflow na ficha; "Disparar automação" no card | ficha, CRM |
| RPC `numero_errado_desfazer` | desfazer "número errado" na ficha | ficha |
| `conversations.unread_count = 0` (por `id`; por `seller_id` em "Marcar todas como lidas") | abrir conversa com não lidas | WhatsApp |
| `quick_replies` (insert, update, delete, `usage_count`) | criar, editar, excluir e usar resposta rápida | WhatsApp |
| `workflows.active` (update por `id`) | ligar ou pausar uma automação | Automações |
| `workflow_queue.status = 'cancelled'` | Cancelar campanha do disparo retroativo | Automações |
| `workflow_test_runs` (update de `status` e `finished_at`) | parar o teste interativo | Automações |
| `product_categories` (insert, update do nome, delete) | Categorias | Produtos, Marketplaces |
| RPC `set_products_category`, `set_product_fields` | categoria, nome, SKU e ativo do produto | Produtos, Marketplaces |
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
| `send-whatsapp-cloud` | enviar texto, anexo ou modelo; testar uma automação | WhatsApp, Automações |
| `get-whatsapp-media` | abrir foto, áudio ou arquivo de uma mensagem | WhatsApp |
| `ml-suporte` | sincronizar (no máximo 1 vez por minuto), abrir e responder conversa do Mercado Livre | WhatsApp |
| `sync-whatsapp-templates` | abrir Testar numa automação | Automações |
| `start-workflow-test` | teste interativo de uma automação | Automações |
| `bulk-dispatch` | disparo retroativo | Automações |

Fora do Supabase, igual ao site: ao pausar uma automação à mão, o app avisa
`https://api-hook.segundavenda.com.br/webhook/alerta-workflow` (POST `no-cors`).

### Tempo real (`postgres_changes`)
| Tabela | Filtro | Telas |
|---|---|---|
| `conversations` | `seller_id` da loja | WhatsApp |
| `messages` (INSERT), `sms_messages`, `email_logs` | `conversation_id` da conversa aberta | WhatsApp |
| `ml_conversas` | `seller_id` da loja; UPDATE da conversa aberta | WhatsApp |
| `client_pipeline` | `seller_id` da loja (canal `column-<fase>` de cada coluna manual) | CRM |
| `workflow_test_runs` (UPDATE) | o teste aberto | Automações |
| `sellers` | sem filtro (canal `sellers_changes` do SellerContext; a tabela não está na publicação do tempo real, então não chega nada) | todas |

`client_pipeline` também não está na publicação `supabase_realtime`: o canal
do CRM é o mesmo do site e hoje não recebe eventos. As colunas se atualizam
pelas consultas, como no site.

### Storage
| Bucket | Uso | Telas |
|---|---|---|
| `chat-media` | anexo enviado na conversa (`<seller_id>/<hora>-<nome>`) e URL assinada de 1 hora | WhatsApp |

### No código copiado, mas o app não chama
- `createSeller`, `updateSellerActive` e `deleteSeller` do `SellerContext`
  (gravam em `sellers`).
- Edge function `invite-seller-member` (o "Adicionar Membro" abre o site).
- Edge function `export-orders` e a RPC `get_seller_marketplaces`
  (exportar pedidos abre o site).
- RPCs `get_marketplace_weekday_distribution` e `rfv_availability`.
- RPC `reordenar_pipeline_stages` (arrastar colunas do CRM, só no computador).
- O `changeStage` do cabeçalho de conversa de computador (`ChatHeader`).
- Edge function `embed-proxy` (entra só como tipo).
- `src/components/SecurityMonitor.tsx` (lê `security_logs`): copiado, mas
  nenhuma tela importa, então nem entra no APK.

### Objetos próprios do app (`app_`)
Nenhum ainda.
