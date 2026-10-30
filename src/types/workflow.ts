export type WorkflowNodeType = 
  | 'trigger' 
  | 'retroactive-trigger'
  | 'schedule' 
  | 'whatsapp' 
  | 'whatsapp-reply'
  | 'message-received' 
  | 'pipeline-stage-change' 
  | 'rfv-segment-change'
  | 'move-to-stage' 
  | 'add-interaction'
  | 'ai-processor'
  | 'ai-classifier'
  | 'condition'
  | 'send-template'
  | 'webhook-call'
  | 'invalid-number'
  | 'delay-dynamic'
  | 'wait-for-reply'
  | 'order-status-change'
  | 'shipment-status-change'
  | 'distribute-to-stages'
  | 'queue-throttle'
  | 'wait-for-status-change'
  | 'delivery-forecast'
  | 'mark-forecast-opt-in'
  | 'send-media'
  | 'send-document'
  | 'email-send'
  | 'email-template'
  | 'send-sms-free'
  | 'send-sms-template';

/** Envio de e-mail livre (assunto e corpo escritos no próprio nó). */
export interface EmailSendConfig {
  /** Destinatário. Aceita variáveis ({email}) ou e-mail literal. */
  to: string;
  subject: string;
  body_html: string;
  body_text?: string;
  reply_to?: string;
  tags?: string[];
}

/** Envio de e-mail a partir de um template salvo em email_templates. */
export interface EmailTemplateConfig {
  /** Destinatário. Aceita variáveis ({email}) ou e-mail literal. */
  to: string;
  /** UUID do registro em email_templates */
  template_id: string;
  /** Map variável→valor (aceita {variavel} do contexto do workflow) */
  variables?: Record<string, string>;
  reply_to?: string;
}

/** Envio de SMS a partir de um template salvo em sms_templates. */
export interface SmsSendTemplateConfig {
  templateId: string;
  templateName: string;
  // As variáveis ({primeiro_nome} etc.) são substituídas direto no corpo do
  // template pelo executor. SMS não tem parâmetros posicionais como o WhatsApp.
}

/** Envio de SMS com texto livre. */
export interface SmsSendFreeConfig {
  to_phone: string;
  message: string;
}

export interface SendMediaConfig {
  /** image (jpg/png/webp) ou video (mp4/3gpp) */
  mediaType: 'image' | 'video';
  /** upload no bucket template-media, ou URL pública */
  mediaSource: 'upload' | 'url';
  /** Path interno no bucket template-media (assinado no envio). */
  mediaPath?: string;
  /** URL pública direta. */
  mediaUrl?: string;
  /** Legenda opcional (aceita variáveis dinâmicas). */
  caption?: string;
  /** Instância WhatsApp Cloud específica. */
  whatsappCloudInstanceId?: string;
  useDefaultCloudInstance?: boolean;
}

export interface SendDocumentConfig {
  mediaSource: 'upload' | 'url';
  mediaPath?: string;
  mediaUrl?: string;
  /** Nome de arquivo exibido no WhatsApp (ex.: "Catálogo.pdf"). */
  filename?: string;
  caption?: string;
  whatsappCloudInstanceId?: string;
  useDefaultCloudInstance?: boolean;
}

export interface MarkForecastOptInConfig {
  /** Se true, remove o opt-in do pedido (default false = ativa opt-in). */
  revoke?: boolean;
}

export interface DeliveryForecastConfig {
  /** @deprecated use daysBeforeMin/daysBeforeMax. Mantido para retrocompat. */
  daysBefore?: number;
  /** Início (inclusivo) da faixa de dias que faltam para a entrega prevista. */
  daysBeforeMin?: number;
  /** Fim (inclusivo) da faixa de dias que faltam para a entrega prevista. */
  daysBeforeMax?: number;
  carriers?: string[];
  storeIds?: number[];
}

export interface ShipmentStatusChangeConfig {
  shipment_statuses: string[];
  /**
   * Filtro opcional por fase do pipeline. Se preenchido, o gatilho só dispara
   * quando o cliente estiver em uma das fases listadas (stage_id). Lista vazia
   * ou ausente = sem filtro (dispara para todos, comportamento legado).
   */
  pipeline_stage_filter?: string[];
  /**
   * Filtro opcional por loja específica (stores.id). Se preenchido, o gatilho
   * só dispara para pedidos vinculados a uma dessas lojas. Vazio/ausente = sem
   * filtro (comportamento legado).
   */
  storeIds?: string[];
}

export interface WaitForStatusChangeConfig {
  statuses: string[];
  timeoutMinutes: number;
}

export interface QueueThrottleConfig {
  rateMode: 'per_minute' | 'interval_seconds';
  ratePerMinute?: number;
  intervalSeconds?: number;
  respectBusinessHours: boolean;
  startHour?: number;
  endHour?: number;
  daysOfWeek?: number[];
  timezone?: string;
}

export type TriggerConditionOperator = 'starts-with' | 'contains' | 'ends-with' | 'exact';
// 'between' usa orderValue como piso e orderValueMax como teto, ambos inclusivos.
// (Os operadores antigos seguem como estão para não mudar workflow já salvo:
// 'greater-than' na prática é >=, 'less-than' é <.)
export type TriggerValueOperator = 'greater-than' | 'equal' | 'less-than' | 'between';
export type TriggerFilterLogic = 'AND' | 'OR';

export interface TriggerCondition {
  // Lógica entre filtros: 'AND' (todos precisam passar) ou 'OR' (qualquer um basta).
  // Default: 'AND' (compatibilidade com workflows existentes).
  filterLogic?: TriggerFilterLogic;
  orderValue?: number;
  /** Teto da faixa. Só é lido quando orderValueOperator === 'between'. */
  orderValueMax?: number;
  orderValueOperator?: TriggerValueOperator;
  productText?: string;
  productOperator?: TriggerConditionOperator;
  state?: string; // deprecated, use clientState
  clientState?: string[]; // Array de estados permitidos
  excludeStates?: string[]; // Array de estados a excluir
  regionsInclude?: string[]; // Regiões do cliente (chaves de src/lib/regioes.ts: 'sul', 'sudeste', 'sem_regiao'…); vazio = sem filtro
  city?: string;
  // Filtros de marketplace
  marketplaceInclude?: string[]; // Marketplaces a incluir
  marketplaceExclude?: string[]; // Marketplaces a excluir
  // Filtros de exclusão (NÃO)
  excludeProductText?: string;
  excludeProductOperator?: TriggerConditionOperator;
  excludeState?: string; // deprecated, use excludeStates
  excludeCity?: string;
  // Filtro de tipo de documento
  documentTypes?: ('cpf' | 'cnpj')[]; // Array vazio ou undefined = aceita ambos
  // Filtros de SKU (suporta múltiplos separados por vírgula)
  productSku?: string; // SKUs a incluir
  skuOperator?: TriggerConditionOperator; // Operador para inclusão de SKU
  excludeProductSku?: string; // SKUs a excluir
  excludeSkuOperator?: TriggerConditionOperator; // Operador para exclusão de SKU
  // Filtro de CEP (suporta múltiplos separados por vírgula)
  clientZipCode?: string; // CEPs a incluir
  clientZipRange?: string; // Faixas de CEP a incluir (ex: "01000-05999, 20000000-29999999")
  excludeZipRange?: string; // Faixas de CEP a excluir
  // Filtro de loja
  storeName?: string; // Lojas a incluir (separadas por vírgula) — legado por nome
  excludeStoreName?: string; // Lojas a excluir (separadas por vírgula) — legado por nome
  /** Filtro por loja específica (stores.id). Vazio/ausente = sem filtro. */
  storeIds?: string[];
  /** Filtro por fase do Kanban (pipeline_stages.id) — cliente deve estar em uma destas fases. */
  stageInclude?: string[];
  /** Filtro por fase do Kanban (pipeline_stages.id) — cliente NÃO pode estar em nenhuma destas fases. */
  stageExclude?: string[];
  /**
   * Segmentos da Análise RFV aceitos. Vazio/undefined = todos.
   *
   * Diferença importante em relação aos filtros de pedido: client_rfv é um
   * RETRATO gravado pelo cron, então o segmento consultado quando o pedido
   * chega é o de ANTES deste pedido — "Novo Pedido de um Campeão" significa
   * "quem JÁ ERA Campeão acabou de comprar de novo".
   */
  rfvSegments?: string[];

  /* ------------------------------------------------------------------------
   * Filtros acrescentados em 22/09/2026 (contrato docs/GATILHO_FILTROS.md §S1).
   *
   * Convenção: TODO campo é opcional, e ausente / undefined / '' / [] / 'all' /
   * false significam a mesma coisa — o filtro não filtra e não pesa no E nem no
   * OU. Números são `number` (o painel converte o texto pt-BR e NÃO grava o que
   * não vira número). Datas são 'yyyy-MM-dd' lidas em America/Sao_Paulo.
   * Lista vazia grava `undefined`, nunca `[]`.
   * ---------------------------------------------------------------------- */

  /**
   * Status com que ESTE pedido chegou (`orders.order_status`, minúsculo),
   * INCLUINDO os cancelados. Não é o status do pedido anterior — no gatilho o
   * último pedido é este. Existe só no Novo Pedido: na Mudança de Status quem
   * define o status é `statuses`.
   */
  orderStatuses?: string[];

  /**
   * Nomes de produto do catálogo (faceta `products`). Casa por igualdade
   * `lower(btrim())` contra os itens DESTE pedido, e entra em UNIÃO com
   * `productText`: marcar a lista e digitar o trecho aceita quem bater em
   * qualquer um dos dois.
   */
  productNames?: string[];

  /**
   * Folga em dias entre a COMPRA ANTERIOR e este pedido — o cliente que sumiu e
   * acabou de voltar. Não usa `client_metrics`: lá `last_order_at` já é este
   * pedido. Quem nunca comprou antes REPROVA.
   */
  daysSincePreviousOrder?: number;

  /** `client_metrics.first_order_at` ≥ esta data (00:00 BRT). */
  firstOrderFrom?: string;
  /** `client_metrics.first_order_at` < o dia seguinte a esta data (00:00 BRT). */
  firstOrderTo?: string;

  /** `client_metrics.total_orders` CONTANDO este pedido. 2 = já comprou antes. */
  ordersMin?: number;
  /** Idem. 1 = é o primeiro pedido dele. */
  ordersMax?: number;

  /** `client_metrics.total_spent` já SOMANDO este pedido. */
  totalSpentMin?: number;
  totalSpentMax?: number;

  /** `total_spent / total_orders` já com este pedido (guarda `total_orders > 0`). */
  ticketMin?: number;
  ticketMax?: number;

  /** 'yes' = `total_orders >= 2` (já comprou antes); 'no' = `total_orders = 1`. */
  hasSecondSale?: 'all' | 'yes' | 'no';

  /** `clients.gender` pela 1ª letra: m→male, f→female, resto/nulo→unknown. */
  genders?: ('male' | 'female' | 'unknown')[];
  /** Balde de `coalesce(clients.age, anos(birthdate))`. Sem idade REPROVA. */
  ageBuckets?: ('-24' | '25-34' | '35-49' | '50-64' | '65+')[];
  /** Dia+mês / mês de `clients.birthdate` em BRT. Sem data REPROVA. */
  birthday?: 'all' | 'today' | 'month';

  /**
   * Dia da semana DESTE pedido (`orders.acquired_at` em America/Sao_Paulo),
   * com 0 = domingo — a régua do `extract(dow)`. Atenção: o nó Horário de
   * Atendimento e a Fila de Envio usam ISODOW (1 = segunda).
   */
  weekdays?: number[];
  /** Turno DESTE pedido em BRT: madrugada 0–5, manhã 6–11, tarde 12–17, noite 18–23. */
  shifts?: ('madrugada' | 'manha' | 'tarde' | 'noite')[];

  /** Cidades do cadastro do cliente (faceta `cities`). UNIÃO com o legado `city`. */
  cities?: string[];
  /**
   * Cidades a excluir. UNIÃO com o legado `excludeCity`. O nome COMEÇA com
   * "exclude" de propósito: é o que põe o filtro no HARD_EXCLUDE_SELLERS do
   * webhook, que bloqueia o disparo quando uma exclusão falha.
   */
  excludeCities?: string[];

  /**
   * Conversa do par (cliente, seller): 'any' existe, 'none' não existe,
   * 'inbound24' respondeu nas últimas 24 h, 'never_inbound' nunca respondeu.
   */
  conversation?: 'all' | 'any' | 'none' | 'inbound24' | 'never_inbound';
  /**
   * Descadastro de WhatsApp: 'exclude' = só quem aceita receber, 'only' = só
   * quem pediu para sair. Vale o opt-out deste seller OU o global do cliente.
   * O nome NÃO começa com "exclude" de propósito — "só quem aceita receber" é
   * uma inclusão escrita ao contrário e não entra na trava de exclusão.
   */
  optOut?: 'all' | 'exclude' | 'only';

  /** Cliente sem linha em `client_pipeline`. UNIÃO com `stageInclude`. */
  stageNone?: boolean;
  /** Cliente sem linha em `client_rfv`. UNIÃO com `rfvSegments`. */
  rfvNone?: boolean;
}

export interface ScheduleConfig {
  delayMinutes?: number;
  delayUnit?: 'seconds' | 'minutes' | 'hours' | 'days'; // Nova unidade de tempo
  delayValue?: number; // Novo valor genérico
  startHour?: number; // 0-23
  endHour?: number; // 0-23
  daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
}

export interface WhatsAppMessageConfig {
  message: string;
  instanceId?: string; // Evolution API instance ID (legacy)
  useRoundRobin?: boolean; // When true, distributes messages across all seller's instances (Evolution API)
  whatsappCloudInstanceId?: string; // WhatsApp Cloud API instance ID
  useDefaultCloudInstance?: boolean; // When true, uses the default Cloud instance
  // Message can include: {primeiro_nome}, {nome_completo}, {produto}, {valor_pedido}
}

export interface MessageReceivedConfig {
  filters?: {
    contains?: string[];
    notContains?: string[];
  };
  saveResponse?: boolean;
  // Classificação com IA integrada
  aiClassification?: {
    enabled: boolean;
    prompt: string;
    outputVariable: string;
    categories: Array<{
      label: string;
      value: string;
    }>;
  };
}

/** Gatilho: o cliente mudou de segmento na Análise RFV. */
export interface RfvSegmentChangeConfig {
  /** Segmento de destino. Vazio = qualquer. */
  toSegment?: string;
  /** Segmento de origem. Vazio = qualquer. */
  fromSegment?: string;
  /** 'entered' = entrou no segmento; 'left' = saiu dele. */
  direction?: 'entered' | 'left';
}

export interface PipelineStageChangeConfig {
  fromStageId?: string; // empty = any stage
  toStageId?: string; // empty = any stage
  minDaysInPreviousStage?: number;
}

export interface MoveToStageConfig {
  targetStageId: string;
  addNote?: boolean;
  noteContent?: string;
}

export interface AddInteractionConfig {
  interactionType: string;
  content: string;
  tags?: string[];
}

export interface AIProcessorConfig {
  provider: 'openai';
  model: 'gpt-4o-mini' | 'gpt-5-nano';
  prompt: string;
  inputVariables: string[];
  outputVariable: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIClassifierConfig {
  provider: 'openai';
  model: 'gpt-4o-mini' | 'gpt-5-nano';
  prompt: string;
  inputVariables: string[]; // Changed from inputVariable to match AIProcessorConfig
  outputVariable: string;
  categories: Array<{
    label: string;
    value: string;
    nextNodeId?: string;
  }>;
}

export interface ConditionConfig {
  conditions: Array<{
    variable: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'greater_than_or_equals' | 'less_than_or_equals' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty' | 'in_list' | 'not_in_list';
    value: string | number;
    nextNodeId?: string;
  }>;
  defaultNextNodeId?: string;
}

export interface SendTemplateConfig {
  templateName: string;
  whatsappCloudInstanceId?: string; // WhatsApp Cloud API instance ID
  useDefaultCloudInstance?: boolean; // When true, uses the default Cloud instance
  /** Body text snapshot used for node preview (not sent to API) */
  templateBodyPreview?: string;
  /** URL pública da mídia do header (imagem/vídeo/documento). Se preenchido, substitui a mídia de exemplo do template no envio. */
  headerMediaUrl?: string;
  /** Caminho interno da mídia enviada para o bucket template-media (ex: seller_id/arquivo.jpg). Assinado no momento do envio. */
  headerMediaPath?: string;
  templateParams: Array<{
    type: 'body' | 'header' | 'button';
    /**
     * Para templates com placeholders numéricos: o número do placeholder (ex: {{1}}).
     * Para templates com placeholders nomeados: apenas um índice de ordenação (1..N).
     */
    index: number;
    /** Nome do parâmetro (ex: {{nome}}). Opcional para manter compatibilidade. */
    name?: string;
    value: string;
    placeholder?: string;
  }>;
}

export interface WaitForReplyConfig {
  timeoutMinutes: number;
  timeoutNextNodeId?: string;
  replyNextNodeId?: string;
}

export interface WebhookPayloadSelection {
  order?: boolean;
  /** Bloco só do item (nome, SKU, marketplace, valor), para quem não quer o pedido inteiro. */
  product?: boolean;
  client?: boolean;
  chatHistory?: boolean;
  /** Linha do tempo completa do cliente (aba Histórico do sheet): pedidos, mensagens, CRM, workflows. */
  clientHistory?: boolean;
  conversation?: boolean;
  workflow?: boolean;
  seller?: boolean;
  custom?: boolean;
}

export interface WebhookCallConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  outputVariable?: string;
  payload?: WebhookPayloadSelection;
  chatHistoryLimit?: number;
  /** Teto de eventos do Histórico do Cliente no payload (1-500, padrão 100). */
  clientHistoryLimit?: number;
}

export interface DelayDynamicConfig {
  delayVariable: string;
  delayUnit: 'seconds' | 'minutes' | 'hours' | 'days';
}

/**
 * Mudança de Status do Pedido.
 *
 * Herda TODO o vocabulário de filtros do `TriggerCondition` (contrato
 * docs/GATILHO_FILTROS.md §S4.6): as chaves acrescentadas lá chegam aqui
 * sozinhas, e acaba a cópia à mão que já tinha divergido uma vez.
 *
 * A única exceção é `orderStatuses`: aqui "o status deste pedido" já é o campo
 * `statuses`, que define QUANDO o gatilho dispara — os dois juntos seriam
 * convite a contradição ("dispara em `paid`, mas só se o status for `shipped`"
 * = nunca dispara).
 *
 * Os campos repetidos abaixo são os mesmos do pai, com os mesmos tipos; ficam
 * escritos para não apagar histórico de quem os manteve, e o TypeScript exige
 * que continuem compatíveis com o `TriggerCondition`.
 */
export interface OrderStatusChangeConfig extends Omit<TriggerCondition, 'orderStatuses'> {
  statuses: string[];
  // Filtros avançados (mesmos do TriggerCondition)
  orderValue?: number;
  /** Teto da faixa. Só é lido quando orderValueOperator === 'between'. */
  orderValueMax?: number;
  orderValueOperator?: TriggerValueOperator;
  productText?: string;
  productOperator?: TriggerConditionOperator;
  excludeProductText?: string;
  excludeProductOperator?: TriggerConditionOperator;
  productSku?: string;
  skuOperator?: TriggerConditionOperator;
  excludeProductSku?: string;
  excludeSkuOperator?: TriggerConditionOperator;
  clientState?: string[];
  excludeStates?: string[];
  regionsInclude?: string[];
  city?: string;
  excludeCity?: string;
  clientZipCode?: string;
  clientZipRange?: string;
  excludeZipRange?: string;
  marketplaceInclude?: string[];
  marketplaceExclude?: string[];
  documentTypes?: ('cpf' | 'cnpj')[];
  storeName?: string;
  excludeStoreName?: string;
  /** Filtro por loja específica (stores.id). Vazio/ausente = sem filtro. */
  storeIds?: string[];
}

export interface WhatsAppReplyConfig {
  message: string;
  // Message can include: {primeiro_nome}, {nome_completo}, {produto}, {valor_pedido}, {resposta_ia}
  /**
   * Anexo opcional, enviado antes do texto. Imagem/vídeo levam a mensagem como
   * legenda; documento e áudio mandam a mensagem em seguida. Áudio sobe já em
   * Ogg/Opus e sai como nota de voz (`voice: true`).
   */
  mediaType?: 'image' | 'video' | 'document' | 'audio';
  mediaSource?: 'upload' | 'url';
  /** Path no bucket template-media (quando mediaSource = 'upload') */
  mediaPath?: string;
  /** URL pública HTTPS (quando mediaSource = 'url') */
  mediaUrl?: string;
  /** Nome do arquivo para documentos */
  filename?: string;
  /**
   * Segunda saída paralela (opt-in, desligada por padrão).
   *
   * POR QUE É OPT-IN: o motor sempre seguiu UMA aresta por nó (`edges.find`),
   * então existem hoje arestas desenhadas no canvas que nunca executaram — 111
   * delas, em 87 workflows ativos de 43 sellers. Se o fan-out fosse implícito
   * ("siga todas as arestas"), essas arestas acenderiam de uma vez e mandariam
   * ~480 mensagens/semana a clientes que ninguém quis contatar. Com esta flag
   * ausente/false o nó se comporta exatamente como sempre se comportou.
   *
   * Ligada: o nó expõe dois handles de saída OPACOS e estáveis ('saida-1' e
   * 'saida-2') e o motor executa os dois caminhos em paralelo — o primeiro no
   * próprio job, o segundo num job novo (fork via RPC enqueue_workflow).
   */
  segundaSaida?: boolean;
}

/**
 * Ids dos handles de saída quando a segunda saída está ligada.
 *
 * São OPACOS de propósito: nunca derive id de handle do rótulo digitado pelo
 * usuário. Foi exatamente isso que produziu, em produção, handles com espaço em
 * branco no fim e handles sufixados `__N` — e o `OR` de quatro cláusulas que o
 * motor precisa carregar para sobreviver a eles.
 */
export const SAIDA_PARALELA_1 = 'saida-1';
export const SAIDA_PARALELA_2 = 'saida-2';

export type DistributeStrategy = 'balanced' | 'round-robin' | 'weighted';

export interface DistributeToStagesConfig {
  /** IDs das pipeline_stages para onde os clientes serão distribuídos (mín. 2) */
  targetStageIds: string[];
  /** Estratégia de distribuição */
  strategy: DistributeStrategy;
  /** Pesos por stageId (somente quando strategy = 'weighted'). Devem somar 100. */
  weights?: Record<string, number>;
  /** Adicionar nota automática ao mover */
  addNote?: boolean;
  noteContent?: string;
  /** Se true, não move o cliente — apenas salva a fase escolhida em {distributed_stage_id} no contexto */
  variableOnly?: boolean;
}

export interface WorkflowExecutionContext {
  order_id?: string;
  order_value?: number;
  order_product?: string;
  order_marketplace?: string;
  client_id?: string;
  client_name?: string;
  client_first_name?: string;
  client_whatsapp?: string;
  client_email?: string;
  client_city?: string;
  client_state?: string;
  conversation_id?: string;
  message_id?: string;
  message_content?: string;
  current_stage_id?: string;
  current_stage_name?: string;
  days_in_stage?: number;
  [key: string]: any;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    config?: 
      | TriggerCondition 
      | ScheduleConfig 
      | WhatsAppMessageConfig 
      | MessageReceivedConfig 
      | PipelineStageChangeConfig 
      | RfvSegmentChangeConfig
      | MoveToStageConfig 
      | AddInteractionConfig
      | AIProcessorConfig
      | AIClassifierConfig
      | ConditionConfig
      | SendTemplateConfig
      | WaitForReplyConfig
      | WebhookCallConfig
      | DelayDynamicConfig
      | WhatsAppReplyConfig
      | OrderStatusChangeConfig
      | DistributeToStagesConfig
      | EmailSendConfig
      | EmailTemplateConfig
      | SmsSendTemplateConfig
      | SmsSendFreeConfig;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface Workflow {
  id: string;
  seller_id: string;
  name: string;
  description?: string;
  active: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at: string;
  updated_at: string;
  created_by: string;
}
