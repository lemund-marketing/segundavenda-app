import { Send, MailCheck, Eye, MousePointerClick, AlertTriangle, XCircle } from "lucide-react";
import { KpiPadrao } from "@/components/kpi/KpiPadrao";

interface Props {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  loading?: boolean;
}

export function EmailKpis({
  sent, delivered, opened, clicked, bounced, failed, loading,
}: Props) {
  const totalAttempts = sent + failed;
  const deliveryRate = sent ? (delivered / sent) * 100 : 0;
  const openRate = delivered ? (opened / delivered) * 100 : 0;
  const clickRate = opened ? (clicked / opened) * 100 : 0;
  const bounceRate = sent ? (bounced / sent) * 100 : 0;
  const failRate = totalAttempts ? (failed / totalAttempts) * 100 : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
      <KpiPadrao
        titulo="Total Enviados"
        valor={sent.toLocaleString("pt-BR")}
        apoio="no período"
        icone={Send}
        loading={loading}
        tooltip="E-mails enviados no período, contados no histórico de envios da loja. Envios de teste e endereços suprimidos ficam de fora."
      />
      <KpiPadrao
        titulo="Taxa de Entrega"
        valor={`${deliveryRate.toFixed(1)}%`}
        apoio={`${delivered.toLocaleString("pt-BR")} entregues de ${sent.toLocaleString("pt-BR")}`}
        icone={MailCheck}
        loading={loading}
        tooltip="E-mails com confirmação de entrega do provedor, divididos pelos enviados do período."
      />
      <KpiPadrao
        titulo="Taxa de Abertura"
        valor={`${openRate.toFixed(1)}%`}
        apoio={`${opened.toLocaleString("pt-BR")} abertos de ${delivered.toLocaleString("pt-BR")} entregues`}
        icone={Eye}
        loading={loading}
        tooltip="E-mails com registro de abertura, divididos pelos entregues do período."
      />
      <KpiPadrao
        titulo="Taxa de Clique"
        valor={`${clickRate.toFixed(1)}%`}
        apoio={`${clicked.toLocaleString("pt-BR")} cliques de ${opened.toLocaleString("pt-BR")} aberturas`}
        icone={MousePointerClick}
        loading={loading}
        tooltip="E-mails com pelo menos um clique em link, divididos pelos abertos do período."
      />
      <KpiPadrao
        titulo="Taxa de Bounce"
        valor={`${bounceRate.toFixed(1)}%`}
        apoio={`${bounced.toLocaleString("pt-BR")} bounces de ${sent.toLocaleString("pt-BR")} enviados`}
        icone={AlertTriangle}
        loading={loading}
        tooltip="E-mails devolvidos pelo servidor do destinatário — endereço inexistente ou caixa cheia, por exemplo — divididos pelos enviados do período."
      />
      <KpiPadrao
        titulo="Taxa de não entrega"
        valor={`${failRate.toFixed(1)}%`}
        apoio={`${failed.toLocaleString("pt-BR")} não entregues em ${totalAttempts.toLocaleString("pt-BR")} tentativas`}
        icone={XCircle}
        loading={loading}
        tooltip="E-mails com falha registrada no envio, divididos pelo total de tentativas do período (enviados + falhas)."
      />
    </div>
  );
}
