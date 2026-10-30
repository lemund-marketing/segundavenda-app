import { Send, CheckCircle, Eye, MessageCircle, Clock, AlertTriangle } from "lucide-react";
import { KpiPadrao } from "@/components/kpi/KpiPadrao";

interface Props {
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  /** Pessoas que responderam / que receberam um template entregue (opcional: só a aba WhatsApp passa). */
  repliedPeople?: number;
  deliveredPeople?: number;
  failed: number;
  avgReadTimeMin: number | null;
  loading?: boolean;
}

function fmtTime(min: number | null) {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function WhatsAppKpis({
  sent, delivered, read, replied, repliedPeople, deliveredPeople, failed, avgReadTimeMin, loading,
}: Props) {
  // UMA base só: DISPAROS (tentativas = aceitas + falhas). `sent` exclui as
  // falhas por definição da Meta, e usar ele como denominador da entrega criava
  // o absurdo que o usuário flagrou: "99% de entrega" e "12% de falha" na MESMA
  // tela — 16.772 "enviadas" ao lado de 19.049 "tentativas", dois universos sem
  // aviso. Entrega agora é % dos disparos; leitura e resposta são % das
  // ENTREGUES. Resposta sobre lidas passava de 100% (Canal 40, 09/10/2026:
  // 113%) porque quem desliga a confirmação de leitura responde sem constar
  // como "lido" — a tela do template já dividia por entregues.
  const totalAttempts = sent + failed;
  const deliveryRate = totalAttempts ? (delivered / totalAttempts) * 100 : 0;
  const readRate = delivered ? (read / delivered) * 100 : 0;
  const replyRate = delivered ? (replied / delivered) * 100 : 0;
  const failRate = totalAttempts ? (failed / totalAttempts) * 100 : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
      <KpiPadrao
        titulo="Total de Disparos"
        valor={totalAttempts.toLocaleString("pt-BR")}
        apoio={`${sent.toLocaleString("pt-BR")} aceitas pela Meta · ${failed.toLocaleString("pt-BR")} não entregues`}
        icone={Send}
        loading={loading}
        tooltip="Templates que o sistema tentou enviar no período: aceitos pela Meta somados aos não entregues. As mensagens de conversa (respostas do robô e do atendente) não entram — desde 09/10/2026 o topo conta só templates, como os cards de cada template."
      />
      <KpiPadrao
        titulo="Taxa de Entrega"
        valor={`${deliveryRate.toFixed(1)}%`}
        apoio={`${delivered.toLocaleString("pt-BR")} entregues de ${totalAttempts.toLocaleString("pt-BR")} disparos`}
        icone={CheckCircle}
        loading={loading}
        tooltip="Mensagens com confirmação de entrega no aparelho do cliente, divididas pelo total de disparos do período (aceitas + não entregues)."
      />
      <KpiPadrao
        titulo="Taxa de Leitura"
        valor={`${readRate.toFixed(1)}%`}
        apoio={`${read.toLocaleString("pt-BR")} lidas de ${delivered.toLocaleString("pt-BR")} entregues`}
        icone={Eye}
        loading={loading}
        tooltip="Mensagens com confirmação de leitura (ticks azuis), divididas pelas entregues. Cliente com recibo de leitura desativado não entra na conta."
      />
      <KpiPadrao
        titulo="Taxa de Resposta"
        valor={`${replyRate.toFixed(1)}%`}
        apoio={`${replied.toLocaleString("pt-BR")} respostas de ${delivered.toLocaleString("pt-BR")} templates entregues${
          deliveredPeople ? ` · ${(repliedPeople ?? 0).toLocaleString("pt-BR")} de ${deliveredPeople.toLocaleString("pt-BR")} pessoas` : ""
        }`}
        icone={MessageCircle}
        loading={loading}
        tooltip="Templates entregues que tiveram resposta do cliente, divididos pelos entregues. Vale a 1ª resposta depois do template, antes do próximo template da conversa e em até 7 dias. Divide por entregues, e não por lidas, porque quem desliga a confirmação de leitura também responde. É a soma das 'Respondidas' dos cards; a linha de baixo mostra o mesmo em pessoas."
      />
      <KpiPadrao
        titulo="Tempo Médio até Leitura"
        valor={fmtTime(avgReadTimeMin)}
        // O "(até 1000 msgs)" que ficava aqui era o limite da versão antiga, que
        // puxava linhas cruas para o navegador; a mediana agora sai do banco
        // sobre o período inteiro (migration 20260820191500).
        apoio="mediana do período"
        icone={Clock}
        loading={loading}
        tooltip="Mediana do tempo entre o envio da mensagem e a confirmação de leitura, sobre todas as mensagens lidas do período: metade das leituras acontece antes deste tempo."
      />
      <KpiPadrao
        titulo="Taxa de não entrega"
        valor={`${failRate.toFixed(1)}%`}
        apoio={`${failed.toLocaleString("pt-BR")} não entregues em ${totalAttempts.toLocaleString("pt-BR")} tentativas`}
        icone={AlertTriangle}
        loading={loading}
        tooltip="Mensagens com falha registrada pela Meta (número inexistente, bloqueio etc.), divididas pelo total de disparos do período."
      />
    </div>
  );
}
