import { WorkflowNodeType } from '@/types/workflow';

export interface NodeStyle {
  /** Classes do fundo do chip 32x32 do ícone. */
  iconBg: string;
  /** Classes da cor do glifo. */
  iconColor: string;
  /** Hex cru: handles, faixa do painel e sombra tingida não passam por classe Tailwind. */
  accentHex: string;
}

const ORANGE:  NodeStyle = { iconBg: 'bg-orange-500/10 dark:bg-orange-400/15',   iconColor: 'text-orange-700 dark:text-orange-300',   accentHex: '#f97316' };
const AMBER:   NodeStyle = { iconBg: 'bg-amber-500/10 dark:bg-amber-400/15',     iconColor: 'text-amber-700 dark:text-amber-300',     accentHex: '#f59e0b' };
const TEAL:    NodeStyle = { iconBg: 'bg-teal-600/10 dark:bg-teal-400/15',       iconColor: 'text-teal-700 dark:text-teal-300',       accentHex: '#0d9488' };
const EMERALD: NodeStyle = { iconBg: 'bg-emerald-500/10 dark:bg-emerald-400/15', iconColor: 'text-emerald-700 dark:text-emerald-300', accentHex: '#10b981' };
const SKY:     NodeStyle = { iconBg: 'bg-sky-500/10 dark:bg-sky-400/15',         iconColor: 'text-sky-700 dark:text-sky-300',         accentHex: '#0ea5e9' };
const BLUE:    NodeStyle = { iconBg: 'bg-blue-600/10 dark:bg-blue-400/15',       iconColor: 'text-blue-800 dark:text-blue-300',       accentHex: '#2563eb' };
const VIOLET:  NodeStyle = { iconBg: 'bg-violet-600/10 dark:bg-violet-400/15',   iconColor: 'text-violet-800 dark:text-violet-300',   accentHex: '#7c3aed' };
const INDIGO:  NodeStyle = { iconBg: 'bg-indigo-600/10 dark:bg-indigo-400/15',   iconColor: 'text-indigo-800 dark:text-indigo-300',   accentHex: '#4f46e5' };
const CYAN:    NodeStyle = { iconBg: 'bg-cyan-700/10 dark:bg-cyan-400/15',       iconColor: 'text-cyan-800 dark:text-cyan-300',       accentHex: '#0e7490' };
const ROSE:    NodeStyle = { iconBg: 'bg-rose-600/10 dark:bg-rose-400/15',       iconColor: 'text-rose-800 dark:text-rose-300',       accentHex: '#e11d48' };
const PURPLE:  NodeStyle = { iconBg: 'bg-purple-700/10 dark:bg-purple-400/15',   iconColor: 'text-purple-900 dark:text-purple-300',   accentHex: '#7e22ce' };
const FALLBACK: NodeStyle = { iconBg: 'bg-muted', iconColor: 'text-muted-foreground', accentHex: '#a3a3a3' };

/**
 * Cor por tipo de nó. Quando o nó fala com o cliente, quem manda é o CANAL;
 * nos demais, manda o papel do nó no fluxo. Gatilho é sempre laranja — inclusive
 * "Mensagem Recebida", que até 01/10/2026 saía verde de WhatsApp e destoava dos
 * outros gatilhos na paleta (pedido do dono).
 */
const styleByType: Record<WorkflowNodeType, NodeStyle> = {
  // Gatilhos
  'trigger': ORANGE,
  'schedule': ORANGE,
  'message-received': ORANGE,
  'retroactive-trigger': AMBER,
  'rfv-segment-change': ORANGE,
  'pipeline-stage-change': ORANGE,
  'order-status-change': ORANGE,
  'shipment-status-change': ORANGE,
  'delivery-forecast': ORANGE,

  // WhatsApp
  'send-template': EMERALD,
  'whatsapp-reply': EMERALD,
  'whatsapp': EMERALD,
  'send-media': EMERALD,
  'send-document': EMERALD,
  'wait-for-reply': EMERALD,

  // Email
  'email-template': SKY,
  'email-send': SKY,

  // SMS
  'send-sms-template': BLUE,
  'send-sms-free': BLUE,

  // IA
  'ai-processor': VIOLET,
  'ai-classifier': VIOLET,

  // Lógica
  'condition': INDIGO,
  'delay-dynamic': INDIGO,
  'queue-throttle': INDIGO,
  'wait-for-status-change': INDIGO,

  // CRM
  'move-to-stage': CYAN,
  'distribute-to-stages': CYAN,
  'add-interaction': CYAN,
  'mark-forecast-opt-in': CYAN,
  'invalid-number': ROSE,

  // Integrações
  'webhook-call': PURPLE,
};

export const getNodeStyle = (type: WorkflowNodeType): NodeStyle =>
  styleByType[type] || FALLBACK;

/** Sombra tingida com o accent do nó — reforça a borda, nunca substitui: a 8% de
 *  alfa ela não desenha aresta nenhuma sobre o fundo quase preto do tema escuro. */
export const nodeShadow = (accentHex: string, hovered?: boolean): string =>
  hovered
    ? `0 4px 12px ${accentHex}25, 0 2px 6px ${accentHex}15`
    : `0 1px 3px ${accentHex}15, 0 2px 6px ${accentHex}10`;
