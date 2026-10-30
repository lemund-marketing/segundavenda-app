import type { ReactNode } from "react";
import { AlertTriangle, ExternalLink, Loader2, Lock, Package, ShieldAlert, Truck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { MercadoLivreSelo } from "./MercadoLivreSelo";
import type { MlConversaAberta } from "./useMlConversations";
import {
  linkVendaMl,
  rotuloBloqueio,
  tituloMl,
  type MlConversa,
  type MlPedidoEnvio,
  type MlPedidoReclamacao,
} from "./mlTipos";

interface MlOrderPanelProps {
  conversa: MlConversa;
  aberta: MlConversaAberta;
}

// ── Rótulos (enums do hub: OrderStatus / ShipmentStatus; o resto é cru do ML) ──

const STATUS_PEDIDO: Record<string, string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_ENVIO: Record<string, string> = {
  pending: "Pendente",
  ready_to_ship: "Pronto para enviar",
  shipped: "Enviado",
  in_transit: "Em trânsito",
  delivered: "Entregue",
  not_delivered: "Não entregue",
  returned: "Devolvido",
  cancelled: "Cancelado",
};

// Substatus do envio no ML (vem cru do hub). Os comuns em português; o que não está
// aqui fica fora do painel em vez de aparecer em inglês ("out_for_delivery").
const SUBSTATUS_ENVIO: Record<string, string> = {
  ready_to_print: "Etiqueta pronta para imprimir",
  printed: "Etiqueta impressa",
  in_hub: "No centro de distribuição",
  in_packing_list: "Em separação",
  picked_up: "Coletado",
  dropped_off: "Postado",
  authorized_by_carrier: "Liberado pela transportadora",
  in_warehouse: "No armazém",
  ready_for_pickup: "Pronto para retirada",
  waiting_for_withdrawal: "Aguardando retirada pelo comprador",
  out_for_delivery: "Saiu para entrega",
  soon_deliver: "Entrega em breve",
  delayed: "Atrasado",
  receiver_absent: "Destinatário ausente",
  returning_to_sender: "Voltando ao vendedor",
  returning_to_hub: "Voltando ao centro de distribuição",
  stolen: "Extraviado (roubo)",
  lost: "Extraviado",
  damaged: "Danificado",
  bad_address: "Endereço com problema",
  claimed_me: "Reclamação aberta pelo comprador",
};

const TIPO_LOGISTICO: Record<string, string> = {
  fulfillment: "Full",
  cross_docking: "Coleta",
  drop_off: "Agência / Correios",
  xd_drop_off: "Agência Mercado Envios",
  self_service: "Flex",
  custom: "Envio próprio",
  not_specified: "A combinar",
};

const STATUS_RECLAMACAO: Record<string, string> = {
  opened: "Aberta",
  open: "Aberta",
  closed: "Encerrada",
};

const TIPO_RECLAMACAO: Record<string, string> = {
  claim: "Reclamação",
  dispute: "Mediação",
  mediation: "Mediação",
  return: "Devolução",
};

const rotulo = (mapa: Record<string, string>, v: string | null | undefined) => {
  const k = (v || "").trim();
  return k ? mapa[k.toLowerCase()] ?? k : null;
};

const data = (iso: string | null | undefined, comHora = false) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return format(d, comHora ? "dd/MM/yyyy 'às' HH:mm" : "dd/MM/yyyy", { locale: ptBR });
};

const dinheiro = (centavos: number | null | undefined, moeda: string | null | undefined) => {
  if (centavos == null || isNaN(Number(centavos))) return null;
  const valor = Number(centavos) / 100;
  try {
    return valor.toLocaleString("pt-BR", { style: "currency", currency: (moeda || "BRL").toUpperCase() });
  } catch {
    // Código de moeda que o Intl não conhece: número puro em vez de quebrar o painel.
    return `${moeda || ""} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`.trim();
  }
};

/**
 * Atributos da variação como o hub devolve. Já veio lista de {name, value_name},
 * lista de {name, value} e objeto simples — o painel aceita os três e devolve
 * "Cor: Azul · Tamanho: M".
 */
const textoVariacao = (v: unknown): string | null => {
  if (!v) return null;
  if (typeof v === "string") return v.trim() || null;
  const pares: string[] = [];
  if (Array.isArray(v)) {
    v.forEach((a) => {
      if (!a || typeof a !== "object") return;
      const o = a as Record<string, unknown>;
      const nome = o.name ?? o.nome;
      const valor = o.value_name ?? o.value ?? o.valor;
      if (valor != null && String(valor).trim()) pares.push(nome ? `${nome}: ${valor}` : String(valor));
    });
  } else if (typeof v === "object") {
    Object.entries(v as Record<string, unknown>).forEach(([k, val]) => {
      if (val != null && typeof val !== "object" && String(val).trim()) pares.push(`${k}: ${val}`);
    });
  }
  return pares.length ? pares.join(" · ") : null;
};

function Secao({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icone}
        {titulo}
      </h3>
      <div className="rounded-lg border border-border bg-card p-3 space-y-2">{children}</div>
    </section>
  );
}

function Linha({ rotulo: r, valor }: { rotulo: string; valor: ReactNode }) {
  if (valor == null || valor === "") return null;
  return (
    <div className="flex items-start justify-between gap-3 text-[12px]">
      <span className="text-muted-foreground shrink-0">{r}</span>
      <span className="text-foreground text-right min-w-0 [overflow-wrap:anywhere]">{valor}</span>
    </div>
  );
}

function BlocoEnvio({ envio }: { envio: MlPedidoEnvio }) {
  const previsao =
    envio.previsto_de && envio.previsto_ate && data(envio.previsto_de) !== data(envio.previsto_ate)
      ? `${data(envio.previsto_de)} a ${data(envio.previsto_ate)}`
      : data(envio.previsto_ate) || data(envio.previsto_de);
  return (
    <div className="space-y-1.5">
      <Linha rotulo="Situação" valor={rotulo(STATUS_ENVIO, envio.status)} />
      <Linha rotulo="Detalhe" valor={envio.substatus ? SUBSTATUS_ENVIO[envio.substatus] ?? null : null} />
      <Linha rotulo="Modalidade" valor={rotulo(TIPO_LOGISTICO, envio.tipo_logistico)} />
      <Linha rotulo="Transportadora" valor={envio.transportadora} />
      <Linha
        rotulo="Rastreio"
        valor={envio.rastreio ? <span className="font-mono select-all">{envio.rastreio}</span> : null}
      />
      <Linha rotulo="Enviado em" valor={data(envio.enviado_em, true)} />
      <Linha rotulo="Entregue em" valor={data(envio.entregue_em, true)} />
      {!envio.entregue_em && <Linha rotulo="Previsão" valor={previsao} />}
    </div>
  );
}

function BlocoReclamacao({ r }: { r: MlPedidoReclamacao }) {
  return (
    <div className="space-y-1.5">
      <Linha rotulo="Situação" valor={rotulo(STATUS_RECLAMACAO, r.status)} />
      <Linha rotulo="Tipo" valor={rotulo(TIPO_RECLAMACAO, r.tipo)} />
      <Linha rotulo="Motivo" valor={r.motivo} />
      <Linha rotulo="Aberta em" valor={data(r.aberta_em, true)} />
    </div>
  );
}

/**
 * Painel da direita para a conversa do Mercado Livre: o PEDIDO, vindo do hub.
 *
 * Só o que a edge repassa (`resumoPedido`): produto, valor, status, envio,
 * reclamação. Sem CPF, telefone, endereço, margem ou taxas — e nenhum dado
 * daqui vira cliente ou pedido do SV.
 */
export function MlOrderPanel({ conversa, aberta }: MlOrderPanelProps) {
  const dados = aberta.dados?.conversa?.id === conversa.id ? aberta.dados : null;
  const c: MlConversa = dados ? { ...conversa, ...dados.conversa } : conversa;
  const pedido = dados?.pedido ?? null;
  const numero = c.pedido_ml || c.pack_id;
  const link = linkVendaMl(c.pedido_ml);
  const bloqueada = c.status === "blocked";
  const itens = pedido?.itens ?? [];
  const envios = pedido?.envios ?? [];
  const reclamacoes = pedido?.reclamacoes ?? [];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-background">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Topo: de quem é a conversa e para onde ir no ML. */}
        <div className="flex items-start gap-3">
          <MercadoLivreSelo tamanho="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{tituloMl(c)}</p>
            {numero && <p className="text-xs text-muted-foreground tabular-nums">Pedido #{numero}</p>}
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-2"
              >
                Abrir venda no Mercado Livre
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {bloqueada && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-[12px] leading-relaxed">
              <span className="font-semibold">Conversa bloqueada.</span> {rotuloBloqueio(c.motivo_bloqueio)}
            </p>
          </div>
        )}

        {aberta.carregando && !pedido && (
          <div className="flex items-center gap-2 py-6 justify-center text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando o pedido no hub...
          </div>
        )}

        {!aberta.carregando && !pedido && (
          <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground leading-relaxed">
            {c.hub_pedido_id
              ? "Não foi possível trazer os dados do pedido agora. Use o link acima para ver a venda no Mercado Livre."
              : "Esta conversa não está ligada a um pedido no hub."}
            {c.produto_titulo && (
              <p className="mt-2 text-foreground">
                <span className="text-muted-foreground">Produto: </span>
                {c.produto_titulo}
              </p>
            )}
          </div>
        )}

        {pedido && (
          <>
            <Secao icone={<Package className="h-3.5 w-3.5" />} titulo="Pedido">
              <Linha rotulo="Situação" valor={rotulo(STATUS_PEDIDO, pedido.status)} />
              <Linha rotulo="Data da compra" valor={data(pedido.pedido_em || c.pedido_em, true)} />
              <Linha rotulo="Total" valor={dinheiro(pedido.total_centavos, pedido.moeda)} />
              {pedido.pack_id && pedido.pack_id !== c.pedido_ml && (
                <Linha rotulo="Carrinho (pack)" valor={<span className="tabular-nums">{pedido.pack_id}</span>} />
              )}

              {itens.length > 0 && (
                <ul className="pt-2 border-t border-dashed border-border space-y-2">
                  {itens.map((item, i) => {
                    const variacao = textoVariacao(item.variacao);
                    const unit = dinheiro(item.preco_unit_centavos, pedido.moeda);
                    return (
                      <li key={`${item.anuncio_id || "item"}-${i}`} className="text-[12px] leading-snug">
                        <p className="font-medium text-foreground [overflow-wrap:anywhere]">
                          {item.titulo || "Produto sem título"}
                        </p>
                        {variacao && <p className="text-muted-foreground">{variacao}</p>}
                        <p className="text-muted-foreground tabular-nums">
                          {item.quantidade ?? 1} × {unit ?? "—"}
                          {item.anuncio_id ? ` · ${item.anuncio_id}` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Secao>

            {envios.length > 0 && (
              <Secao icone={<Truck className="h-3.5 w-3.5" />} titulo={envios.length > 1 ? `Envios (${envios.length})` : "Envio"}>
                {envios.map((e, i) => (
                  <div key={i} className={i > 0 ? "pt-2 border-t border-dashed border-border" : ""}>
                    <BlocoEnvio envio={e} />
                  </div>
                ))}
              </Secao>
            )}

            {reclamacoes.length > 0 && (
              <Secao icone={<ShieldAlert className="h-3.5 w-3.5" />} titulo="Reclamação">
                {reclamacoes.map((r, i) => (
                  <div key={i} className={i > 0 ? "pt-2 border-t border-dashed border-border" : ""}>
                    <BlocoReclamacao r={r} />
                  </div>
                ))}
                <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-relaxed">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  As mensagens da reclamação ficam no Mercado Livre — não aparecem aqui.
                </p>
              </Secao>
            )}
          </>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Dados vindos do hub. CPF, telefone e endereço do comprador não são exibidos, e esta
          conversa não entra em métricas, fluxos nem na lista de clientes.
        </p>
      </div>
    </div>
  );
}

export default MlOrderPanel;
