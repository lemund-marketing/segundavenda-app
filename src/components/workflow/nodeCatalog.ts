import type { ComponentType } from 'react';
import {
  Brain,
  CheckCircle2,
  Clock,
  DatabaseZap,
  GitBranch,
  Hourglass,
  Mail,
  MailCheck,
  MessageSquarePlus,
  MessageSquareText,
  MoveRight,
  PhoneOff,
  PlayCircle,
  RefreshCw,
  Shuffle,
  Smartphone,
  Sparkles,
  Target,
  Timer,
  Truck,
  Webhook,
  Zap,
} from 'lucide-react';
import WhatsAppIcon from '@/components/WhatsAppIcon';
import { WorkflowNodeType } from '@/types/workflow';
import {
  NODE_CATALOG_DATA,
  CATEGORY_ORDER,
  type AiNodeType,
  type NodeCategoryTitle,
} from '../../../supabase/functions/_shared/nodeCatalogData.ts';

// Rótulo, descrição e categoria de cada nó moram em
// supabase/functions/_shared/nodeCatalogData.ts (dado puro, sem React) porque a
// edge `ai-build-workflow` roda em Deno e não consegue importar este arquivo.
// Aqui só entra o ÍCONE. Reexportamos os dois nomes para quem já importava daqui.
export type { NodeCategoryTitle };
export { CATEGORY_ORDER };

export interface NodeCatalogEntry {
  type: WorkflowNodeType;
  /** Rótulo da tile da paleta — cabe em 2 linhas, pode ser descritivo. */
  label: string;
  /**
   * Título do card no canvas, quando o rótulo da paleta não cabe. O header tem
   * ~80px úteis depois do chip do ícone e do headerBadge; sem isto o `truncate`
   * corta o título no meio.
   */
  nodeTitle?: string;
  // ComponentType (e não ElementType) porque o BaseNode renderiza <Icon/> direto;
  // ComponentType é subtipo de ElementType, então continua servindo onde a prop pede ElementType.
  icon: ComponentType<any>;
  description: string;
  category: NodeCategoryTitle;
}

/**
 * Trava de compilação: a união de tipos do canvas e o catálogo compartilhado
 * precisam listar exatamente os mesmos nós. Quem adicionar um tipo em só um dos
 * dois quebra o typecheck aqui, em vez de descobrir em produção que a IA nunca
 * propõe o nó novo (ou que o nó proposto é descartado por "tipo desconhecido").
 */
// app: 'business-hours' já está no catálogo compartilhado e ainda não tem nó
// no canvas (ver o filtro do NODE_CATALOG). O app compila sem erro de tipo, então
// a trava e os ícones descontam só ele; outro tipo divergente continua acusando.
type AiNodeTypeNoCanvas = Exclude<AiNodeType, 'business-hours'>;
type CatalogoSincronizado =
  [Exclude<AiNodeTypeNoCanvas, WorkflowNodeType> | Exclude<WorkflowNodeType, AiNodeTypeNoCanvas>] extends [never]
    ? true
    : {
        erro: 'nodeCatalogData.ts e WorkflowNodeType divergiram';
        sobrandoNoCatalogo: Exclude<AiNodeTypeNoCanvas, WorkflowNodeType>;
        faltandoNoCatalogo: Exclude<WorkflowNodeType, AiNodeTypeNoCanvas>;
      };
const _catalogoSincronizado: CatalogoSincronizado = true;
void _catalogoSincronizado;

/**
 * Ícone de cada tipo. Record (e não objeto solto) para o tsc cobrar um ícone de
 * todo tipo novo que entrar no catálogo compartilhado.
 */
const NODE_ICONS: Record<AiNodeTypeNoCanvas, ComponentType<any>> = {
  // Gatilhos
  'trigger': Zap,
  'schedule': Clock,
  'message-received': MessageSquareText,
  'pipeline-stage-change': PlayCircle,
  'rfv-segment-change': Target,
  'retroactive-trigger': DatabaseZap,
  'order-status-change': RefreshCw,
  'shipment-status-change': Truck,
  'delivery-forecast': Truck,

  // Comunicação WhatsApp
  'whatsapp': WhatsAppIcon,
  'send-template': WhatsAppIcon,
  'whatsapp-reply': WhatsAppIcon,
  'send-media': WhatsAppIcon,
  'send-document': WhatsAppIcon,
  'wait-for-reply': Timer,

  // Comunicação Email
  'email-template': MailCheck,
  'email-send': Mail,

  // Comunicação SMS
  'send-sms-template': MessageSquareText,
  'send-sms-free': Smartphone,

  // Inteligência Artificial
  'ai-processor': Sparkles,
  'ai-classifier': Brain,

  // Lógica
  'condition': GitBranch,
  'delay-dynamic': Clock,
  'queue-throttle': Hourglass,
  'wait-for-status-change': RefreshCw,

  // CRM
  'move-to-stage': MoveRight,
  'distribute-to-stages': Shuffle,
  'add-interaction': MessageSquarePlus,
  'mark-forecast-opt-in': CheckCircle2,
  'invalid-number': PhoneOff,

  // Integrações
  'webhook-call': Webhook,
};

/**
 * Catálogo do canvas: os dados compartilhados + o ícone. A ordem das chaves vem
 * do catálogo compartilhado e é a ordem de exibição na paleta —
 * categorizedNodes() só agrupa, não reordena.
 */
export const NODE_CATALOG = Object.fromEntries(
  (Object.keys(NODE_CATALOG_DATA) as AiNodeType[])
    // Tipo que está no catálogo compartilhado e ainda não chegou ao canvas
    // (hoje: 'business-hours', entrou com a IA em c038d461 sem ícone nem nó):
    // sem este filtro o ícone `undefined` derrubava a paleta e /workflows
    // inteira abria em erro. Fica fora da paleta até o nó do canvas existir;
    // a trava de tipos acima continua acusando a divergência.
    .filter((type) => !!NODE_ICONS[type])
    .map((type) => {
    const entry = NODE_CATALOG_DATA[type];
    return [
      type,
      {
        type: type as WorkflowNodeType,
        label: entry.label,
        // `nodeTitle` só existe em alguns tipos; o `as any` evita o estreitamento
        // do `as const` do catálogo compartilhado atrapalhar o acesso opcional.
        nodeTitle: (entry as any).nodeTitle as string | undefined,
        icon: NODE_ICONS[type],
        description: entry.description,
        category: entry.category as NodeCategoryTitle,
      } satisfies NodeCatalogEntry,
    ];
  })
) as Record<WorkflowNodeType, NodeCatalogEntry>;

/** data.label do nó recém-criado: título do card, não rótulo da paleta. */
export const nodeLabel = (t: WorkflowNodeType): string => {
  const entry = NODE_CATALOG[t];
  return entry?.nodeTitle ?? entry?.label ?? 'Novo Nó';
};

export const categorizedNodes = (): { title: NodeCategoryTitle; nodes: NodeCatalogEntry[] }[] =>
  CATEGORY_ORDER.map((title) => ({
    title,
    nodes: Object.values(NODE_CATALOG).filter((entry) => entry.category === title),
  })).filter((group) => group.nodes.length > 0);
