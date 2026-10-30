import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type SmsHealth = 'healthy' | 'attention' | 'critical' | 'low_volume';

/** Volume mínimo de envios para que a saúde seja considerada estatisticamente confiável. */
export const SMS_HEALTH_MIN_VOLUME = 5;

/**
 * Saúde baseada apenas em taxa de FALHA (fallback quando não há DLR de entrega).
 */
export function computeSmsHealth(sent: number, failed: number): SmsHealth {
  const total = sent + failed;
  if (total < SMS_HEALTH_MIN_VOLUME) return 'low_volume';
  const failRate = (failed / total) * 100;
  if (failRate > 30) return 'critical';
  if (failRate >= 10) return 'attention';
  return 'healthy';
}

/**
 * Saúde baseada na taxa de ENTREGA real (callback DLR do provedor).
 * Se ainda não chegou nenhum callback de entrega, cai no cálculo por falha
 * para não marcar como "crítico" um template que apenas não recebeu DLR ainda.
 */
export function computeSmsDeliveryHealth(sent: number, delivered: number, failed: number): SmsHealth {
  const total = sent + failed;
  if (total < SMS_HEALTH_MIN_VOLUME) return 'low_volume';
  if (delivered === 0 && failed === 0) return 'low_volume';
  if (delivered === 0) return computeSmsHealth(sent, failed);
  const acceptedBase = sent || 1;
  const deliveryRate = (delivered / acceptedBase) * 100;
  if (deliveryRate < 70) return 'critical';
  if (deliveryRate < 90) return 'attention';
  return 'healthy';
}

// Cores por token do design system da Segunda Venda (nada de hex fixo aqui).
const CFG: Record<SmsHealth, { label: string; dotClass: string; cls: string; tooltip: string }> = {
  healthy: {
    label: 'Saudável',
    dotClass: 'bg-success',
    cls: 'bg-success/10 text-success border-success/20',
    tooltip: 'Taxa de entrega acima de 90% (ou menos de 10% de não entrega) com pelo menos 5 envios.',
  },
  attention: {
    label: 'Atenção',
    dotClass: 'bg-warning',
    cls: 'bg-warning/10 text-warning border-warning/20',
    tooltip: 'Taxa de entrega entre 70% e 90% — vale revisar o conteúdo, o remetente ou a qualidade da base.',
  },
  critical: {
    label: 'Crítico',
    dotClass: 'bg-gray-400',
    cls: 'bg-muted text-muted-foreground border-border',
    tooltip: 'Taxa de entrega abaixo de 70% (ou mais de 30% de não entrega). Pause este template e revise antes de seguir enviando.',
  },
  low_volume: {
    label: 'Volume baixo',
    dotClass: 'bg-muted-foreground/50',
    cls: 'bg-muted text-muted-foreground border-border',
    tooltip: 'Menos de 5 envios — não temos amostra suficiente para julgar a saúde do template.',
  },
};

export function SmsHealthBadge({ health, className = '' }: { health: SmsHealth; className?: string }) {
  const c = CFG[health];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn('text-[11px] font-medium gap-1.5 shrink-0', c.cls, className)}>
            <span className={cn('w-1.5 h-1.5 rounded-full', c.dotClass)} />
            {c.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px] text-xs">{c.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
