// =====================================================================
// Régua do TEXTO e rótulos de BLOQUEIO do Suporte do Mercado Livre — UM
// arquivo para a edge e para o front.
//
// Antes eram duas cópias (hubMl.ts na edge, mlTipos.ts no front) e a do front
// ficou para trás: recusava U+200B, U+2011, U+3000… que a edge limpava, e o
// atendente via "não aceita estes caracteres: U+200B" sem ter como achar o
// caractere invisível nem enviar. Os motivos de bloqueio também divergiam: a
// faixa dizia uma coisa e o toast do 409 (texto da edge) dizia outra.
//
// Molde: _shared/nodeCatalogData.ts — dado puro em _shared que o front importa
// por caminho relativo (src/components/workflow/nodeCatalog.ts:28-38). Por isso
// aqui NÃO entra Deno.*, React nem import nenhum: o arquivo roda nos dois.
// Mexeu aqui, os dois lados mudam juntos — e o hubMl_test.ts confere que o
// front continua importando daqui em vez de voltar a ter cópia.
//
// Os avisos de conteúdo do compositor (telefone, e-mail, link…) também moram
// aqui: eram duas versões de avisosConteudo, e a do front avisava "telefone"
// em código de rastreio. E as duas réguas de tempo da prova de envio (folga do
// relógio do ML e janela do envio que ainda pode estar a caminho), que a edge
// e o front têm de aplicar iguais.
//
// Régua do hub (adapter do ML): 350 caracteres para o vendedor e latin1
// imprimível + \t \n \r — packages/adapters/mercadolivre/src/mappers/
// message.mapper.ts:346, :362-399 (lemund-hub @ 329ca49).
// =====================================================================

/** Teto do vendedor no ML (o comprador tem 3500). Mesma constante do hub (message.mapper.ts:346). */
export const ML_LIMITE_CARACTERES = 350;

/**
 * Trocas que o ML recusaria e que o operador não vê: o editor de texto e o CRM
 * colam aspas curvas, travessão e espaço duro sozinhos (message.mapper.ts:353-359
 * diz o mesmo do lado do hub).
 *
 * Além do contrato (aspas, travessões, reticências, NBSP, CRLF): os outros
 * espaços tipográficos viram espaço e os caracteres de largura zero (inclusive
 * o seletor de variação que acompanha emoji) somem — são invisíveis, e recusar
 * um caractere que a pessoa não consegue achar no texto é pior que tirá-lo.
 * A ORDEM importa: o `\r` sozinho vira `\n` antes de tudo.
 */
const TROCAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\r\n?/g, '\n'],
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[‐‑‒–—―−]/g, '-'],
  [/…/g, '...'],
  [/[  -   　]/g, ' '],
  [/[​‌‍⁠﻿︎️]/g, ''],
];

/** Normaliza SEM aparar as pontas (serve ao digitar: o espaço do fim ainda vai ganhar uma palavra). */
export function normalizarTextoMl(texto: string): string {
  let t = String(texto ?? '');
  for (const [re, por] of TROCAS) t = t.replace(re, por);
  return t;
}

const CONTROLES_ACEITOS = new Set(['\t', '\n', '\r']);
const LATIN1_IMPRIMIVEL = /^[ -~ -ÿ]$/;
/** Controle, formatação e separadores invisíveis: mostrados pelo código, não pelo glifo. */
const INVISIVEL = /[\p{Cc}\p{Cf}\p{Z}]/u;

function aceitoPeloMl(c: string): boolean {
  return CONTROLES_ACEITOS.has(c) || LATIN1_IMPRIMIVEL.test(c);
}

/** Emoji aparece como ele mesmo; o que não tem glifo (U+200E, U+000B…) aparece como "U+XXXX". */
function descreverCaractere(c: string): string {
  if (!INVISIVEL.test(c)) return c;
  return `U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
}

export interface ValidacaoTextoMl {
  ok: boolean;
  /** Já normalizado e aparado — é ESTE que vai para o hub. */
  texto: string;
  erro?: string;
  /** Os caracteres recusados (sem repetição, no máximo 10), prontos para mostrar. */
  recusados?: string[];
}

/**
 * A régua do ML para o vendedor: até 350 caracteres, só latin1 imprimível mais
 * \t \n \r (a mesma do hub, message.mapper.ts:362-399). Validar antes poupa a
 * chamada que o hub faria só para devolver `warning`.
 */
export function validarTextoMl(entrada: string): ValidacaoTextoMl {
  const texto = normalizarTextoMl(entrada).trim();
  if (!texto) return { ok: false, texto, erro: 'Escreva a mensagem antes de enviar.' };

  // `[...texto]` anda por ponto de código: um emoji é UM item, não dois pedaços.
  const recusados = [...new Set([...texto].filter((c) => !aceitoPeloMl(c)))].slice(0, 10).map(descreverCaractere);
  if (recusados.length > 0) {
    return {
      ok: false,
      texto,
      recusados,
      erro: `O Mercado Livre não aceita estes caracteres: ${recusados.join(' ')}. ` +
        'Emojis e símbolos especiais não passam — tire-os e envie de novo.',
    };
  }
  if (texto.length > ML_LIMITE_CARACTERES) {
    return {
      ok: false,
      texto,
      erro: `A mensagem tem ${texto.length} caracteres; o limite do Mercado Livre é ${ML_LIMITE_CARACTERES}.`,
    };
  }
  return { ok: true, texto };
}

// ── Avisos de conteúdo (NÃO bloqueiam) ────────────────────────────────────────
//
// Uma função só para o compositor (front) e para a edge. Antes eram duas: a do
// front pegava QUALQUER sequência de 8 a 13 dígitos, inclusive colada em letra
// — rastreio dos Correios (QB123456789BR), rastreio do Mercado Envios (11
// dígitos), número de NF e CEP com hífen davam "Parece um telefone", e a
// resposta mais comum do pós-venda virava alarme falso (a atendente tirava o
// rastreio achando que o ML ia barrar).

export type TipoAvisoConteudo = 'telefone' | 'email' | 'link' | 'perfil' | 'whatsapp';

export interface AvisoConteudo {
  tipo: TipoAvisoConteudo;
  mensagem: string;
}

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
const RE_EMAIL_TODOS = new RegExp(RE_EMAIL.source, 'g');
/**
 * Trecho numérico candidato a telefone: dígitos com os separadores de telefone
 * (espaço, ponto, hífen, parênteses), NÃO colado em letra/dígito nas pontas.
 * Sem lookbehind (Safari antigo não compila): a borda da esquerda é um grupo
 * capturado, e o trecho é o grupo 2.
 */
const RE_TRECHO_NUMERICO = /(^|[^A-Za-z0-9])(\+?\d[\d\s().-]{6,}\d)(?![A-Za-z0-9])/g;
const RE_LINK =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|br|io|me|ly|app|shop|store|site|online|info|biz|link|co)(?:\.br)?\b/i;
const RE_PERFIL = /(?:^|[^A-Za-z0-9._%+-])@[A-Za-z0-9_.]{3,}/;
const RE_WHATSAPP = /\b(?:whats\s*app|whatsapp|whats|wpp|zap|zapzap|watsapp|wats)\b/i;

/**
 * O trecho tem FORMATO de telefone brasileiro?
 *
 * - 11 dígitos: DDD (dois dígitos de 1 a 9) + 9 + 8 dígitos — celular.
 * - 10 dígitos: DDD + fixo começando em 2 a 5.
 * - 12/13 dígitos começando em 55 (com "+" ou não): o mesmo, sem o código do país.
 * - 8 ou 9 dígitos SÓ com o separador típico (4-4 ou 9XXXX-XXXX): sem
 *   separador é número de NF/pedido; CEP (5-3) não tem esse formato.
 *
 * O rastreio numérico do Mercado Envios (11 dígitos, sem o 9 na 3ª posição),
 * a NF de 9 dígitos e o CEP ficam de fora; o rastreio dos Correios nem chega
 * aqui (está colado em letra). Número de pedido/pack do ML (16 dígitos) também.
 * O rastreio de 11 dígitos COM o 9 na 3ª posição tem o formato exato de um
 * celular — só o contexto separa os dois, e isso é com o `avisosConteudo`.
 */
export function pareceTelefone(trecho: string): boolean {
  const t = String(trecho ?? '').trim();
  let d = t.replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return /^[1-9][1-9]9\d{8}$/.test(d);
  if (d.length === 10) return /^[1-9][1-9][2-5]\d{7}$/.test(d);
  if (d.length === 9) return /^9\d{4}[\s.-]\d{4}$/.test(t);
  if (d.length === 8) return /^\d{4}[\s.-]\d{4}$/.test(t);
  return false;
}

/**
 * Palavra que, logo ANTES de uma sequência de 10 ou 11 dígitos sem separador,
 * diz que ela é código e não telefone: o rastreio numérico do Mercado Envios
 * com o 9 na 3ª posição ("Seu rastreio: 44912345678") tem o formato exato de
 * um celular com DDD, e é a resposta mais comum do pós-venda.
 */
const RE_CONTEXTO_CODIGO =
  /(?:^|[^A-Za-z0-9])(?:rastre(?:io|ios|amento|ar)|envios?|c[oó]d(?:igo|igos)?|pedidos?|nf-?e?|nota(?:\s+fiscal)?)(?![A-Za-z0-9])/i;
/** Quantos caracteres antes do número o contexto é procurado. */
const JANELA_CONTEXTO = 25;
/** Sub-trechos de até tantos blocos separados por espaço são conferidos um a um. */
const MAX_BLOCOS_JANELA = 3;

/**
 * Telefone curto (sem DDD) num bloco SÓ, com o separador dentro dele:
 * 9XXXX-XXXX ou XXXX-XXXX (hífen ou ponto). Espaço não entra — ele separa
 * blocos, e "3524 0612" é par de grupos de uma chave de NF-e.
 */
const RE_TELEFONE_CURTO_NUM_BLOCO = /^(?:9\d{4}|\d{4})[.-]\d{4}$/;

/**
 * Os pedaços de um trecho numérico que podem ser o telefone, com a posição de
 * cada um dentro do trecho. O `RE_TRECHO_NUMERICO` é guloso por espaço: em "Me
 * liga no 41 99999-8888 2 vezes" o trecho é "41 99999-8888 2" (12 dígitos, sem
 * formato de telefone) e o aviso sumia. Por isso, além do trecho inteiro, vale
 * cada janela de 1 a 3 blocos contíguos.
 *
 * A janela de 2 ou mais blocos só conta com 10 dígitos ou mais (DDD): o
 * formato curto (4 4) acusaria cada par de grupos de uma chave de NF-e escrita
 * de 4 em 4. A janela de UM bloco também conta quando ela é o telefone curto
 * com separador ("99999-8888" em "Me liga no 99999-8888 2 vezes") — sem isso
 * o número solto colado por espaço apagava o aviso.
 */
function pedacosDoTrecho(trecho: string): { texto: string; desloc: number }[] {
  const pedacos = [{ texto: trecho, desloc: 0 }];
  const blocos = Array.from(trecho.matchAll(/\S+/g), (m) => ({ ini: m.index ?? 0, fim: (m.index ?? 0) + m[0].length }));
  if (blocos.length < 2) return pedacos;
  for (let i = 0; i < blocos.length; i++) {
    for (let j = i; j < Math.min(blocos.length, i + MAX_BLOCOS_JANELA); j++) {
      if (i === 0 && j === blocos.length - 1) continue; // é o trecho inteiro, já está na lista
      const texto = trecho.slice(blocos[i].ini, blocos[j].fim);
      const conta = texto.replace(/\D/g, '').length >= 10 || (i === j && RE_TELEFONE_CURTO_NUM_BLOCO.test(texto));
      if (conta) pedacos.push({ texto, desloc: blocos[i].ini });
    }
  }
  return pedacos;
}

const RE_CONTEXTO_CODIGO_TODOS = new RegExp(RE_CONTEXTO_CODIGO.source, 'gi');
/**
 * Palavra que diz "o número a seguir é telefone". Entre a palavra de código e
 * o número ("NF 123456 celular 11987654321", "Nota: celular 11987654321"), ela
 * vence: o número é o do celular, não o da nota.
 */
const RE_PALAVRA_TELEFONE =
  /(?:^|[^A-Za-z0-9])(?:telefones?|tel|celular(?:es)?|cel|fones?|contatos?|lig(?:a|ue|ar|ou)|whats(?:app)?|wpp|zap)(?![A-Za-z0-9])/i;

/**
 * O que pode ficar entre a palavra de código e o número sem desfazer o vínculo:
 * pontuação, artigos/preposições curtos e números pequenos ("Envio 1 de 2:",
 * "código de rastreio é", "Pedido nº"). Qualquer outra palavra ("Sobre o pedido,
 * me CHAMA no…", "pedido? FALA comigo:") quer dizer que o número já não é o do
 * pedido — e aí ele volta a ser tratado como telefone (revisão 3, ultimas-1).
 */
const COLA_CODIGO = new Set(['é', 'eh', 'e', 'do', 'da', 'de', 'dos', 'das', 'no', 'na', 'n', 'o', 'a', 'seu', 'sua']);
function soCola(trecho: string): boolean {
  return trecho
    .toLowerCase()
    .split(/[\s:#º°ª.,;()\-–/]+/)
    .filter(Boolean)
    .every((t) => /^\d{1,3}$/.test(t) || COLA_CODIGO.has(t));
}

/**
 * Sequência pura de 10/11 dígitos logo depois de "rastreio", "pedido", "NF"…?
 * Vale a ÚLTIMA palavra de código da janela, só se entre ela e o número houver
 * apenas "cola" (soCola) e nenhuma palavra de telefone.
 */
function ehCodigoPeloContexto(texto: string, inicio: number, pedaco: string): boolean {
  if (!/^\d{10,11}$/.test(pedaco)) return false;
  const antes = texto.slice(Math.max(0, inicio - JANELA_CONTEXTO), inicio);
  let fimDoContexto = -1;
  for (const m of antes.matchAll(RE_CONTEXTO_CODIGO_TODOS)) fimDoContexto = (m.index ?? 0) + m[0].length;
  if (fimDoContexto < 0) return false;
  const entre = antes.slice(fimDoContexto);
  return soCola(entre) && !RE_PALAVRA_TELEFONE.test(entre);
}

/** Algum trecho numérico do texto (ou pedaço dele) tem formato de telefone? */
function temTelefone(texto: string): boolean {
  for (const m of texto.matchAll(RE_TRECHO_NUMERICO)) {
    const inicioTrecho = (m.index ?? 0) + m[1].length;
    for (const p of pedacosDoTrecho(m[2])) {
      if (pareceTelefone(p.texto) && !ehCodigoPeloContexto(texto, inicioTrecho + p.desloc, p.texto)) return true;
    }
  }
  return false;
}

/**
 * Avisos do que a moderação do ML costuma barrar: passar contato ou levar o
 * comprador para fora. NÃO bloqueiam — quem barra de verdade é o ML, e às
 * vezes o atendente precisa mesmo citar um número; o aviso só evita a
 * surpresa de a mensagem "sumir".
 */
export function avisosConteudo(entrada: string): AvisoConteudo[] {
  const texto = normalizarTextoMl(entrada);
  const avisos: AvisoConteudo[] = [];

  const temEmail = RE_EMAIL.test(texto);
  // Sem os e-mails, o domínio deles não conta como link nem o "@" como perfil.
  const semEmail = texto.replace(RE_EMAIL_TODOS, ' ');

  if (temTelefone(semEmail)) {
    avisos.push({
      tipo: 'telefone',
      mensagem: 'Parece um telefone. O Mercado Livre costuma barrar telefone nas mensagens.',
    });
  }
  if (temEmail) {
    avisos.push({
      tipo: 'email',
      mensagem: 'Tem um e-mail. O Mercado Livre costuma barrar contato fora da plataforma.',
    });
  }
  if (RE_LINK.test(semEmail)) {
    avisos.push({
      tipo: 'link',
      mensagem: 'Tem um link ou site. Links costumam ser barrados pela moderação do Mercado Livre.',
    });
  }
  if (RE_PERFIL.test(semEmail)) {
    avisos.push({
      tipo: 'perfil',
      mensagem: 'Tem um @perfil de rede social. A moderação do Mercado Livre costuma barrar.',
    });
  }
  if (RE_WHATSAPP.test(texto)) {
    avisos.push({
      tipo: 'whatsapp',
      mensagem: 'Cita WhatsApp. O Mercado Livre não permite levar a conversa para fora da plataforma.',
    });
  }
  return avisos;
}

// ── Prova de envio ────────────────────────────────────────────────────────────

/**
 * Folga para o relógio do ML ao casar a mensagem enviada na thread relida: só
 * conta outbound com `enviada_em >= início do envio - FOLGA`. É a MESMA régua
 * no `casarEnviada` da edge (hubMl.ts) e no `tentativaApareceu` do front
 * (mlTipos.ts): sem ela no front, um "Obrigado!" de ontem que a releitura
 * importou agora (mandado pelo app do ML) passava por "a mensagem saiu" — e a
 * edge, sobre a mesma thread, dizia "incerto".
 */
export const FOLGA_CASAR_ENVIO_MS = 10 * 60_000;

/**
 * Por quanto tempo um envio que acabou em timeout ou queda de rede (ou que
 * ainda nem terminou) pode chegar ao ML. Durante esse tempo, reler no ML e não
 * achar a mensagem NÃO prova que ela não saiu. O hub faz o POST ao ML com
 * `fetch` sem `signal` nem timeout (mercadolivre-messages.client.ts,
 * `postMessage`, lemund-hub @ 329ca49) e continua depois que a edge desiste,
 * aos 30 s. Quem segura esse POST é o `headersTimeout` padrão do undici no
 * Node, de 300 s. A edge conta essa janela a partir da reserva da tentativa em
 * ml_respostas, e o front a partir da falha.
 */
export const JANELA_ENVIO_EM_CURSO_MS = 5 * 60_000;

// ── Bloqueio ──────────────────────────────────────────────────────────────────

/**
 * Rótulos pt-BR do motivo de bloqueio (substatus CRU do ML, que o hub guarda em
 * `blockedReason` — message.mapper.ts:140-160), pela chave SEM o prefixo
 * `blocked_by_` (ou `block_by_`, que o ML também manda — message.mapper.test.ts:189).
 *
 * Os seis primeiros são os vistos em produção (hub, 06/10/2026: cancelled_order
 * 142, claim 38, ai_assistant_contact_closed 25, mediation 18,
 * conversation_initiated_by_seller_limited 3, time 2); o resto vem da doc do ML
 * e dos rótulos do próprio hub (AtendimentoPage.tsx:601-615).
 */
export const MOTIVOS_BLOQUEIO: Readonly<Record<string, string>> = {
  // Vistos em produção
  cancelled_order: 'O pedido foi cancelado.',
  claim: 'Há uma reclamação aberta neste pedido. A conversa segue pela reclamação, no Mercado Livre.',
  ai_assistant_contact_closed: 'O assistente de IA do Mercado Livre atendeu e encerrou este contato.',
  mediation: 'Há uma mediação em andamento entre comprador e vendedor.',
  conversation_initiated_by_seller_limited:
    'Venda com Mercado Envios: o vendedor só pode puxar conversa pelos "Motivos para se comunicar" do Mercado Livre.',
  time: 'Passaram 30 dias sem mensagem. Só reabre se o comprador escrever.',
  // Da documentação do ML
  buyer: 'O comprador bloqueou as mensagens.',
  fulfillment: 'Venda Full: a conversa só abre depois que o pacote for entregue.',
  not_delivered: 'A conversa só abre depois que o pedido for entregue.',
  payment: 'O pagamento ainda não foi aprovado.',
  conversation_initiated_by_seller: 'Compra de supermercado: o vendedor não pode iniciar a conversa.',
  conversation_use_message_api: 'O comprador já iniciou a conversa: responda pela mensagem normal.',
  cancelled_order_by_fraud: 'O pedido foi cancelado por comportamento irregular.',
  cancelled_order_hidden: 'A compra não foi processada e foi cancelada.',
  mediation_fbm: 'Há uma mediação em andamento numa venda Full.',
  conversation_expired: 'A conversa expirou: passaram 18 meses da compra.',
  expired: 'A conversa expirou: passaram 18 meses da compra.',
  refund: 'O pedido foi reembolsado. Só reabre se o comprador escrever.',
  refunded: 'O pedido foi reembolsado. Só reabre se o comprador escrever.',
  claim_change_open: 'Há uma troca de produto em andamento neste pedido.',
  claim_change_closed: 'Há uma troca de produto em andamento neste pedido.',
  deactivated_account: 'O comprador ou o vendedor excluiu a conta.',
  restrictions: 'Há uma restrição no comprador ou no vendedor.',
  message_pending_review: 'A conversa está em revisão pelo Mercado Livre.',
  return_to_buyer_fulfillment: 'Venda Full: o produto será devolvido ao comprador.',
  ai_assistant: 'Venda Full com o assistente de IA do Mercado Livre: as mensagens ficam com ele.',
  ai_assistant_expired: 'A conversa com o assistente de IA do Mercado Livre expirou.',
  ai_assistant_initiated_by_seller_expired: 'A conversa iniciada com o assistente de IA expirou.',
  resale: 'A venda tem produto de revenda: o Mercado Livre desativa as mensagens.',
  proximity_groceries: 'Compra de supermercado com entrega imediata: o Mercado Livre não abre mensagens.',
};

const rotuloDe = (chave: string): string | null =>
  Object.prototype.hasOwnProperty.call(MOTIVOS_BLOQUEIO, chave) ? MOTIVOS_BLOQUEIO[chave] : null;

/** Motivo legível. Código desconhecido aparece no fim, para dar o que perguntar. */
export function motivoBloqueioPt(cru: string | null | undefined): string {
  const c = String(cru ?? '').trim().toLowerCase();
  if (!c) return 'O Mercado Livre bloqueou esta conversa e não informou o motivo.';
  return rotuloDe(c.replace(/^block(?:ed)?_by_/, '')) ?? rotuloDe(c) ??
    `O Mercado Livre bloqueou esta conversa (código: ${c}).`;
}
