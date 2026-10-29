/**
 * Contrato do sheet "Mais filtros" da aba Clientes.
 *
 * Duas formas do mesmo filtro:
 *  - `ClientesAdvancedFilters`: o estado da UI (strings dos inputs, arrays dos
 *    multi-selects). É o que vai para a URL e o que o sheet edita.
 *  - `ClientesFilterPayload`: o jsonb que as RPCs leem (`_filters`), no
 *    vocabulário de `clientes_filtro_base`.
 *
 * Convenção herdada de `campaignFilters.ts` e OBRIGATÓRIA aqui: a chave só
 * existe no payload quando o filtro está ATIVO. Um `{"stateCode": null}` seria
 * lido pelo banco como filtro ligado.
 *
 * Todo campo daqui tem predicado correspondente em `clientes_filtro_base` — a
 * mesma régua de `kanbanFilters.ts` ("o sheet do Segundo Pedido tem 26 campos e
 * 10 contam no badge sem filtrar nada"). O que caiu, caiu por falta de coluna ou
 * de dado nesta base: convertidos, SKU, categoria, bairro, WhatsApp
 * válido/inválido e trava de fadiga de disparo.
 */

import { formatMarketplaceName } from "@/utils/formatters";
// A leitura de número em pt-BR mora em `src/components/filtros/numeros.ts`
// desde 22/09/2026 — o painel de filtros dos gatilhos de pedido usa a MESMA.
import {
  isNumericInputInvalid,
  parseIntFilterInput,
  parseNumberInput,
} from "@/components/filtros/numeros";
import { statusLabel } from "@/components/pedidos/statusPedido";
import { isRegiaoFiltroChave, rotuloRegiao } from "@/lib/regioes";

export type ClientesFilterPayload = Record<string, unknown>;

export interface ClientesAdvancedFilters {
  /* 1 · Comportamento de compra */
  daysWithoutOrder: string;
  lastOrderFrom: string;
  lastOrderTo: string;
  firstOrderFrom: string;
  firstOrderTo: string;
  ordersMax: string;
  totalSpentMin: string;
  totalSpentMax: string;
  ticketMin: string;
  ticketMax: string;
  boughtToday: boolean;
  /** "all" | "yes" | "no" */
  hasSecondSale: string;
  /** Status (em minúsculas) do ÚLTIMO pedido válido — client_metrics.last_order_status. */
  lastOrderStatuses: string[];

  /* 2 · Produtos */
  productNames: string[];
  productText: string;
  /** "contains" | "starts-with" | "ends-with" | "exact" */
  productOperator: string;
  excludeProductText: string;

  /* 3 · Demografia */
  /** "male" | "female" | "unknown" */
  genders: string[];
  ageBuckets: string[];
  /** "all" | "today" | "month" */
  birthday: string;
  documentTypes: string[];

  /* 4 · Frequência e sazonalidade */
  /** 0 = domingo, como `extract(dow …)`. */
  weekdays: number[];
  shifts: string[];

  /* 5 · Localização */
  /**
   * Chaves de região (`norte` … `sul`, `sem_regiao`) — a régua da aba Regiões
   * (`dash_regiao`), ver `@/lib/regioes`. Combina com `states` por UNIÃO, e a
   * união é feita no banco: Sul + SP = PR/SC/RS ou SP. Vazio = sem filtro.
   */
  regions: string[];
  states: string[];
  cities: string[];
  marketplaces: string[];
  /** Prefixos de CEP separados por vírgula — vira array no payload. */
  zipPrefixes: string;

  /* 6 · Comunicação */
  /** "all" | "any" | "none" | "inbound24" | "never_inbound" */
  conversation: string;
  /** "all" | "only" | "exclude" */
  optOut: string;

  /* 7 · CRM */
  stageIds: string[];
  stageNone: boolean;

  /* 8 · Análise RFV */
  /** Nomes dos segmentos (os 11 da matriz), como estão em `client_rfv.segment`. */
  rfvSegments: string[];
  /** Cliente sem linha em `client_rfv` — "Sem classificação". */
  rfvNone: boolean;
}

export function makeEmptyClientesFilters(): ClientesAdvancedFilters {
  return {
    daysWithoutOrder: "",
    lastOrderFrom: "",
    lastOrderTo: "",
    firstOrderFrom: "",
    firstOrderTo: "",
    ordersMax: "",
    totalSpentMin: "",
    totalSpentMax: "",
    ticketMin: "",
    ticketMax: "",
    boughtToday: false,
    hasSecondSale: "all",
    lastOrderStatuses: [],
    productNames: [],
    productText: "",
    productOperator: "contains",
    excludeProductText: "",
    genders: [],
    ageBuckets: [],
    birthday: "all",
    documentTypes: [],
    weekdays: [],
    shifts: [],
    regions: [],
    states: [],
    cities: [],
    marketplaces: [],
    zipPrefixes: "",
    conversation: "all",
    optOut: "all",
    stageIds: [],
    stageNone: false,
    rfvSegments: [],
    rfvNone: false,
  };
}

/* ------------------------------------------------------------------ rótulos */

export const GENDER_OPTIONS = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Feminino" },
  { value: "unknown", label: "Sem informação" },
] as const;

export const AGE_BUCKET_OPTIONS = [
  { value: "-24", label: "Até 24 anos" },
  { value: "25-34", label: "25 a 34" },
  { value: "35-49", label: "35 a 49" },
  { value: "50-64", label: "50 a 64" },
  { value: "65+", label: "65 ou mais" },
] as const;

/**
 * Os TRÊS valores que `clients.document_type` aceita (o CHECK da tabela é
 * `in ('cpf','cnpj','whatsapp')`). A lista tinha só dois, e o terceiro não é
 * raro: são 4.857 cadastros — contato que entrou sem CPF/CNPJ, identificado
 * pelo próprio número. Sem a opção aqui eles sumiam nos DOIS sentidos: marcar
 * CPF os escondia, marcar CNPJ também, e não havia caixa para trazê-los.
 * O predicado do banco já respondia certo; faltava a caixa.
 */
export const DOCUMENT_TYPE_OPTIONS = [
  { value: "cpf", label: "CPF (pessoa física)" },
  { value: "cnpj", label: "CNPJ (empresa)" },
  { value: "whatsapp", label: "Sem documento (WhatsApp)" },
] as const;

export const WEEKDAY_OPTIONS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
] as const;

export const SHIFT_OPTIONS = [
  { value: "madrugada", label: "Madrugada", hint: "0h–5h" },
  { value: "manha", label: "Manhã", hint: "6h–11h" },
  { value: "tarde", label: "Tarde", hint: "12h–17h" },
  { value: "noite", label: "Noite", hint: "18h–23h" },
] as const;

export const PRODUCT_OPERATORS = [
  { value: "contains", label: "contém" },
  { value: "starts-with", label: "começa com" },
  { value: "ends-with", label: "termina com" },
  { value: "exact", label: "é exatamente" },
] as const;

export const CONVERSATION_OPTIONS = [
  { value: "all", label: "Tanto faz" },
  { value: "any", label: "Já teve conversa" },
  { value: "none", label: "Nunca teve conversa" },
  { value: "inbound24", label: "Respondeu nas últimas 24h" },
  { value: "never_inbound", label: "Nunca respondeu" },
] as const;

export const OPTOUT_OPTIONS = [
  { value: "all", label: "Tanto faz" },
  { value: "exclude", label: "Só quem aceita receber" },
  { value: "only", label: "Só quem pediu para sair" },
] as const;

export const BIRTHDAY_OPTIONS = [
  { value: "all", label: "Tanto faz" },
  { value: "today", label: "Fazem aniversário hoje" },
  { value: "month", label: "Aniversariantes do mês" },
] as const;

export const SECOND_SALE_OPTIONS = [
  { value: "all", label: "Tanto faz" },
  { value: "yes", label: "Já fez o segundo pedido" },
  { value: "no", label: "Ainda parou no primeiro" },
] as const;

const labelOf = (
  opts: readonly { value: string; label: string }[],
  v: string,
): string => opts.find((o) => o.value === v)?.label ?? v;

/* ------------------------------------------------------------------ números */

// Reexportados para nenhum call site antigo precisar trocar de import.
export { isNumericInputInvalid, parseIntFilterInput, parseNumberInput };

/**
 * "Este campo está mesmo filtrando?" — a MESMA pergunta que
 * `clientesFiltersToPayload` faz para decidir se grava a chave.
 *
 * Badge, chip e payload passam por aqui, então não há como um deles achar que o
 * filtro está ligado enquanto o outro manda `{}`: era assim que `abc` em
 * "Máximo de pedidos" acendia o badge, virava o chip "Até abc pedidos" e não
 * mexia um cliente na lista.
 */
const temDias = (raw: string): boolean => {
  const n = parseIntFilterInput(raw);
  return n !== null && n > 0;
};
const temInt = (raw: string): boolean => parseIntFilterInput(raw) !== null;
const temNum = (raw: string): boolean => parseNumberInput(raw) !== null;

const zipList = (raw: string): string[] =>
  String(raw ?? "")
    .split(/[,;\s]+/)
    .map((p) => p.replace(/\D/g, ""))
    .filter(Boolean);

/* ------------------------------------------------------------------ contagem */

export type ClientesFilterSection =
  | "comportamento"
  | "produtos"
  | "demografia"
  | "frequencia"
  | "localizacao"
  | "comunicacao"
  | "crm"
  | "rfv";

/** As 8 seções na ordem do print. A primeira nasce aberta. */
export const CLIENTES_FILTER_SECTIONS: { key: ClientesFilterSection; title: string }[] = [
  { key: "comportamento", title: "Comportamento de compra" },
  { key: "produtos", title: "Produtos" },
  { key: "demografia", title: "Demografia" },
  { key: "frequencia", title: "Frequência e sazonalidade" },
  { key: "localizacao", title: "Localização" },
  { key: "comunicacao", title: "Comunicação" },
  { key: "crm", title: "CRM" },
  { key: "rfv", title: "Análise RFV" },
];

/**
 * Quantos filtros ativos por seção. Uma dimensão conta 1; par mín/máx conta 1
 * (padrão de `countActiveKanbanFilters`).
 *
 * É a ÚNICA soma do arquivo: o badge do botão é a soma daqui, e não um total
 * escrito à mão que esquece um campo quando alguém acrescenta o próximo.
 */
export function clientesFilterSectionCounts(
  f: ClientesAdvancedFilters,
): Record<ClientesFilterSection, number> {
  const n = (b: boolean) => (b ? 1 : 0);
  return {
    comportamento:
      n(temDias(f.daysWithoutOrder)) +
      n(!!(f.lastOrderFrom || f.lastOrderTo)) +
      n(!!(f.firstOrderFrom || f.firstOrderTo)) +
      n(temInt(f.ordersMax)) +
      n(temNum(f.totalSpentMin) || temNum(f.totalSpentMax)) +
      n(temNum(f.ticketMin) || temNum(f.ticketMax)) +
      n(f.boughtToday) +
      n(f.hasSecondSale !== "all") +
      n(f.lastOrderStatuses.length > 0),
    produtos:
      n(f.productNames.length > 0 || !!f.productText.trim()) +
      n(!!f.excludeProductText.trim()),
    demografia:
      n(f.genders.length > 0) +
      n(f.ageBuckets.length > 0) +
      n(f.birthday !== "all") +
      n(f.documentTypes.length > 0),
    frequencia: n(f.weekdays.length > 0) + n(f.shifts.length > 0),
    localizacao:
      n(f.regions.length > 0) +
      n(f.states.length > 0) +
      n(f.cities.length > 0) +
      n(f.marketplaces.length > 0) +
      n(zipList(f.zipPrefixes).length > 0),
    comunicacao: n(f.conversation !== "all") + n(f.optOut !== "all"),
    crm: n(f.stageIds.length > 0 || f.stageNone),
    rfv: n(f.rfvSegments.length > 0 || f.rfvNone),
  };
}

export function countActiveClientesFilters(f: ClientesAdvancedFilters): number {
  return Object.values(clientesFilterSectionCounts(f)).reduce((s, v) => s + v, 0);
}

export function isClientesFiltersActive(f: ClientesAdvancedFilters): boolean {
  return countActiveClientesFilters(f) > 0;
}

/* ------------------------------------------------------------------- payload */

export interface ClientesBaseFilters {
  /** ISO timestamptz do select "Período" da barra. */
  periodStart?: string | null;
  /** Select "Mínimo de pedidos" da barra — mesma chave, um estado só. */
  minOrders?: number;
  /** Busca já debounced. */
  search?: string | null;
  /**
   * Recorte de loja IMPOSTO pela tela, não escolhido pelo usuário.
   *
   * Dentro de `/lojas/:marketplace` a loja não é um filtro: é o contexto. Como
   * `filterPayload` é o único objeto que desce para as oito consultas da tela
   * (lista, KPIs, os quatro gráficos e as três sheets), travar aqui trava todas
   * de uma vez — e nenhum botão de "limpar" precisa saber que a trava existe,
   * porque nenhum deles passa por aqui.
   */
  lockedMarketplaces?: string[];
  /**
   * Recorte de TEMPO colado na trava de loja (`marketplacesFrom` no motor).
   *
   * Sem ele a trava é vitalícia e o período recai sobre `last_order_at`, que é o
   * último pedido do cliente em QUALQUER loja: a interseção vira "já comprou
   * aqui algum dia E comprou em algum lugar no período" e a aba responde 51 onde
   * o cabeçalho da loja, a Visão Geral e o gráfico "Lojas" respondem 46.
   */
  lockedMarketplacesFrom?: string | null;
}

/**
 * Traduz o estado da UI no jsonb que `clientes_filtro_base` lê.
 *
 * As cinco chaves já gravadas em `campaign_plans.filter_payload` (`periodDays`,
 * `minOrders`, `stateCode`, `search`, `rfvSegments`) são intocáveis — renomear
 * quebraria o Planejamento em silêncio. `states` (multi) coexiste com
 * `stateCode` e vence quando presente.
 */
export function clientesFiltersToPayload(
  f: ClientesAdvancedFilters,
  base: ClientesBaseFilters = {},
): ClientesFilterPayload {
  const p: ClientesFilterPayload = {};

  if (base.periodStart) p.periodStart = base.periodStart;
  if (base.minOrders && base.minOrders > 0) p.minOrders = base.minOrders;
  const q = base.search?.trim();
  if (q) p.search = q;

  /* 1 · Comportamento */
  const semComprar = parseIntFilterInput(f.daysWithoutOrder);
  if (temDias(f.daysWithoutOrder)) p.daysWithoutOrder = semComprar;
  if (f.lastOrderFrom) p.lastOrderFrom = f.lastOrderFrom;
  if (f.lastOrderTo) p.lastOrderTo = f.lastOrderTo;
  if (f.firstOrderFrom) p.firstOrderFrom = f.firstOrderFrom;
  if (f.firstOrderTo) p.firstOrderTo = f.firstOrderTo;
  const maxPedidos = parseIntFilterInput(f.ordersMax);
  if (maxPedidos !== null) p.ordersMax = maxPedidos;
  const gastoMin = parseNumberInput(f.totalSpentMin);
  if (gastoMin !== null) p.totalSpentMin = gastoMin;
  const gastoMax = parseNumberInput(f.totalSpentMax);
  if (gastoMax !== null) p.totalSpentMax = gastoMax;
  const ticketMin = parseNumberInput(f.ticketMin);
  if (ticketMin !== null) p.ticketMin = ticketMin;
  const ticketMax = parseNumberInput(f.ticketMax);
  if (ticketMax !== null) p.ticketMax = ticketMax;
  if (f.boughtToday) p.boughtToday = true;
  if (f.hasSecondSale === "yes") p.hasSecondSale = true;
  if (f.hasSecondSale === "no") p.hasSecondSale = false;
  if (f.lastOrderStatuses.length > 0) p.lastOrderStatuses = f.lastOrderStatuses;

  /* 2 · Produtos */
  if (f.productNames.length > 0) p.productNames = f.productNames;
  const prodTxt = f.productText.trim();
  if (prodTxt) {
    p.productText = prodTxt;
    p.productOperator = f.productOperator || "contains";
  }
  const prodExcl = f.excludeProductText.trim();
  if (prodExcl) p.excludeProductText = prodExcl;

  /* 3 · Demografia */
  if (f.genders.length > 0) p.genders = f.genders;
  if (f.ageBuckets.length > 0) p.ageBuckets = f.ageBuckets;
  if (f.birthday === "today" || f.birthday === "month") p.birthday = f.birthday;
  if (f.documentTypes.length > 0) p.documentTypes = f.documentTypes;

  /* 4 · Frequência */
  if (f.weekdays.length > 0) p.weekdays = f.weekdays;
  if (f.shifts.length > 0) p.shifts = f.shifts;

  /* 5 · Localização */
  // `regions` e `states` descem separados: é `clientes_filtro_base` quem soma
  // as UFs da região às UFs marcadas (união). Somar aqui no front faria o chip
  // "UF: …" mostrar estados que o usuário não marcou.
  if (f.regions.length > 0) p.regions = f.regions;
  if (f.states.length > 0) p.states = f.states;
  if (f.cities.length > 0) p.cities = f.cities;
  if (f.marketplaces.length > 0) p.marketplaces = f.marketplaces;
  const zips = zipList(f.zipPrefixes);
  if (zips.length > 0) p.zipPrefixes = zips;

  // A trava vence o que o usuário escolheu, e vem DEPOIS de propósito: é o
  // último ponto por onde toda consulta da tela passa, então não há como um
  // "Limpar", um chip ou um `?f=` editado à mão devolverem a loja inteira.
  if (base.lockedMarketplaces && base.lockedMarketplaces.length > 0) {
    p.marketplaces = base.lockedMarketplaces;
    // A trava é "comprou NESTA loja no período", não "pertence a esta loja
    // desde sempre". Sem esta chave o predicado de canal é vitalício e o
    // período cai sobre o último pedido em qualquer loja — as duas perguntas se
    // cruzam e o resultado não é nenhuma das duas.
    if (base.lockedMarketplacesFrom) p.marketplacesFrom = base.lockedMarketplacesFrom;
  }

  /* 6 · Comunicação */
  if (f.conversation !== "all") p.conversation = f.conversation;
  if (f.optOut !== "all") p.optOut = f.optOut;

  /* 7 · CRM */
  if (f.stageIds.length > 0) p.stageIds = f.stageIds;
  if (f.stageNone) p.stageNone = true;

  /* 8 · RFV */
  // As duas chaves nunca saíram de `clientes_filtro_base`: o patch de
  // 26/08/2026 (lastOrderStatuses) só acrescentou texto à função, e conferi em
  // 29/08/2026 que teste e produção ainda leem `rfvSegments`/`rfvNone` e batem
  // em `client_rfv`. O que voltou aqui é só o lado do front.
  if (f.rfvSegments.length > 0) p.rfvSegments = f.rfvSegments;
  if (f.rfvNone) p.rfvNone = true;

  return p;
}

/**
 * O mesmo payload sem as chaves de período.
 *
 * `get_clients_growth_series` avisa na migration: mandar `periodStart` recorta
 * os "novos" a quem comprou dentro do período e a curva histórica desaba. O
 * gráfico é de crescimento da base — vão só os filtros de perfil.
 *
 * `marketplacesFrom` sai junto: é o mesmo período, colado no predicado de loja.
 * A loja FICA (a curva é da base daquela loja); só o recorte de tempo cai.
 */
export function withoutPeriod(payload: ClientesFilterPayload): ClientesFilterPayload {
  const { periodStart, periodDays, marketplacesFrom, ...resto } = payload as Record<
    string,
    unknown
  >;
  void periodStart;
  void periodDays;
  void marketplacesFrom;
  return resto;
}

/* --------------------------------------------------------------------- chips */

export interface ClientesFilterChip {
  key: string;
  label: string;
  /** Devolve o filtro sem esta dimensão — o chip nunca some pela metade. */
  clear: (f: ClientesAdvancedFilters) => ClientesAdvancedFilters;
}

// Centavos só aparecem quando o usuário digitou centavos: arredondar o rótulo
// faria o chip mostrar um valor diferente do que ele acabou de escrever.
const brl = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  });

const dataCurta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return d ? `${d}/${m}/${a}` : iso;
};

// `null` nos DOIS lados é possível — o chip nasce de texto que o parser rejeita
// (letras, "R$", um traço), e a URL é editável à mão. Chamar `fmt(null)` aqui
// estourava `n.toLocaleString` dentro do useMemo de render da página e levava a
// tela inteira para o ErrorBoundary, com o `?f=` venenoso na barra de endereço
// para quebrar de novo no F5. Quem chama já não cria o chip nesse caso; este
// retorno é a rede de baixo, para a promessa de `parseFiltersFromUrl` ("URL
// editada à mão não pode derrubar a página") valer de verdade.
const faixa = (min: string, max: string, fmt: (n: number) => string): string => {
  const a = parseNumberInput(min);
  const b = parseNumberInput(max);
  if (a !== null && b !== null) return `${fmt(a)} a ${fmt(b)}`;
  if (a !== null) return `a partir de ${fmt(a)}`;
  if (b !== null) return `até ${fmt(b)}`;
  return "—";
};

const periodoLabel = (de: string, ate: string): string => {
  if (de && ate) return `${dataCurta(de)} a ${dataCurta(ate)}`;
  if (de) return `a partir de ${dataCurta(de)}`;
  return `até ${dataCurta(ate)}`;
};

/**
 * Um chip por dimensão ativa. Fica no MESMO arquivo do tipo de propósito: com a
 * descrição num canto e o `clearAll` noutro, sempre sobra um campo esquecido —
 * é exatamente assim que o `clearAllFilters` da referência perde o filtro de
 * marketplace.
 */
export function describeClientesFilters(
  f: ClientesAdvancedFilters,
  ctx: { stageNames?: Record<string, string> } = {},
): ClientesFilterChip[] {
  const chips: ClientesFilterChip[] = [];
  const add = (
    key: string,
    label: string,
    patch: Partial<ClientesAdvancedFilters>,
  ) => chips.push({ key, label, clear: (cur) => ({ ...cur, ...patch }) });

  // O chip mostra o número JÁ INTERPRETADO, não o texto cru: é o valor que
  // desceu para a RPC, e é assim que "10.000" digitado aparece como R$ 10.000.
  if (temDias(f.daysWithoutOrder))
    add("daysWithoutOrder", `Sem comprar há +${parseIntFilterInput(f.daysWithoutOrder)} dias`, {
      daysWithoutOrder: "",
    });

  if (f.lastOrderFrom || f.lastOrderTo)
    add("lastOrder", `Última compra ${periodoLabel(f.lastOrderFrom, f.lastOrderTo)}`, {
      lastOrderFrom: "",
      lastOrderTo: "",
    });

  if (f.firstOrderFrom || f.firstOrderTo)
    add("firstOrder", `Primeira compra ${periodoLabel(f.firstOrderFrom, f.firstOrderTo)}`, {
      firstOrderFrom: "",
      firstOrderTo: "",
    });

  if (temInt(f.ordersMax))
    add("ordersMax", `Até ${parseIntFilterInput(f.ordersMax)} pedidos`, { ordersMax: "" });

  if (temNum(f.totalSpentMin) || temNum(f.totalSpentMax))
    add("totalSpent", `Gasto ${faixa(f.totalSpentMin, f.totalSpentMax, brl)}`, {
      totalSpentMin: "",
      totalSpentMax: "",
    });

  if (temNum(f.ticketMin) || temNum(f.ticketMax))
    add("ticket", `Ticket ${faixa(f.ticketMin, f.ticketMax, brl)}`, {
      ticketMin: "",
      ticketMax: "",
    });

  if (f.boughtToday) add("boughtToday", "Comprou hoje", { boughtToday: false });

  if (f.hasSecondSale !== "all")
    add("hasSecondSale", labelOf(SECOND_SALE_OPTIONS, f.hasSecondSale), {
      hasSecondSale: "all",
    });

  if (f.lastOrderStatuses.length > 0)
    add(
      "lastOrderStatuses",
      `Último pedido: ${f.lastOrderStatuses.map(statusLabel).join(", ")}`,
      { lastOrderStatuses: [] },
    );

  if (f.productNames.length > 0 || f.productText.trim()) {
    const partes = [...f.productNames];
    if (f.productText.trim()) {
      partes.push(`${labelOf(PRODUCT_OPERATORS, f.productOperator)} "${f.productText.trim()}"`);
    }
    add(
      "produto",
      `Comprou: ${partes.length > 2 ? `${partes.length} produtos` : partes.join(", ")}`,
      { productNames: [], productText: "" },
    );
  }

  if (f.excludeProductText.trim())
    add("excludeProduct", `Não comprou "${f.excludeProductText.trim()}"`, {
      excludeProductText: "",
    });

  if (f.genders.length > 0)
    add("genders", f.genders.map((g) => labelOf(GENDER_OPTIONS, g)).join(", "), {
      genders: [],
    });

  if (f.ageBuckets.length > 0)
    add(
      "ageBuckets",
      `Idade: ${f.ageBuckets.map((a) => labelOf(AGE_BUCKET_OPTIONS, a)).join(", ")}`,
      { ageBuckets: [] },
    );

  if (f.birthday !== "all")
    add("birthday", labelOf(BIRTHDAY_OPTIONS, f.birthday), { birthday: "all" });

  if (f.documentTypes.length > 0)
    add(
      "documentTypes",
      f.documentTypes
        .map((d) =>
          d === "cnpj"
            ? "Empresa (CNPJ)"
            : d === "whatsapp"
              ? "Sem documento"
              : "Pessoa física (CPF)",
        )
        .join(", "),
      { documentTypes: [] },
    );

  if (f.weekdays.length > 0)
    add(
      "weekdays",
      `Compra em: ${f.weekdays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_OPTIONS.find((w) => w.value === d)?.label ?? d)
        .join(", ")}`,
      { weekdays: [] },
    );

  if (f.shifts.length > 0)
    add(
      "shifts",
      `Turno: ${f.shifts.map((s) => labelOf(SHIFT_OPTIONS, s)).join(", ")}`,
      { shifts: [] },
    );

  // Rótulo da régua (`sul` → "Sul"), nunca a chave crua — mesma regra do chip
  // de loja logo abaixo. Um chip só para a região e outro para a UF: os dois
  // filtros coexistem (união no banco), e tirar um não pode levar o outro.
  if (f.regions.length > 0)
    add(
      "regions",
      f.regions.length > 3
        ? `${f.regions.length} regiões`
        : `Região: ${f.regions.map(rotuloRegiao).join(", ")}`,
      { regions: [] },
    );

  if (f.states.length > 0)
    add(
      "states",
      f.states.length > 3 ? `${f.states.length} estados` : `UF: ${f.states.join(", ")}`,
      { states: [] },
    );

  if (f.cities.length > 0)
    add(
      "cities",
      f.cities.length > 2 ? `${f.cities.length} cidades` : `Cidade: ${f.cities.join(", ")}`,
      { cities: [] },
    );

  // O MESMO rótulo que o sheet ofereceu. `marketplaces` guarda a chave crua do
  // banco (`mercado_livre`, `ml_full`), e o chip que a imprimia dizia outra
  // coisa do que o usuário acabou de marcar.
  if (f.marketplaces.length > 0)
    add(
      "marketplaces",
      f.marketplaces.length > 2
        ? `${f.marketplaces.length} lojas`
        : `Loja: ${f.marketplaces.map(formatMarketplaceName).join(", ")}`,
      { marketplaces: [] },
    );

  const zips = zipList(f.zipPrefixes);
  if (zips.length > 0)
    add("zipPrefixes", `CEP ${zips.join(", ")}…`, { zipPrefixes: "" });

  if (f.conversation !== "all")
    add("conversation", labelOf(CONVERSATION_OPTIONS, f.conversation), {
      conversation: "all",
    });

  if (f.optOut !== "all")
    add("optOut", labelOf(OPTOUT_OPTIONS, f.optOut), { optOut: "all" });

  if (f.stageIds.length > 0 || f.stageNone) {
    const nomes = f.stageIds.map((id) => ctx.stageNames?.[id] ?? "Fase");
    if (f.stageNone) nomes.push("Sem fase");
    add(
      "stages",
      `Funil: ${nomes.length > 2 ? `${nomes.length} fases` : nomes.join(", ")}`,
      { stageIds: [], stageNone: false },
    );
  }

  if (f.rfvSegments.length > 0 || f.rfvNone) {
    const nomes = [...f.rfvSegments];
    if (f.rfvNone) nomes.push("Sem classificação");
    add(
      "rfv",
      `RFV: ${nomes.length > 2 ? `${nomes.length} segmentos` : nomes.join(", ")}`,
      { rfvSegments: [], rfvNone: false },
    );
  }

  return chips;
}

/* ----------------------------------------------------------------------- URL */

/**
 * JSON puro na URL, sem base64 — o filtro tem de ser legível e editável por
 * quem recebe o link. Só o que já é público na tela viaja: UF, cidade, faixas,
 * segmento. A busca (que pode ser CPF ou telefone) NÃO entra.
 */
export function serializeFiltersToUrl(f: ClientesAdvancedFilters): string | null {
  const vazio = makeEmptyClientesFilters() as unknown as Record<string, unknown>;
  const atual = f as unknown as Record<string, unknown>;
  const diff: Record<string, unknown> = {};
  for (const k of Object.keys(vazio)) {
    // `productOperator` só existe acompanhado de `productText` — é o único campo
    // do contrato que não conta no badge nem vira chip. Sozinho na URL, ele põe
    // um `?f=` na barra de endereço para um filtro que não existe, e quem recebe
    // o link acha que carrega algum recorte.
    if (k === "productOperator" && !String(atual.productText ?? "").trim()) continue;
    const a = atual[k];
    const b = vazio[k];
    if (Array.isArray(a)) {
      if (a.length > 0) diff[k] = a;
    } else if (a !== b) {
      diff[k] = a;
    }
  }
  return Object.keys(diff).length > 0 ? JSON.stringify(diff) : null;
}

/** Leitura tolerante: URL editada à mão não pode derrubar a página. */
export function parseFiltersFromUrl(raw: string | null): ClientesAdvancedFilters {
  const base = makeEmptyClientesFilters();
  if (!raw) return base;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return base;
  }
  if (!obj || typeof obj !== "object") return base;

  const r = obj as Record<string, unknown>;
  const out = { ...base } as unknown as Record<string, unknown>;
  for (const k of Object.keys(base)) {
    const v = r[k];
    if (v === undefined) continue;
    const atual = (base as unknown as Record<string, unknown>)[k];
    if (Array.isArray(atual)) {
      if (Array.isArray(v)) {
        out[k] =
          k === "weekdays"
            ? v.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6)
            : k === "regions"
              // Só as 6 chaves da régua: uma chave inventada no `?f=` não vira
              // chip nem chega ao banco (onde `regiao_ufs` devolveria vazio e o
              // filtro pareceria ligado sem filtrar nada).
              ? v.filter(isRegiaoFiltroChave)
              : v.filter((x) => typeof x === "string" && x !== "");
      }
    } else if (typeof atual === "boolean") {
      out[k] = v === true || v === "true";
    } else if (typeof v === "string" || typeof v === "number") {
      out[k] = String(v);
    }
  }
  return out as unknown as ClientesAdvancedFilters;
}
