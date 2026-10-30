import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Link as LinkIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/utils/sms';
import { categorizeTemplate } from '@/utils/templateHealth';
import { SmsHealthBadge, computeSmsDeliveryHealth } from './SmsHealthBadge';

export interface SmsPerfTemplate {
  /** Nome do template. A RPC get_sms_performance_stats devolve isso como `template_name`. */
  name: string;
  body?: string | null;
  category?: { name: string; color: string } | null;
  sent: number;
  delivered: number;
  failed: number;
  cost_cents: number;
  unique_clicks?: number;
  click_count?: number;
  sent_with_link?: number;
}

interface Props {
  template: SmsPerfTemplate;
  /**
   * Handler opcional de "ver detalhes". Se não for passado, navega para
   * /workflow-stats/sms-template/<nome>. A rota é responsabilidade da página de
   * Performance — passe este callback se ela ainda não existir no router.
   */
  onOpenDetails?: (templateName: string) => void;
}

export function SmsPerformanceTemplateCard({ template, onOpenDetails }: Props) {
  const navigate = useNavigate();
  const cat = categorizeTemplate(template.name);
  const health = computeSmsDeliveryHealth(template.sent, template.delivered, template.failed);

  const sent = template.sent;
  const failed = template.failed;
  const delivered = template.delivered;
  const totalSent = sent + failed;
  const uniqueClicks = template.unique_clicks ?? 0;
  const sentWithLink = template.sent_with_link ?? 0;
  const hasLinkTracking = sentWithLink > 0 || uniqueClicks > 0;

  // "aceito mas ainda sem DLR de entrega" — fica na faixa verde clara da barra
  const acceptedNotDelivered = Math.max(0, sent - delivered);
  const deliveredPct = totalSent ? Math.round((delivered / totalSent) * 100) : 0;
  const failPct = totalSent ? Math.round((failed / totalSent) * 100) : 0;

  const deliveredW = totalSent ? (delivered / totalSent) * 100 : 0;
  const acceptedW = totalSent ? (acceptedNotDelivered / totalSent) * 100 : 0;
  const failedW = totalSent ? (failed / totalSent) * 100 : 0;

  const deliveryRatePct = sent ? (delivered / sent) * 100 : 0;

  const handleClick = () => {
    if (onOpenDetails) return onOpenDetails(template.name);
    navigate(`/workflow-stats/sms-template/${encodeURIComponent(template.name)}`);
  };

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className="rounded-2xl border border-border bg-card shadow-sm p-5 cursor-pointer transition-all hover:shadow-hover hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* header */}
      <div className="flex items-start gap-3">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0', cat.bgClass)}>
          {cat.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-[15px] font-semibold text-foreground truncate inline-flex items-center gap-1.5"
            title={template.name}
          >
            {hasLinkTracking && (
              <span
                title="Rastreamento de cliques ativo"
                className="inline-flex items-center justify-center w-4 h-4 rounded text-secondary shrink-0"
              >
                <LinkIcon className="w-3 h-3" />
              </span>
            )}
            <span className="truncate">{template.name}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Categoria · {template.category?.name ?? cat.label}
          </p>
        </div>
        <SmsHealthBadge health={health} />
      </div>

      {/* badges extras */}
      {(template.category || delivered > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {template.category && (
            <Badge
              variant="outline"
              className="text-[11px] border-0 font-medium"
              style={{
                // cor definida pelo usuário na categoria — vem do banco, não é cor de marca
                background: `${template.category.color}1A`,
                color: template.category.color,
              }}
            >
              {template.category.name}
            </Badge>
          )}
          {delivered > 0 && (
            <Badge
              variant="outline"
              className="text-[11px] bg-brand-blue/10 text-brand-blue border-0 font-medium tabular-nums"
            >
              ✓ {deliveryRatePct.toFixed(0)}% entregue
            </Badge>
          )}
        </div>
      )}

      <div className="my-3 h-px bg-border/50" />

      {/* barra de saúde */}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
        {totalSent > 0 && (
          <>
            <div className="h-full bg-success transition-all" style={{ width: `${deliveredW}%` }} />
            <div className="h-full bg-success/40 transition-all" style={{ width: `${acceptedW}%` }} />
            <div className="h-full bg-muted-foreground/40 transition-all" style={{ width: `${failedW}%` }} />
          </>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        {deliveredPct}% entregue · {failPct}% não entregue
      </p>

      {/* métricas */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <Metric label="Envios" value={totalSent} />
        <Metric label="Entregues" value={delivered} />
        <Metric label="Cliques" value={uniqueClicks} tone={uniqueClicks > 0 ? 'accent' : 'default'} />
      </div>

      {/* footer */}
      <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
        <span className="text-xs text-muted-foreground tabular-nums">
          {template.cost_cents > 0 ? formatBRL(template.cost_cents) : '—'}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          className="text-xs font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-1"
        >
          Ver detalhes <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'danger' | 'accent';
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          'text-lg font-bold tabular-nums leading-tight mt-0.5',
          tone === 'danger' && 'text-destructive',
          tone === 'accent' && 'text-secondary',
          tone === 'default' && 'text-foreground',
        )}
      >
        {value.toLocaleString('pt-BR')}
      </p>
    </div>
  );
}
