// Health calculator SPECIFIC to email templates.
// Do NOT reuse templateHealth.ts (that one is tuned to WhatsApp delivery/read).
//
// Racional: no e-mail, "saúde" = ENTREGABILIDADE. O que degrada a reputação do
// domínio de envio (bounces e complaints) puxa o status pra Crítico rapidamente,
// mesmo que a taxa de entrega crua pareça alta. Baixa abertura é sinal amarelo:
// não afeta reputação, mas indica assunto/segmentação ruim.

import type { HealthInfo, HealthStatus } from "./templateHealth";

export interface EmailHealthInput {
  sent: number;
  delivered: number;
  opened?: number;
  bounced?: number;
  complained?: number;
}

export function calculateEmailTemplateHealth(t: EmailHealthInput): HealthInfo {
  const sent = t.sent || 0;
  if (sent < 10) {
    return {
      status: "no-data",
      label: "Volume baixo",
      color: "gray",
      dotClass: "bg-gray-400",
      pillClass: "bg-gray-100 text-gray-600 dark:bg-muted dark:text-muted-foreground",
    };
  }
  const delivered = t.delivered || 0;
  const bounceRate = sent ? ((t.bounced ?? 0) / sent) * 100 : 0;
  const complaintRate = delivered ? ((t.complained ?? 0) / delivered) * 100 : 0;
  const openRate = delivered ? ((t.opened ?? 0) / delivered) * 100 : 0;

  if (bounceRate >= 2 || complaintRate >= 0.1) {
    return {
      status: "critical",
      label: "Crítico",
      // Cinza de propósito (20/08): vermelho assustava o lojista — não entregue
      // é rotina de canal, o rótulo "Crítico" já carrega o aviso.
      color: "gray",
      dotClass: "bg-gray-400",
      pillClass: "bg-gray-100 text-gray-600 dark:bg-muted dark:text-muted-foreground",
    };
  }
  if (bounceRate >= 1 || openRate < 15) {
    return {
      status: "attention",
      label: "Atenção",
      color: "amber",
      dotClass: "bg-amber-500",
      pillClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  }
  return {
    status: "healthy",
    label: "Saudável",
    color: "green",
    dotClass: "bg-green-500",
    pillClass: "bg-green-500/10 text-green-600 dark:text-green-400",
  };
}

export type { HealthStatus, HealthInfo };
