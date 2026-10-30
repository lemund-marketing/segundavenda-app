/**
 * Suporte do Mercado Livre na aba WhatsApp — tipos e regras puras do front.
 *
 * O canal ML é só uma PONTA de comunicação: a conversa mora no lemund-hub e o SV
 * guarda apenas o espelho leve da lista (`ml_conversas`). Nada daqui toca
 * `conversations`/`messages`/`clients`/`orders`, nem entra em contador, métrica,
 * fluxo ou IA — por isso os tipos são próprios, e não uma extensão da conversa
 * do WhatsApp.
 *
 * A régua do texto (`normalizarTextoMl`/`validarTextoMl`) e os rótulos de
 * bloqueio NÃO são cópia: vêm de `supabase/functions/_shared/textoMl.ts`, o
 * MESMO arquivo que a edge usa (molde: nodeCatalog.ts importando
 * nodeCatalogData.ts). A cópia que morava aqui ficou para trás da edge e
 * recusava U+200B/U+2011 que o servidor limpava — o atendente não tinha como
 * achar o caractere invisível nem enviar. `avisosConteudo` também vem de lá:
 * a cópia daqui pegava qualquer sequência de 8 a 13 dígitos e avisava
 * "telefone" em código de rastreio, CEP e NF. O front avisa antes de gastar a
 * chamada; quem decide é o servidor.
 */

import { flattenOn, inkPair } from "@/utils/contrastInk";
import {
  FOLGA_CASAR_ENVIO_MS,
  ML_LIMITE_CARACTERES,
  motivoBloqueioPt,
} from "../../../../supabase/functions/_shared/textoMl.ts";

export {
  avisosConteudo,
  JANELA_ENVIO_EM_CURSO_MS,
  MOTIVOS_BLOQUEIO,
  normalizarTextoMl,
  validarTextoMl,
  type AvisoConteudo,
  type ValidacaoTextoMl,
} from "../../../../supabase/functions/_shared/textoMl.ts";

// ── Cores da marca ──────────────────────────────────────────────────────────

/** Amarelo do ML — o mesmo de `getMarketplaceColor('mercado_livre')`. */
export const ML_AMARELO = "#FFE600";
/** Azul-marinho do logo do ML. Sobre o amarelo opaco dá ~9:1 nos dois temas. */
export const ML_AZUL = "#2D3277";

/** `--card` dos dois temas (mesma régua do ClientAvatar). */
const CARD_CLARO = "#FEFEFE";
const CARD_ESCURO = "#0E0E11";

/**
 * Tinta "amarela" para TEXTO sobre a pílula amarelada (14%) que mora em cima do
 * card do ML, ele mesmo amarelado (até 22% no claro e 14% no escuro, quando
 * selecionado).
 *
 * O #FFE600 cru tem 1,2:1 sobre o card claro — some. `inkPair` caminha a cor
 * para o preto (claro) ou para o branco (escuro) até cruzar 4,5:1, medindo no
 * fundo achatado REAL — pílula sobre card tingido, o pior caso — e não no card
 * puro (mesmo cuidado do StoreBadge e do ClientAvatar). Medido: #736800 dá
 * 5,2:1 no claro e #FFE600 dá 7,5:1 no escuro. As duas viajam em variáveis CSS
 * e o `dark:` escolhe.
 */
export const ML_TINTA = inkPair(ML_AMARELO, {
  light: flattenOn(ML_AMARELO, 0.14, flattenOn(ML_AMARELO, 0.22, CARD_CLARO)),
  dark: flattenOn(ML_AMARELO, 0.14, flattenOn(ML_AMARELO, 0.14, CARD_ESCURO)),
});

// ── Tipos (contrato do DESENHO: colunas de ml_conversas + resposta da edge) ──

/** Linha de `public.ml_conversas`. O texto completo das mensagens NÃO mora no SV. */
export interface MlConversa {
  id: string;
  seller_id: string;
  vinculo_id: string;
  hub_conversa_id: string;
  conta_ml: string | null;
  pack_id: string | null;
  pedido_ml: string | null;
  hub_pedido_id: string | null;
  comprador_nome: string | null;
  produto_titulo: string | null;
  /** 'open' | 'blocked' (enum do hub). */
  status: string;
  /** Substatus CRU do ML (`cancelled_order`, `claim`…) — traduzir com `rotuloBloqueio`. */
  motivo_bloqueio: string | null;
  ultima_mensagem_em: string | null;
  ultima_direcao: "inbound" | "outbound" | null;
  /** Até 140 caracteres da última mensagem; null se expirada/vazia. */
  previa: string | null;
  aguardando_resposta: boolean;
  qtd_mensagens: number;
  pedido_em: string | null;
  visto_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

/** Item ML já marcado para conviver com as conversas do WhatsApp na mesma lista. */
export type MlItemLista = MlConversa & { __ml: true };

/** Mensagem normalizada pela edge (`normalizarMensagem`). */
export interface MlMensagem {
  id: string;
  direcao: "inbound" | "outbound";
  enviada_em: string;
  texto: string | null;
  /** 'present' | 'expired' (retenção do hub apagou) | 'empty' (só anexo). */
  estado_texto: "present" | "expired" | "empty";
  /** 'delivered' | 'rejected' | 'pending' (moderação do ML). */
  moderacao: string | null;
  motivo_moderacao: string | null;
  /** Quantos anexos a mensagem tinha — o arquivo em si não vem. */
  anexos: number;
  /** Nome de quem respondeu pelo SV, quando a edge conseguiu casar. */
  enviado_por?: string | null;
}

export interface MlPedidoItem {
  titulo: string | null;
  quantidade: number | null;
  preco_unit_centavos: number | null;
  anuncio_id: string | null;
  /** Atributos da variação como o hub devolve (lista nome/valor ou objeto). */
  variacao?: unknown;
}

export interface MlPedidoEnvio {
  status: string | null;
  substatus: string | null;
  rastreio: string | null;
  transportadora: string | null;
  tipo_logistico: string | null;
  enviado_em: string | null;
  entregue_em: string | null;
  previsto_de: string | null;
  previsto_ate: string | null;
}

/** O DESENHO diz `motivo/tipo`: os dois ficam opcionais e o painel mostra o que vier. */
export interface MlPedidoReclamacao {
  status?: string | null;
  motivo?: string | null;
  tipo?: string | null;
  aberta_em?: string | null;
}

/** Resumo do pedido (`resumoPedido` da edge). Sem CPF, telefone, endereço, margem ou taxas. */
export interface MlPedido {
  status: string | null;
  total_centavos: number | null;
  moeda: string | null;
  pedido_em: string | null;
  pack_id: string | null;
  itens: MlPedidoItem[];
  envios: MlPedidoEnvio[];
  reclamacoes: MlPedidoReclamacao[];
}

/** Resposta de `ml-suporte` nas ações `abrir` e `responder`. */
export interface MlAbrirResposta {
  conversa: MlConversa;
  mensagens: MlMensagem[];
  pedido: MlPedido | null;
  pode_responder: boolean;
  motivo_nao_responde: string | null;
  /**
   * A thread foi relida NO Mercado Livre antes desta leitura (e não só no banco
   * do hub). Só uma leitura assim prova que a tentativa incerta não saiu: o que
   * falha no envio ambíguo é justamente a releitura do hub, e o banco dele fica
   * sem a mensagem. Ausente (edge antiga) conta como false. A edge também
   * devolve false, mesmo tendo relido no ML, enquanto um envio desta conversa
   * ainda pode estar chegando lá (em andamento, timeout ou rede há menos de
   * 5 min).
   */
  relido_no_ml?: boolean;
}

// ── Motivos de bloqueio ─────────────────────────────────────────────────────

/**
 * Substatus cru (com ou sem `blocked_by_`) → frase em português.
 *
 * É a MESMA função da edge (`motivoBloqueioPt`, textoMl.ts): a faixa, o
 * cadeado do compositor e o painel dizem exatamente o que o toast do 409 e o
 * `motivo_bloqueio_pt` dizem. Calculada aqui (e não lida do `motivo_bloqueio_pt`
 * da resposta) porque o realtime troca `motivo_bloqueio` sem trazer o texto
 * junto — o rótulo nunca fica de um motivo e o código de outro.
 */
export const rotuloBloqueio = motivoBloqueioPt;

/** Motivo de moderação (molde: `MODERACAO_LABEL` do AtendimentoPage do hub). */
const MOTIVOS_MODERACAO: Record<string, string> = {
  PERSONAL_DATA: "dado pessoal no texto",
  SOCIAL_NETWORK_LINK: "link de rede social",
  LINK_SHORT_URL: "link encurtado",
  AUTOMATIC_MESSAGE: "mensagem automática",
};

export function rotuloModeracao(motivo: string | null | undefined): string | null {
  const m = (motivo || "").trim();
  if (!m) return null;
  return MOTIVOS_MODERACAO[m.toUpperCase()] ?? m;
}

// ── Texto da resposta (régua em textoMl.ts, compartilhada com a edge) ───────

/** Teto do vendedor no ML (o comprador tem 3500). Mesmo valor da edge. */
export const ML_MAX_CARACTERES = ML_LIMITE_CARACTERES;

/** Mesma tolerância do `casarEnviada` da edge: o ML normaliza espaço e quebra de linha. */
export const mesmoTextoMl = (a: string | null | undefined, b: string) =>
  (a || "").replace(/\s+/g, " ").trim() === (b || "").replace(/\s+/g, " ").trim();

/**
 * Envio que FALHOU numa conversa, guardado POR CONVERSA (e não na tela): a
 * resposta pode voltar com outra conversa aberta, e a conferência "saiu?" só
 * pode olhar as mensagens da conversa que originou o envio.
 */
export interface TentativaEnvioMl {
  conversaId: string;
  texto: string;
  /** Outbound que a thread já tinha ANTES do envio: o que aparecer fora daqui é novo. */
  idsAntes: ReadonlySet<string>;
  /** A falha não prova que não saiu (a edge devolveu `incerto`, ou a rede caiu). */
  incerto: boolean;
  /**
   * A falha foi de tempo ou de rede (timeout, conexão caída, resposta perdida),
   * e o POST do hub ao ML pode ainda terminar. "Não saiu" só vale numa
   * releitura começada {@link JANELA_ENVIO_EM_CURSO_MS} depois da falha. Até lá,
   * a saída é o "Enviar mesmo assim".
   */
  emCurso: boolean;
  /** Quando o envio COMEÇOU (o clique). É a régua da janela de `tentativaApareceu`. */
  inicio: number;
  /** Quando a falha voltou. */
  em: number;
  /**
   * Uma releitura NO ML (`relido_no_ml`), COMEÇADA depois da falha, terminou e
   * a mensagem não estava lá. Leitura só do banco do hub não conta.
   */
  relidaSemAchar: boolean;
  /** Uma releitura mostrou a mensagem: ela saiu. */
  saiu: boolean;
}

/**
 * A thread relida mostra uma outbound NOVA (fora de `idsAntes`) com o texto da
 * tentativa, enviada a partir do início do envio menos a folga do relógio do
 * ML?
 *
 * É a MESMA régua do `casarEnviada` da edge (FOLGA_CASAR_ENVIO_MS, em
 * textoMl.ts). Sem a janela, um "Obrigado!" que o vendedor mandou ONTEM pelo
 * app do ML, e que a releitura no ML acabou de importar para o hub (id novo,
 * fora de `idsAntes`), passava por "a mensagem saiu". A edge, sobre a mesma
 * thread, dizia "incerto".
 */
export function tentativaApareceu(
  t: Pick<TentativaEnvioMl, "texto" | "idsAntes" | "inicio">,
  mensagens: Pick<MlMensagem, "id" | "direcao" | "texto" | "enviada_em">[],
): boolean {
  const desde = t.inicio - FOLGA_CASAR_ENVIO_MS;
  return mensagens.some((m) => {
    if (m.direcao !== "outbound" || t.idsAntes.has(m.id) || !mesmoTextoMl(m.texto, t.texto)) return false;
    const ms = m.enviada_em ? Date.parse(m.enviada_em) : NaN;
    return Number.isFinite(ms) && ms >= desde;
  });
}

// ── Lista misturada ─────────────────────────────────────────────────────────

const tempo = (iso: string | null | undefined) => {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? 0 : ms;
};

export const tempoMl = tempo;

/**
 * Encaixa as conversas do ML na lista do WhatsApp SEM reordenar o WhatsApp.
 *
 * Cada ML entra antes do primeiro ponto do WhatsApp a partir do qual TUDO o
 * que vem é mais antigo que ela — o máximo do sufixo, e não a data do item.
 * Numa lista ordenada dá no mesmo; a diferença é a conversa fora de ordem: o
 * deep link `?client_id=` (Omnichannel.tsx) põe no TOPO a conversa de um
 * cliente de 2 meses atrás, e comparando item a item todas as ML mais novas
 * que ela subiam acima do WhatsApp de 1 minuto atrás. Com o máximo do sufixo
 * ela fica "fixada" no topo e o resto se intercala normalmente.
 *
 * A ordem do WhatsApp fica intacta de propósito: o "carregar mais" da página
 * acrescenta no fim sem reordenar, e reordenar aqui faria o card que o usuário
 * está olhando pular de lugar. Empate de horário: o WhatsApp vem primeiro.
 *
 * Uma passada só: o máximo do sufixo nunca cresce da esquerda para a direita,
 * as ML vão da mais nova para a mais antiga e o ponteiro só avança.
 */
export function intercalarMl<T extends { last_message_at?: string | null }>(
  listaWa: T[],
  listaMl: MlConversa[],
): Array<T | MlItemLista> {
  const ml = [...listaMl].sort((a, b) => tempo(b.ultima_mensagem_em) - tempo(a.ultima_mensagem_em));
  // sufixoMax[j] = a data mais nova entre listaWa[j..fim].
  const sufixoMax = new Array<number>(listaWa.length);
  for (let j = listaWa.length - 1, max = -Infinity; j >= 0; j--) {
    max = Math.max(max, tempo(listaWa[j]?.last_message_at));
    sufixoMax[j] = max;
  }
  const saida: Array<T | MlItemLista> = [];
  let i = 0;
  for (let j = 0; j < listaWa.length; j++) {
    const wa = listaWa[j];
    const tWa = sufixoMax[j];
    while (i < ml.length && tempo(ml[i].ultima_mensagem_em) > tWa) {
      saida.push({ ...ml[i], __ml: true });
      i++;
    }
    saida.push(wa);
  }
  for (; i < ml.length; i++) saida.push({ ...ml[i], __ml: true });
  return saida;
}

/** A bolinha de "aguardando resposta": só enquanto ninguém abriu depois da última mensagem. */
export function mlAguardandoNaoVista(c: Pick<MlConversa, "aguardando_resposta" | "visto_em" | "ultima_mensagem_em">) {
  if (!c.aguardando_resposta) return false;
  if (!c.visto_em) return true;
  return tempo(c.ultima_mensagem_em) > tempo(c.visto_em);
}

/** Nome do comprador ou, sem ele, o número do pedido. */
export function tituloMl(c: Pick<MlConversa, "comprador_nome" | "pedido_ml" | "pack_id">): string {
  const nome = (c.comprador_nome || "").trim();
  if (nome) return nome;
  const pedido = c.pedido_ml || c.pack_id;
  return pedido ? `Pedido #${pedido}` : "Comprador do Mercado Livre";
}

/** Link da venda no painel do vendedor do ML. */
export function linkVendaMl(pedidoMl: string | null | undefined): string | null {
  const id = (pedidoMl || "").trim();
  return id ? `https://www.mercadolivre.com.br/vendas/${encodeURIComponent(id)}/detalhe` : null;
}

// ── Erro da edge ────────────────────────────────────────────────────────────

/**
 * Mensagem legível de um erro do `supabase.functions.invoke`.
 *
 * Molde: `getEdgeFunctionErrorMessage` do Omnichannel.tsx — o corpo do erro
 * vem em `context` (Response). A edge `ml-suporte` responde `{ erro }`, então
 * essa chave é lida primeiro; `error`/`message` ficam de reserva.
 */
export async function mensagemDeErroDaEdge(err: unknown, padrao: string): Promise<string> {
  const e = err as { message?: string; name?: string } | null;
  const corpo = await corpoDoErroDaEdge(err);
  const texto = corpo?.erro ?? corpo?.error ?? corpo?.message;
  if (typeof texto === "string" && texto.trim()) return texto;
  // "Failed to send a request…" é o texto do supabase-js quando a function nem
  // respondeu (não publicada, rede). Dizer isso em português ajuda mais.
  if (e?.name === "FunctionsFetchError") return "Não foi possível falar com o servidor. Tente de novo.";
  if (e?.name === "FunctionsHttpError") return padrao;
  return (typeof e?.message === "string" && e.message) || padrao;
}

/** Corpo JSON do erro do `functions.invoke` (vem em `context`, uma Response), ou null. */
export async function corpoDoErroDaEdge(err: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (err as { context?: unknown } | null)?.context as
    | { json?: () => Promise<unknown>; clone?: () => Response }
    | undefined;
  if (!ctx) return null;
  try {
    if (ctx instanceof Response) return (await ctx.clone().json()) as Record<string, unknown>;
    if (typeof ctx.json === "function") return (await ctx.json()) as Record<string, unknown>;
  } catch {
    // corpo não era JSON
  }
  return null;
}

/**
 * O envio falhou de um jeito que NÃO prova que a mensagem não saiu?
 *
 * A edge marca `incerto: true` quando o hub pode ter entregue antes de falhar
 * (ml-suporte, "AMBÍGUO"). Do lado de cá também é incerto o que nem trouxe
 * resposta legível: a rede caiu depois de o pedido sair (FunctionsFetchError /
 * FunctionsRelayError) ou a edge morreu sem corpo (5xx do gateway).
 */
export async function envioIncerto(err: unknown): Promise<boolean> {
  const e = err as { name?: string; context?: unknown } | null;
  if (e?.name === "FunctionsFetchError" || e?.name === "FunctionsRelayError") return true;
  const corpo = await corpoDoErroDaEdge(err);
  if (corpo?.incerto === true) return true;
  const status = (e?.context as { status?: number } | undefined)?.status ?? 0;
  return status >= 500 && typeof corpo?.erro !== "string";
}

/**
 * O envio incerto pode ser de um POST que AINDA está a caminho do ML?
 *
 * Sim quando a edge diz `em_curso` (timeout, rede ou 504 do proxy entre a
 * edge e o hub), quando a resposta nem chegou (FunctionsFetchError /
 * FunctionsRelayError: a edge pode estar rodando) e quando a edge morreu sem
 * corpo (5xx do gateway). Nesses casos o hub segue mandando ao ML depois que
 * alguém desistiu, e uma releitura logo em seguida que não acha a mensagem não
 * prova nada.
 */
export async function falhaTalvezEmCurso(err: unknown): Promise<boolean> {
  const e = err as { name?: string; context?: unknown } | null;
  if (e?.name === "FunctionsFetchError" || e?.name === "FunctionsRelayError") return true;
  const corpo = await corpoDoErroDaEdge(err);
  if (corpo?.em_curso === true) return true;
  const status = (e?.context as { status?: number } | undefined)?.status ?? 0;
  return status >= 500 && typeof corpo?.erro !== "string";
}
