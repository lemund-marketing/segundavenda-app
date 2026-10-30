import { Card, CardContent } from "@/components/ui/card";
import { Send, MailCheck, Eye, MessageCircleReply } from "lucide-react";
import { MetricTooltip } from "@/components/ui/metric-tooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ACCENT } from "@/components/dashboard/shared";

interface CompactFunnelProps {
  sent: number;
  delivered: number;
  read: number;
  replied?: number;
  /** Não entregues do período. Entram no topo do funil: também foram disparos. */
  failed?: number;
  loading?: boolean;
}

const steps = (attempts: number, sent: number, delivered: number, read: number, replied: number) => [
  {
    label: "Disparos",
    value: attempts,
    pct: 100,
    icon: Send,
    barColor: "bg-primary",
    tooltip:
      "Templates que o sistema tentou enviar no período, INCLUINDO os não entregues (as mensagens de conversa do robô e do atendente não entram). Antes o funil começava em 'Enviadas', que exclui as não entregues por definição — e aí a tela mostrava 99% de entrega ao lado de 12% de não entrega, dois números que não podiam ser verdade juntos.",
  },
  {
    label: "Entregues",
    value: delivered,
    pct: attempts ? Math.round((delivered / attempts) * 100) : 0,
    icon: MailCheck,
    barColor: "bg-brand-teal",
    tooltip:
      "Mensagens efetivamente entregues no aparelho do cliente. % calculado sobre Disparos — a diferença são as não entregues e as aceitas que ainda não chegaram (celular desligado, sem rede).",
  },
  {
    label: "Lidas",
    value: read,
    pct: delivered ? Math.round((read / delivered) * 100) : 0,
    icon: Eye,
    barColor: "bg-brand-blue",
    tooltip:
      "Mensagens com confirmação de leitura (ticks azuis). Só aparecem se o cliente tiver recibos de leitura ativos. % calculado sobre Entregues.",
  },
  {
    label: "Responderam",
    value: replied,
    pct: delivered ? Math.round((replied / delivered) * 100) : 0,
    icon: MessageCircleReply,
    barColor: "bg-warning",
    tooltip:
      "Templates que tiveram resposta do cliente: a 1ª resposta depois do template, antes do próximo template e em até 7 dias — a soma das 'Respondidas' dos cards. % calculado sobre ENTREGUES, não sobre Lidas: quem desliga a confirmação de leitura responde sem constar como lido.",
  },
];

/**
 * Blocos numéricos na régua do KpiPadrao (21/08): título em MAIÚSCULO, valor
 * bold, ícone no chip verde da marca. O (i) por bloco foi aposentado — o texto
 * de origem agora aparece no hover do bloco inteiro, como nos cards de KPI.
 * As barras coloridas ficam: são a leitura visual do funil, não alarme.
 */
export function CompactFunnel({
  sent,
  delivered,
  read,
  replied = 0,
  failed = 0,
  loading,
}: CompactFunnelProps) {
  const data = steps(sent + failed, sent, delivered, read, replied);
  return (
    <Card className="rounded-2xl shadow-sm border-0 bg-card">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            Funil de mensagens
            <MetricTooltip text="Pirâmide de engajamento das mensagens de WhatsApp. Disparos → Entregues (% sobre disparos) → Lidas (% sobre entregues) → Responderam (% sobre lidas)." />
          </h3>
          <span className="text-xs text-muted-foreground">
            Entrega: % de disparos · Leitura e resposta: % de entregues
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {data.map((step, idx) => (
            <Tooltip key={step.label} delayDuration={350}>
              <TooltipTrigger asChild>
                <div className="relative rounded-xl border-0 bg-muted/40 p-4 hover:shadow-hover transition">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="flex shrink-0 items-center justify-center p-1.5 rounded-lg"
                      style={{ backgroundColor: `${ACCENT}1A`, color: ACCENT }}
                    >
                      <step.icon className="w-3.5 h-3.5" strokeWidth={2} />
                    </span>
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {step.label}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold leading-tight text-foreground tabular-nums">
                      {loading ? "—" : step.value.toLocaleString("pt-BR")}
                    </span>
                    {idx > 0 && !loading && (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {step.pct}%
                      </span>
                    )}
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${step.barColor}`}
                      style={{ width: `${loading ? 0 : step.pct}%` }}
                    />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                {step.tooltip}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
