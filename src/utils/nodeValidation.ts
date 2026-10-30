import { WorkflowNodeType } from '@/types/workflow';

/**
 * Parcial de propósito: tipo sem validador conta como configurado, então
 * incluir um nó novo no catálogo não faz o canvas acusar erro sozinho.
 */
const validators: Partial<Record<WorkflowNodeType, (config: any) => boolean>> = {
  // WhatsApp
  'send-template': (config) => !!config?.templateName,
  'send-media': (config) => !!(config?.mediaPath || config?.mediaUrl),
  'send-document': (config) => !!(config?.mediaPath || config?.mediaUrl),
  'wait-for-reply': (config) => !!config?.timeoutMinutes,
  // Sem status marcado o motor pula o nó e o ramo morre ali (13/10/2026). Antes
  // não havia validador e o card nunca acusava; o tempo limite tem padrão (1 dia).
  'wait-for-status-change': (config) =>
    Array.isArray(config?.statuses) && config.statuses.length > 0,

  // Email
  // `emailExemplo`/`smsExemplo`: template de EXEMPLO do editor de proposta
  // (docs/FLUXOS_PROPOSTA.md, contrato v2) — o id fica vazio de propósito, e
  // sem isto o card acusava "Configuração necessária" ao lado da ficha cheia.
  // Inócuo no builder real: a chave nunca existe lá (a exportação a remove).
  'email-template': (config) => !!config?.template_id || !!config?.emailExemplo,
  'email-send': (config) => !!config?.subject,

  // SMS
  'send-sms-template': (config) => !!config?.templateId || !!config?.smsExemplo,
  'send-sms-free': (config) => !!config?.message,

  // IA
  'ai-processor': (config) => !!config?.prompt,
  'ai-classifier': (config) => (config?.categories?.length ?? 0) > 0,

  // Lógica
  'condition': (config) => (config?.conditions?.length ?? 0) > 0,
  'delay-dynamic': (config) => !!config?.delayVariable,
  'queue-throttle': (config) =>
    (config?.rateMode === 'per_minute' && !!config?.ratePerMinute) ||
    (config?.rateMode === 'interval_seconds' && !!config?.intervalSeconds),

  // CRM
  'move-to-stage': (config) => !!config?.targetStageId,
  'add-interaction': (config) => !!config?.interactionType,

  // Integrações
  'webhook-call': (config) => !!config?.url,
};

export const isNodeConfigured = (type: WorkflowNodeType, data: any): boolean => {
  const validate = validators[type];
  return validate ? validate(data?.config) : true;
};
