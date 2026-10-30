/**
 * FONTE ÚNICA do catálogo de nós — dado puro, sem React e sem lucide.
 *
 * Mora em supabase/functions/_shared/ porque a edge `ai-build-workflow` roda em
 * Deno e não consegue importar `src/components/workflow/nodeCatalog.ts` (que
 * puxa lucide-react e WhatsAppIcon.tsx). O caminho é o inverso: o
 * `nodeCatalog.ts` do front compõe a partir DAQUI, só acrescentando o ícone.
 *
 * Quem entra com um tipo de nó novo mexe NESTE arquivo — e aí ele aparece de
 * uma vez na paleta, no prompt da IA e no enum da tool `propor_fluxo`. Lista
 * escrita à mão em qualquer um dos três dessincroniza no primeiro nó novo.
 * Faltam só dois complementos no front, ambos cobrados pelo typecheck: o ícone
 * em `NODE_ICONS` e o tipo na união `WorkflowNodeType` (src/types/workflow.ts).
 *
 * A ordem das chaves é a ordem de exibição na paleta (Object.entries preserva
 * ordem de inserção) — não reordene sem querer mudar a paleta.
 *
 * O campo `ia` só é lido pelo prompt da edge; o front ignora. Ele guarda a
 * forma do `config` (de src/types/workflow.ts) e, principalmente, os
 * `sourceHandle` REAIS de cada nó ramificável — que são os desta base, não os
 * do Segundo Pedido (aqui `condition` usa condition-N/default, não true/false).
 */

export type NodeCategoryTitle =
  | 'Gatilhos'
  | 'Comunicação WhatsApp'
  | 'Comunicação Email'
  | 'Comunicação SMS'
  | 'Inteligência Artificial'
  | 'Lógica'
  | 'CRM'
  | 'Integrações';

/**
 * Record (e não array) para o tsc cobrar uma posição de toda categoria nova:
 * categoria fora daqui não entra em categorizedNodes() e some da paleta sem aviso.
 * A ordem das chaves é a ordem de exibição.
 */
const CATEGORY_POSITION: Record<NodeCategoryTitle, null> = {
  'Gatilhos': null,
  'Comunicação WhatsApp': null,
  'Comunicação Email': null,
  'Comunicação SMS': null,
  'Inteligência Artificial': null,
  'Lógica': null,
  'CRM': null,
  'Integrações': null,
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_POSITION) as NodeCategoryTitle[];

/** Dicas destinadas só ao system prompt da IA construtora de fluxos. */
export interface CatalogNodeIaHints {
  /** Forma resumida do `config` do nó, como a IA deve emitir. */
  config?: string;
  /** sourceHandle REAIS das saídas ramificadas. Ausente = saída única sem id. */
  saidas?: readonly string[];
  /** Uma frase de advertência/regra de negócio. */
  nota?: string;
}

export interface CatalogDataEntry {
  /** Rótulo da tile da paleta — cabe em 2 linhas, pode ser descritivo. */
  label: string;
  /** Título do card no canvas, quando o rótulo da paleta não cabe. */
  nodeTitle?: string;
  description: string;
  category: NodeCategoryTitle;
  ia?: CatalogNodeIaHints;
}

export const NODE_CATALOG_DATA = {
  // ---------------------------------------------------------------- Gatilhos
  'trigger': {
    label: 'Novo Pedido',
    description: 'Iniciar quando um novo pedido for criado',
    category: 'Gatilhos',
    ia: { config: 'objeto de FILTROS (ver seção FILTROS), incluindo orderStatuses. {} = qualquer pedido novo' },
  },
  'schedule': {
    label: 'Programação',
    description: 'Executar em horários específicos',
    category: 'Gatilhos',
    ia: { config: '{ delayValue:number, delayUnit:"minutes"|"hours"|"days", startHour:0-23, endHour:0-23, daysOfWeek:[0-6] }' },
  },
  // Até 23/09/2026 morava em "Comunicação WhatsApp", ao lado de "Responder
  // WhatsApp". Com a reescrita (config v2, contrato em _shared/mensagemRecebida.ts)
  // ele virou um gatilho de verdade — raiz, sem entrada, uma saída — e foi
  // para junto dos outros gatilhos. A cor continua a verde do canal
  // (workflowColors.ts), e é por isso que o card mantém a etiqueta "Gatilho".
  //
  // O `ia.config` descreve a v2 inteira porque a IA construtora emite o config
  // cru: a IA embutida (aiClassification) e o saveResponse NÃO existem mais —
  // a classificação é o bloco ai-classifier depois do gatilho, e o texto do
  // cliente já chega a ele como {mensagem_cliente}.
  'message-received': {
    label: 'Mensagem Recebida',
    description: 'Inicia o fluxo quando o cliente manda mensagem de texto no WhatsApp',
    category: 'Gatilhos',
    ia: {
      config:
        '{ versao:2, palavras?:string[] (vazio = qualquer texto), modoPalavras?:"qualquer"|"todas"|"exata"|"comeca", ' +
        'palavraInteira?:boolean (padrão true, vale para as DUAS listas: "sim" não casa "simples" e "cancel" não bloqueia "cancelar" — escreva cada forma completa), ' +
        'palavrasBloqueio?:string[] (tem qualquer uma → não dispara; nunca repita nelas uma palavra que dispara), ' +
        'ignorarCumprimentos?:boolean (padrão true: mensagem feita só de "oi", "ok", "obrigado", "bom dia", "sim", "pode ser", 👍 não dispara; palavra posta em palavras fura o filtro), ' +
        'momento?:"qualquer"|"primeira_conversa"|"retorno", retornoDias?:number (padrão 30, só com momento "retorno"; retorno inclui o primeiro contato de cliente novo), ' +
        'publico?:"todos"|"com_pedido"|"sem_pedido" (com "sem_pedido" NÃO use filtro de pedido/produto, itemQuantityMin nem ordersMin: nunca dispararia), ' +
        'filtros?:objeto de FILTROS (seção FILTROS) avaliado sobre o ÚLTIMO pedido do cliente, sem weekdays/shifts/conversation/optOut, ' +
        'travas?:{ roboMinutos:10, humanoHoras:12, maxPorHora:3, maxPorDia:5, respostaRapidaSegundos:3 } (0 desliga cada uma), ' +
        'repeticao?:{ modo:"intervalo"|"uma_vez"|"sempre", horas?:24 }, agruparSegundos?:20 (0-120), prioridade?:100 (menor dispara primeiro) }. ' +
        'Omita o que ficar no padrão; numeroIds só com id REAL de número, normalmente omita',
      nota:
        'É GATILHO (raiz, saída única). Só mensagem de TEXTO dispara (áudio, foto e botão não) e só quando a conversa NÃO está num Aguardar Resposta. ' +
        'Se vários fluxos casam com a mesma mensagem, dispara só o de menor prioridade. NÃO classifica intenção: para ramificar pelo que o cliente quis dizer, ' +
        'ligue um ai-classifier logo depois (o texto chega como {mensagem_cliente}); horário de atendimento é o business-hours depois do gatilho. ' +
        'Quem pediu para sair (opt-out) nunca dispara.',
    },
  },
  'pipeline-stage-change': {
    label: 'Mudança de Etapa',
    description: 'Executar quando cliente mudar de etapa',
    category: 'Gatilhos',
    ia: { config: '{ fromStageId?:uuid, toStageId?:uuid, minDaysInPreviousStage?:number }' },
  },
  'rfv-segment-change': {
    label: 'Mudou de Segmento RFV',
    description: 'Iniciar quando o cliente entra ou sai de um segmento',
    category: 'Gatilhos',
    ia: {
      config: '{ direction:"entered"|"left", toSegment?:string, fromSegment?:string }',
      nota: 'Use só os segmentos RFV REAIS listados nos dados deste cliente.',
    },
  },
  'retroactive-trigger': {
    label: 'Disparo Retroativo',
    description: 'Processar clientes já cadastrados na base',
    category: 'Gatilhos',
    ia: {
      config: '{}',
      nota: 'Público e cadência são escolhidos no botão Play, NÃO no nó. Nunca coloque filtros aqui.',
    },
  },
  'order-status-change': {
    label: 'Mudança de Status',
    description: 'Dispara quando o status do pedido muda',
    category: 'Gatilhos',
    ia: { config: '{ statuses:string[] } + os mesmos campos da seção FILTROS, MENOS orderStatuses (aqui o status é o próprio statuses). Use os status REAIS listados' },
  },
  'shipment-status-change': {
    label: 'Mudança de status de envio',
    nodeTitle: 'Mudança de Status de Envio',
    description: 'Dispara em eventos de rastreio (postado, em trânsito, saiu p/ entrega, entregue)',
    category: 'Gatilhos',
    ia: {
      config: '{ shipment_statuses:string[], pipeline_stage_filter?:uuid[], storeIds?:uuid[] }',
      saidas: ['um handle por status configurado, com id IGUAL ao status: posted | in_transit | out_for_delivery | delivered | returned | exception'],
      nota: 'O sourceHandle é o próprio status. Com um único status, ainda assim use o status como sourceHandle.',
    },
  },
  'delivery-forecast': {
    label: 'Previsão de entrega',
    nodeTitle: 'Previsão de Entrega',
    description: 'Dispara X dias antes da previsão de entrega da transportadora',
    category: 'Gatilhos',
    ia: {
      config: '{ daysBeforeMin:number, daysBeforeMax:number, carriers?:string[], storeIds?:string[] }',
      nota: 'Só alcança pedido com opt-in. Peça o opt-in antes (ver PADRÕES) em vez de usar direto.',
    },
  },

  // ------------------------------------------------------ Comunicação WhatsApp
  'whatsapp': {
    label: 'Enviar WhatsApp (API não oficial)',
    // O card já carrega a etiqueta "não oficial" ao lado do título.
    nodeTitle: 'WhatsApp',
    description: 'Enviar mensagem personalizada',
    category: 'Comunicação WhatsApp',
    ia: {
      config: '{ message:string, useRoundRobin?:boolean }',
      nota: 'API NÃO oficial (Evolution). Use apenas se o usuário pedir explicitamente; o padrão é send-template.',
    },
  },
  'send-template': {
    label: 'Template WhatsApp',
    description: 'Enviar template aprovado',
    category: 'Comunicação WhatsApp',
    ia: {
      config: '{ templateName:string, useDefaultCloudInstance:true, templateParams:[{ type:"body", index:1, value:"{primeiro_nome}" }] }',
      nota: 'Um templateParams por variável {{n}} do corpo do template. Use apenas nomes de template da lista real.',
    },
  },
  'whatsapp-reply': {
    label: 'Responder WhatsApp',
    description: 'Responder na conversa ativa',
    category: 'Comunicação WhatsApp',
    ia: {
      config: '{ message:string }',
      nota: 'Texto livre: só entrega dentro da janela de 24h após o cliente falar.',
    },
  },
  'send-media': {
    label: 'Enviar Imagem/Vídeo',
    description: 'Enviar imagem ou vídeo com legenda opcional',
    category: 'Comunicação WhatsApp',
    ia: { config: '{ mediaType:"image"|"video", mediaSource:"url", mediaUrl:string, caption?:string, useDefaultCloudInstance:true }' },
  },
  'send-document': {
    label: 'Enviar Documento',
    description: 'Enviar PDF, catálogo ou outro arquivo',
    category: 'Comunicação WhatsApp',
    ia: { config: '{ mediaSource:"url", mediaUrl:string, filename?:string, caption?:string, useDefaultCloudInstance:true }' },
  },
  'wait-for-reply': {
    label: 'Aguardar Resposta',
    description: 'Pausar até receber resposta',
    category: 'Comunicação WhatsApp',
    ia: {
      config: '{ timeoutMinutes:number }',
      saidas: ['reply (o cliente respondeu)', 'timeout (estourou o prazo)'],
    },
  },

  // --------------------------------------------------------- Comunicação Email
  'email-template': {
    label: 'Template de E-mail',
    description: 'Enviar um template salvo',
    category: 'Comunicação Email',
    ia: { config: '{ to:"{email}", template_id:uuid, variables?:{ chave:"valor" } }' },
  },
  'email-send': {
    label: 'Enviar E-mail',
    description: 'Escrever assunto e corpo no próprio nó',
    category: 'Comunicação Email',
    ia: { config: '{ to:"{email}", subject:string, body_html:string }' },
  },

  // ----------------------------------------------------------- Comunicação SMS
  'send-sms-template': {
    label: 'Template de SMS',
    description: 'Enviar um template salvo',
    category: 'Comunicação SMS',
    ia: { config: '{ templateId:uuid, templateName:string }' },
  },
  'send-sms-free': {
    label: 'Enviar SMS',
    description: 'Escrever a mensagem no próprio nó',
    category: 'Comunicação SMS',
    ia: { config: '{ to_phone:"{whatsapp}", message:string }' },
  },

  // ------------------------------------------------- Inteligência Artificial
  'ai-processor': {
    label: 'Processar com IA',
    description: 'Gerar conteúdo com IA',
    category: 'Inteligência Artificial',
    ia: { config: '{ provider:"openai", model:"gpt-4o-mini", prompt:string, inputVariables:string[], outputVariable:string }' },
  },
  'ai-classifier': {
    label: 'Classificar com IA',
    description: 'Classificar em categorias',
    category: 'Inteligência Artificial',
    ia: {
      config: '{ provider:"openai", model:"gpt-4o-mini", prompt:string, inputVariables:["ultima_mensagem"], outputVariable:"categoria", categories:[{ label, value }] }',
      saidas: ['um handle por categoria, com id IGUAL ao "value" da categoria'],
      nota: 'Toda categoria precisa de uma aresta saindo dela, senão o ramo morre.',
    },
  },

  // ------------------------------------------------------------------- Lógica
  'condition': {
    label: 'Condição',
    description: 'Criar ramificações condicionais',
    category: 'Lógica',
    ia: {
      config: '{ conditions:[{ variable, operator, value }] }',
      saidas: ['condition-0 (1ª condição)', 'condition-1 (2ª)', '… condition-N', 'default (nenhuma bateu)'],
      nota: 'NÃO existe handle "true"/"false" nesta plataforma — aresta com handle inexistente nunca é seguida. Ramo por região do cliente: { variable:"regiao", operator:"in_list", value:"Sudeste, Sul" } (rótulos Norte, Nordeste, Centro-Oeste, Sudeste, Sul; sem estado cadastrado = vazio: nunca casa in_list e SEMPRE casa not_in_list — para separar esse grupo, ponha antes uma condição is_empty).',
    },
  },
  'delay-dynamic': {
    label: 'Atraso Dinâmico',
    description: 'Pausar por tempo variável',
    category: 'Lógica',
    ia: { config: '{ delayVariable:"2", delayUnit:"seconds"|"minutes"|"hours"|"days" } (delayVariable é o número em texto)' },
  },
  'queue-throttle': {
    label: 'Fila de Envio',
    description: 'Limita taxa de disparo para evitar burst',
    category: 'Lógica',
    ia: {
      config: '{ rateMode:"per_minute", ratePerMinute:2, respectBusinessHours:true, startHour:9, endHour:18, daysOfWeek:[1,2,3,4,5], timezone:"America/Sao_Paulo" }',
      nota: 'daysOfWeek em ISODOW (1=Seg…7=Dom). Vai ANTES do nó de envio, e só se o usuário pedir para espaçar/limitar.',
    },
  },
  'business-hours': {
    label: 'Horário de Atendimento',
    description: 'Separa quem chega dentro do expediente de quem chega fora',
    category: 'Lógica',
    ia: {
      config: '{ daysOfWeek:[1,2,3,4,5], useTimeWindow:true, startTime:"09:00", endTime:"18:00", timezone:"America/Sao_Paulo" }',
      saidas: ['dentro (está no expediente)', 'fora (fim de semana, feriado informal, madrugada…)'],
      nota: 'daysOfWeek em ISODOW (1=Seg…7=Dom), igual ao queue-throttle. useTimeWindow:false ignora horário e separa SÓ por dia (use quando o usuário disser apenas "fim de semana" sem citar horas); ausente = true. Horários em HH:MM. NÃO adia nada — só ramifica; para segurar o envio até abrir, ponha um queue-throttle depois da saída "fora". Quando endTime <= startTime a janela atravessa a meia-noite e o dia marcado é o da abertura.',
    },
  },
  'wait-for-status-change': {
    label: 'Aguardar Mudança de Status',
    description: 'Pausar até o pedido mudar de status',
    category: 'Lógica',
    ia: {
      config: '{ statuses:string[], timeoutMinutes:number }',
      saidas: ['status (mudou para um dos status)', 'timeout (não mudou a tempo)'],
    },
  },

  // ---------------------------------------------------------------------- CRM
  'move-to-stage': {
    label: 'Mover para Etapa',
    description: 'Alterar etapa do pipeline',
    category: 'CRM',
    ia: { config: '{ targetStageId:uuid, addNote?:boolean, noteContent?:string }' },
  },
  'distribute-to-stages': {
    label: 'Distribuir entre Fases',
    description: 'Distribuir cliente entre múltiplas fases',
    category: 'CRM',
    ia: { config: '{ targetStageIds:[uuid,uuid], strategy:"balanced"|"round-robin"|"weighted", weights?:{ uuid:number }, variableOnly?:boolean }' },
  },
  'add-interaction': {
    label: 'Adicionar Notas',
    description: 'Registrar interação ou anotação',
    category: 'CRM',
    ia: { config: '{ interactionType:"note", content:string }' },
  },
  'mark-forecast-opt-in': {
    label: 'Confirmar Opt-in Forecast',
    description: 'Autoriza envio dos avisos de previsão de entrega (usar após resposta positiva)',
    category: 'CRM',
    ia: {
      config: '{ revoke?:boolean }',
      nota: 'Use no ramo POSITIVO da classificação, logo depois de o cliente aceitar receber avisos.',
    },
  },
  'invalid-number': {
    label: 'Número Incorreto',
    description: 'Notificar CPF com número incorreto',
    category: 'CRM',
    ia: {
      config: '{}',
      nota: 'Use no ramo "numero errado" do ai-classifier, seguido de um whatsapp-reply pedindo desculpas.',
    },
  },

  // -------------------------------------------------------------- Integrações
  'webhook-call': {
    label: 'Chamar Webhook',
    description: 'Enviar requisição HTTP externa',
    category: 'Integrações',
    ia: { config: '{ url:string, method:"GET"|"POST"|"PUT"|"DELETE", headers?:{}, body?:string, outputVariable?:string }' },
  },
} as const satisfies Record<string, CatalogDataEntry>;

export type AiNodeType = keyof typeof NODE_CATALOG_DATA;

/** Os 32 tipos, na ordem do catálogo. Vira o enum da tool `propor_fluxo`. */
export const AI_NODE_TYPES = Object.keys(NODE_CATALOG_DATA) as AiNodeType[];
