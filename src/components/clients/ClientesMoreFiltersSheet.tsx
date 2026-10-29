import { useEffect, useMemo, useState } from "react";
import { Info, Loader2, Lock, Search, SlidersHorizontal } from "lucide-react";

import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FiltrosSheetShell } from "@/components/filtros/FiltrosSheetShell";
// Os átomos visuais (seção, campo, chip, slider de dinheiro, faceta) moram em
// `src/components/filtros/` desde 22/09/2026: o painel de filtros dos gatilhos
// de pedido usa os MESMOS. Os apelidos mantêm os nomes curtos de dentro deste
// arquivo, para nenhum dos ~40 call sites de JSX precisar mudar.
import {
  CampoFiltro as Campo,
  CampoNumeroFiltro as CampoNumero,
  ChipFiltro as Chip,
  SecaoFiltros as Secao,
  tituloDaSecao,
} from "@/components/filtros/SecaoFiltros";
import {
  CampoPeriodoDatas,
  DEGRAUS_GASTO,
  DEGRAUS_TICKET,
  FaixaDinheiro,
} from "@/components/filtros/CamposFiltros";
import {
  FacetChips,
  FacetSearchList,
  RegiaoFacetChips,
} from "@/components/filtros/FacetasFiltros";
import { Switch } from "@/components/ui/switch";
import { formatMarketplaceName } from "@/utils/formatters";

import { isConditionalStage } from "@/components/crm/kanbanFilters";
import { useRfvFilterOptions, useRfvSummary, RFV_COLORS } from "@/hooks/useRfv";
import {
  NO_FACET_FILTERS,
  usePipelineStageOptions,
  useSellerOrderStatusOptions,
} from "@/hooks/useClientesFacets";

import {
  AGE_BUCKET_OPTIONS,
  BIRTHDAY_OPTIONS,
  CLIENTES_FILTER_SECTIONS,
  CONVERSATION_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  GENDER_OPTIONS,
  OPTOUT_OPTIONS,
  PRODUCT_OPERATORS,
  SECOND_SALE_OPTIONS,
  SHIFT_OPTIONS,
  WEEKDAY_OPTIONS,
  clientesFilterSectionCounts,
  countActiveClientesFilters,
  makeEmptyClientesFilters,
  parseIntFilterInput,
  type ClientesAdvancedFilters,
  type ClientesFilterPayload,
} from "./clientesFilters";

interface ClientesMoreFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ClientesAdvancedFilters;
  onApply: (next: ClientesAdvancedFilters) => void;
  sellerId: string;
  /** Valor do select "Período" da barra ("30", "9999" = todo período). */
  periodDays: string;
  /** Abre o período para "Todo período" — ver o aviso de "Sem comprar há…". */
  onUseAllTime: () => void;
  /**
   * Rótulo da loja quando a tela já está travada nela (`/lojas/:marketplace`).
   *
   * Presente, o campo "Loja / canal de venda" SOME e vira uma linha estática. A
   * trava mora no payload: deixar os chips de loja clicáveis daria um no-op
   * silencioso — o usuário marca Shopee, aplica, e a tela não mexe.
   */
  lockedMarketplaceLabel?: string;
  /**
   * Recorte IMPOSTO pela tela (a loja travada), no vocabulário do motor.
   *
   * Vai para as facetas: sem ele o painel oferece as 401 cidades e os 393
   * produtos do seller dentro de uma loja onde só 78 e 102 existem, e imprime
   * "SP 187" ao lado de um filtro que devolve 24. Não são os filtros do próprio
   * sheet — faceta que se auto-filtra deixa de oferecer as outras opções.
   */
  facetFilters?: ClientesFilterPayload;
}

/* --------------------------------------------------------------- componente */

export function ClientesMoreFiltersSheet({
  open,
  onOpenChange,
  value,
  onApply,
  sellerId,
  periodDays,
  onUseAllTime,
  lockedMarketplaceLabel,
  facetFilters = NO_FACET_FILTERS,
}: ClientesMoreFiltersSheetProps) {
  const [draft, setDraft] = useState<ClientesAdvancedFilters>(value);

  // O sheet é um rascunho: só "Aplicar" empurra para a tela. Na referência cada
  // tecla aplica o filtro porque lá ele roda em memória; aqui cada mudança
  // dispararia as cinco RPCs da página.
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  // `rfv_summary` é RPC pesada (régua + matriz + os 11 segmentos): num seller
  // grande a resposta leva segundos, e o sheet não é dono dessa carga. O gatilho
  // é o mesmo das fases e dos status abaixo (`open`), mas por outro caminho:
  // `usePipelineStageOptions`/`useSellerOrderStatusOptions` recebem `enabled`
  // como segundo argumento e mantêm a chave, enquanto `useRfvSummary` só aceita
  // o sellerId — daí o `open ? sellerId : undefined`, que com o painel fechado
  // troca a chave para ["rfv-summary", undefined] e cai no `enabled: !!sellerId`
  // do hook. Trocar de chave aqui não esfria nada: quem segura
  // ["rfv-summary", sellerId] viva é o select da barra em ClientesScreen, que
  // consulta sem gate nenhum. Por isso quem abre o painel dentro da tela
  // Clientes normalmente já encontra a resposta pronta (staleTime de 5 min).
  const rfvOptions = useRfvFilterOptions(open ? sellerId : undefined);
  // "ainda não perguntei" e "não tem" são coisas diferentes — é a mesma regra
  // que o FacetChips acima já respeita. Sem o spinner, a janela de segundos de
  // cache frio é tempo de sobra para o usuário ler "não está liberada para este
  // seller" e fechar o painel convencido disso.
  const { isLoading: rfvLoading } = useRfvSummary(open ? sellerId : undefined);

  const {
    data: stages = [],
    isLoading: stagesLoading,
    isError: stagesError,
  } = usePipelineStageOptions(sellerId, open);

  const counts = clientesFilterSectionCounts(draft);
  const total = countActiveClientesFilters(draft);

  // Auto-expansão: abre já expandido todo grupo com filtro APLICADO (senão o
  // usuário encara oito acordeões fechados sem pista de onde está o filtro
  // ligado), mais o primeiro grupo, que nasce aberto por padrão. Calculado
  // sobre `value` — não sobre o rascunho — porque o `defaultValue` do Accordion
  // é lido quando o CONTEÚDO do Sheet monta (Radix desmonta ao fechar), e nesse
  // instante o efeito de sincronização do rascunho ainda não rodou.
  const defaultOpen = useMemo(() => {
    const aplicados = clientesFilterSectionCounts(value);
    const abertos = CLIENTES_FILTER_SECTIONS.filter((s) => aplicados[s.key] > 0).map(
      (s) => s.key as string,
    );
    if (!abertos.includes("comportamento")) abertos.unshift("comportamento");
    return abertos;
  }, [value]);

  // Período da barra x "sem comprar há mais de N dias": os dois se anulam.
  const diasSemComprar = parseIntFilterInput(draft.daysWithoutOrder);
  const periodoDias = Number(periodDays);
  const churnAnulado =
    diasSemComprar !== null &&
    diasSemComprar > 0 &&
    Number.isFinite(periodoDias) &&
    periodoDias < 9999 &&
    diasSemComprar >= periodoDias;

  const temFaseCondicional = useMemo(() => stages.some(isConditionalStage), [stages]);

  // Os segmentos que a análise devolveu MAIS os que já estão marcados e não
  // vieram nela. O segundo caso é real: o deep link `?rfv=Campeões` liga o
  // filtro numa tela onde a análise ainda pode estar travada, e um filtro ativo
  // que não dá para desmarcar de dentro do sheet é filtro preso. Sem contagem
  // (`clients: null`) porque desses o resumo não sabe nada.
  const segmentosVisiveis = useMemo(() => {
    const lista: { name: string; color: string; clients: number | null }[] = rfvOptions.map((o) => ({
      name: o.name,
      color: o.color,
      clients: o.clients,
    }));
    for (const nome of draft.rfvSegments) {
      if (!lista.some((s) => s.name === nome)) {
        lista.push({ name: nome, color: RFV_COLORS[nome] ?? "#94a3b8", clients: null });
      }
    }
    return lista;
  }, [rfvOptions, draft.rfvSegments]);

  // Opções de "Status do último pedido" — só busca com o sheet aberto.
  const { data: statusOptions = [] } = useSellerOrderStatusOptions(sellerId, open);

  const set = <K extends keyof ClientesAdvancedFilters>(
    k: K,
    v: ClientesAdvancedFilters[K],
  ) => setDraft((p) => ({ ...p, [k]: v }));

  const toggleText = (k: keyof ClientesAdvancedFilters, item: string) =>
    setDraft((p) => {
      const atual = p[k] as string[];
      return {
        ...p,
        [k]: atual.includes(item) ? atual.filter((x) => x !== item) : [...atual, item],
      };
    });

  const toggleWeekday = (d: number) =>
    setDraft((p) => ({
      ...p,
      weekdays: p.weekdays.includes(d)
        ? p.weekdays.filter((x) => x !== d)
        : [...p.weekdays, d],
    }));

  const titulo = (key: string) => tituloDaSecao(CLIENTES_FILTER_SECTIONS, key);

  // "Grupo sem opções some inteiro": um seller sem fases no funil não ganha um
  // acordeão só para ler que não tem fases. Só some quando a resposta CHEGOU
  // vazia (carregando/erro ainda mostram o estado) e não há filtro preso do
  // grupo — se `stageNone` veio da URL, o grupo fica para o usuário limpá-lo.
  const esconderCrm =
    !stagesLoading && !stagesError && stages.length === 0 && counts.crm === 0;

  return (
    <FiltrosSheetShell
      open={open}
      onOpenChange={onOpenChange}
      title="Mais filtros"
      subtitle="Recortam a lista, os seis indicadores do topo e os gráficos ao mesmo tempo — os três sempre mostram o mesmo conjunto de clientes."
      icon={SlidersHorizontal}
      // HONESTIDADE: `total` é a MESMA soma que decide o payload — campo
      // inválido não acende aqui nem filtra lá.
      count={total}
      footer={
        /* Rodapé padrão da casa: Limpar (outline) + primário com a contagem.
           "Limpar" APLICA na hora, de propósito. Zerando só o rascunho, o
           painel esvaziava inteiro na frente do usuário e o botão ao lado
           perdia a contagem — lê como "pronto, limpou" —, mas fechar no X ou no
           Esc descartava o rascunho e todos os filtros continuavam valendo, com
           a lista ainda recortada. O sheet fica aberto: o usuário vê o painel
           vazio e a tela atrás já solta. */
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => {
              const vazio = makeEmptyClientesFilters();
              setDraft(vazio);
              onApply(vazio);
            }}
          >
            Limpar filtros
          </Button>
          <Button
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            Aplicar{total > 0 ? ` (${total})` : ""}
          </Button>
        </div>
      }
    >
        {/* -mx-6 px-6: a borda dos grupos corre de ponta a ponta do sheet. */}
        <div className="-mx-6 px-6">
          <Accordion type="multiple" defaultValue={defaultOpen}>
            {/* 1 ------------------------------------------------------------ */}
            <Secao
              value="comportamento"
              title={titulo("comportamento")}
              count={counts.comportamento}
            >
              {/* O motor exige as duas coisas ao mesmo tempo: `last_order_at >=
                  início do período` E `last_order_at < hoje - N dias`. Com o
                  padrão da tela (30 dias), qualquer N >= 30 é contradição e
                  devolve zero SEMPRE. O aviso agora é microtexto sob o campo
                  (padrão da casa), com a ação de destravar embutida — sem ela o
                  filtro de churn é um beco sem saída até o usuário adivinhar
                  que precisa mexer noutro select. */}
              <CampoNumero
                label="Sem comprar há mais de (dias)"
                hint={
                  churnAnulado ? (
                    <span className="text-destructive">
                      O período da barra está em últimos {periodDays} dias, que só traz quem
                      comprou nesse intervalo — somado a este filtro, o resultado é sempre zero
                      clientes.{" "}
                      <button
                        type="button"
                        className="font-medium underline underline-offset-2"
                        onClick={onUseAllTime}
                      >
                        Mudar para “Todo período”
                      </button>
                    </span>
                  ) : (
                    "Quem sumiu, não quem voltou. Soma-se ao select “Período” da barra — não o substitui."
                  )
                }
                inputMode="numeric"
                placeholder="ex.: 60"
                value={draft.daysWithoutOrder}
                onChange={(v) => set("daysWithoutOrder", v)}
              />

              <CampoPeriodoDatas
                label="Período da última compra"
                from={draft.lastOrderFrom}
                to={draft.lastOrderTo}
                onChange={(from, to) =>
                  setDraft((p) => ({ ...p, lastOrderFrom: from, lastOrderTo: to }))
                }
              />

              <CampoPeriodoDatas
                label="Período da primeira compra"
                from={draft.firstOrderFrom}
                to={draft.firstOrderTo}
                onChange={(from, to) =>
                  setDraft((p) => ({ ...p, firstOrderFrom: from, firstOrderTo: to }))
                }
              />

              {/* Campo sozinho na linha, com o aviso como microtexto embaixo.
                  Antes ele dividia um grid 2x com uma célula de texto solto que
                  desalinhava a coluna inteira — o texto é dica do campo, não um
                  segundo campo. */}
              <CampoNumero
                label="Máximo de pedidos"
                hint="O mínimo continua no select da barra."
                inputMode="numeric"
                placeholder="ex.: 3"
                value={draft.ordersMax}
                onChange={(v) => set("ordersMax", v)}
              />

              <FaixaDinheiro
                label="Total gasto"
                degraus={DEGRAUS_GASTO}
                min={draft.totalSpentMin}
                max={draft.totalSpentMax}
                onCommit={(min, max) =>
                  setDraft((p) => ({ ...p, totalSpentMin: min, totalSpentMax: max }))
                }
              />

              <FaixaDinheiro
                label="Ticket médio"
                degraus={DEGRAUS_TICKET}
                min={draft.ticketMin}
                max={draft.ticketMax}
                onCommit={(min, max) =>
                  setDraft((p) => ({ ...p, ticketMin: min, ticketMax: max }))
                }
              />

              {/* Booleano no padrão da casa: Switch à direita, microtexto do
                  comportamento padrão embaixo do rótulo. */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-xs text-foreground">Comprou hoje</Label>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    Desligado por padrão. Pedido de hoje, no fuso de Brasília.
                  </p>
                </div>
                <Switch
                  className="mt-0.5 shrink-0"
                  checked={draft.boughtToday}
                  onCheckedChange={(c) => set("boughtToday", c === true)}
                />
              </div>

              <Campo
                label="Segunda compra"
                hint="Conta os pedidos já deduplicados — o mesmo número da coluna “Pedidos” da lista."
              >
                <Select
                  value={draft.hasSecondSale}
                  onValueChange={(v) => set("hasSecondSale", v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SECOND_SALE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>

              <Campo
                label="Status do último pedido"
                hint="O status do pedido mais recente do cliente (cancelados não contam — mesmo universo das outras métricas)."
              >
                {statusOptions.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">Nenhum disponível</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {statusOptions.map((o) => (
                      <Chip
                        key={o.value}
                        active={draft.lastOrderStatuses.includes(o.value)}
                        onClick={() => toggleText("lastOrderStatuses", o.value)}
                      >
                        {o.label}
                      </Chip>
                    ))}
                  </div>
                )}
              </Campo>
            </Secao>

            {/* 2 ------------------------------------------------------------ */}
            <Secao value="produtos" title={titulo("produtos")} count={counts.produtos}>
              <Campo
                label="Comprou o produto"
                hint={
                  lockedMarketplaceLabel
                    ? `Produtos vendidos em ${lockedMarketplaceLabel} no recorte, dos mais para os menos vendidos — o número ao lado é quantos clientes compraram. Marcar mais de um traz quem comprou qualquer um deles.`
                    : "Produtos deste seller, dos mais vendidos para os menos — o número ao lado é quantos clientes compraram. Marcar mais de um traz quem comprou qualquer um deles."
                }
              >
                <FacetSearchList
                  sellerId={sellerId}
                  kind="products"
                  selected={draft.productNames}
                  onChange={(next) => set("productNames", next)}
                  enabled={open}
                  placeholder="Buscar produto…"
                  emptyText={
                    lockedMarketplaceLabel
                      ? `Nenhum produto com esse nome nos pedidos de ${lockedMarketplaceLabel}.`
                      : "Nenhum produto com esse nome nos pedidos deste seller."
                  }
                  filters={facetFilters}
                />
              </Campo>

              <Campo
                label="Ou por trecho do nome"
                hint="Alternativa à lista acima, não um segundo requisito: com os dois preenchidos entra quem casar com qualquer um."
              >
                <div className="grid grid-cols-[minmax(0,7rem)_1fr] gap-2">
                  <Select
                    value={draft.productOperator}
                    onValueChange={(v) => set("productOperator", v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_OPERATORS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="h-9"
                    placeholder="ex.: tinta"
                    value={draft.productText}
                    onChange={(e) => set("productText", e.target.value)}
                  />
                </div>
              </Campo>

              <Campo
                label="Não comprou o produto"
                hint="Exclui o cliente inteiro, não só o pedido — quem já levou uma vez não aparece."
              >
                <Input
                  className="h-9"
                  placeholder="ex.: tinta"
                  value={draft.excludeProductText}
                  onChange={(e) => set("excludeProductText", e.target.value)}
                />
              </Campo>
            </Secao>

            {/* 3 ------------------------------------------------------------ */}
            <Secao value="demografia" title={titulo("demografia")} count={counts.demografia}>
              <Campo label="Gênero">
                <div className="flex flex-wrap gap-1.5">
                  {GENDER_OPTIONS.map((g) => (
                    <Chip
                      key={g.value}
                      active={draft.genders.includes(g.value)}
                      onClick={() => toggleText("genders", g.value)}
                    >
                      {g.label}
                    </Chip>
                  ))}
                </div>
              </Campo>

              <Campo label="Faixa etária">
                <div className="flex flex-wrap gap-1.5">
                  {AGE_BUCKET_OPTIONS.map((a) => (
                    <Chip
                      key={a.value}
                      active={draft.ageBuckets.includes(a.value)}
                      onClick={() => toggleText("ageBuckets", a.value)}
                    >
                      {a.label}
                    </Chip>
                  ))}
                </div>
              </Campo>

              <Campo label="Aniversário">
                <Select value={draft.birthday} onValueChange={(v) => set("birthday", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BIRTHDAY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>

              <Campo label="Tipo de documento">
                <div className="flex flex-wrap gap-1.5">
                  {DOCUMENT_TYPE_OPTIONS.map((d) => (
                    <Chip
                      key={d.value}
                      active={draft.documentTypes.includes(d.value)}
                      onClick={() => toggleText("documentTypes", d.value)}
                    >
                      {d.label}
                    </Chip>
                  ))}
                </div>
              </Campo>
            </Secao>

            {/* 4 ------------------------------------------------------------ */}
            <Secao value="frequencia" title={titulo("frequencia")} count={counts.frequencia}>
              <Campo
                label="Dia da semana"
                hint="Clientes com pelo menos um pedido no dia marcado."
              >
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_OPTIONS.map((w) => (
                    <Chip
                      key={w.value}
                      active={draft.weekdays.includes(w.value)}
                      onClick={() => toggleWeekday(w.value)}
                    >
                      {w.label}
                    </Chip>
                  ))}
                </div>
              </Campo>

              <Campo
                label="Turno do dia"
                hint={
                  <>
                    Horário de Brasília.
                    {/* Dia e turno caem sobre a MESMA linha de `orders`, não
                        sobre o cliente: "Seg" + "Manhã" devolve 17 clientes
                        neste seller, e não os 30 que têm um pedido em alguma
                        segunda E outro em alguma manhã. Lidas como condições
                        independentes, o resultado parece metade do que devia. */}
                    {draft.weekdays.length > 0 && draft.shifts.length > 0 && (
                      <>
                        {" "}
                        Dia e turno valem para o <strong>mesmo pedido</strong>: entram os
                        clientes que fizeram um pedido num dos dias marcados <em>e</em> num dos
                        turnos marcados, no mesmo pedido.
                      </>
                    )}
                  </>
                }
              >
                <div className="flex flex-wrap gap-1.5">
                  {SHIFT_OPTIONS.map((s) => (
                    <Chip
                      key={s.value}
                      active={draft.shifts.includes(s.value)}
                      onClick={() => toggleText("shifts", s.value)}
                      title={s.hint}
                    >
                      {s.label}
                      <span className="ml-1 opacity-60">{s.hint}</span>
                    </Chip>
                  ))}
                </div>
              </Campo>
            </Secao>

            {/* 5 ------------------------------------------------------------ */}
            <Secao value="localizacao" title={titulo("localizacao")} count={counts.localizacao}>
              {/* Os números destas facetas são do MESMO recorte da lista
                  (dentro da loja, só os clientes dela): um chip que promete
                  "187 clientes" e entrega 24 é pior do que chip nenhum. */}
              {/* Região ACIMA da UF: é o recorte largo, a UF refina. Marcar uma
                  região NÃO mexe nas UFs marcadas — os dois descem separados
                  e o banco faz a união (Sul + SP = PR/SC/RS ou SP). */}
              <Campo
                label="Região"
                hint="Mesma régua da aba Regiões; combina com a UF (Sul + SP = Sul ou SP)."
              >
                <RegiaoFacetChips
                  sellerId={sellerId}
                  selected={draft.regions}
                  onChange={(next) => set("regions", next)}
                  enabled={open}
                  filters={facetFilters}
                />
              </Campo>

              <Campo label="Estado (UF)">
                <FacetChips
                  sellerId={sellerId}
                  kind="states"
                  selected={draft.states}
                  onChange={(next) => set("states", next)}
                  enabled={open}
                  emptyText={
                    lockedMarketplaceLabel
                      ? `Nenhum cliente de ${lockedMarketplaceLabel} tem UF cadastrada.`
                      : "Nenhum cliente deste seller tem UF cadastrada."
                  }
                  filters={facetFilters}
                />
              </Campo>

              <Campo label="Cidade">
                <FacetSearchList
                  sellerId={sellerId}
                  kind="cities"
                  selected={draft.cities}
                  onChange={(next) => set("cities", next)}
                  enabled={open}
                  placeholder="Buscar cidade…"
                  emptyText="Nenhuma cidade com esse nome."
                  filters={facetFilters}
                />
              </Campo>

              {lockedMarketplaceLabel ? (
                <Campo
                  label="Loja / canal de venda"
                  hint="Para comparar com outras lojas, use a aba Clientes do menu principal."
                >
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2.5">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 text-xs leading-snug text-foreground">
                      <strong>{lockedMarketplaceLabel}</strong>
                      <span className="text-muted-foreground"> — fixa nesta tela.</span>
                    </p>
                  </div>
                </Campo>
              ) : (
                <Campo
                  label="Loja / canal de venda"
                  // Não existem filiais nesta base e `orders.store_id` é nulo em
                  // todos os pedidos: a loja, na prática, é o marketplace.
                  hint="É o canal de onde veio o pedido — o número é quantos clientes compraram por ele."
                >
                  <FacetChips
                    sellerId={sellerId}
                    kind="marketplaces"
                    selected={draft.marketplaces}
                    onChange={(next) => set("marketplaces", next)}
                    enabled={open}
                    formatLabel={(o) => formatMarketplaceName(o.label)}
                    emptyText="Nenhum pedido com canal identificado."
                  />
                </Campo>
              )}

              <Campo
                label="CEP começa com"
                hint="Um ou mais prefixos separados por vírgula — ex.: 01, 30140."
              >
                <Input
                  className="h-9"
                  inputMode="numeric"
                  placeholder="ex.: 01, 30140"
                  value={draft.zipPrefixes}
                  onChange={(e) => set("zipPrefixes", e.target.value)}
                />
              </Campo>
            </Secao>

            {/* 6 ------------------------------------------------------------ */}
            <Secao value="comunicacao" title={titulo("comunicacao")} count={counts.comunicacao}>
              <Campo label="Conversa">
                <Select
                  value={draft.conversation}
                  onValueChange={(v) => set("conversation", v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONVERSATION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>

              <Campo
                label="Opt-out de WhatsApp"
                hint={
                  <>
                    Vale o descadastro deste seller e também o global do cliente.
                    {/* Não inventar filtro sem dado: whatsapp está preenchido em
                        100% da base e o histórico de disparo tem 3 linhas no
                        total. O aviso virou microtexto do campo (padrão da
                        casa), colado no filtro de que ele fala. */}
                    {" "}Filtro por “WhatsApp inválido” e por histórico de disparo ainda não
                    existe aqui — não há dado que os sustente.
                  </>
                }
              >
                <Select value={draft.optOut} onValueChange={(v) => set("optOut", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPTOUT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>
            </Secao>

            {/* 7 ------------------------------------------------------------ */}
            {!esconderCrm && (
              <Secao value="crm" title={titulo("crm")} count={counts.crm}>
                {stagesLoading ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Carregando as fases…
                  </p>
                ) : stagesError ? (
                  <p className="text-xs text-destructive">
                    Não foi possível carregar as fases do funil.
                  </p>
                ) : stages.length <= 8 ? (
                  // Vocabulário 1 da casa: lista curta vira chips facetados —
                  // um funil tem meia dúzia de fases, checkbox em coluna era um
                  // terceiro dialeto no mesmo painel.
                  <Campo label="Fase do funil">
                    <div className="flex flex-wrap gap-1.5">
                      {stages.map((s) => {
                        const condicional = isConditionalStage(s);
                        return (
                          <Chip
                            key={s.id}
                            active={draft.stageIds.includes(s.id)}
                            onClick={() => toggleText("stageIds", s.id)}
                            title={
                              condicional
                                ? "Fase por regra: o quadro monta a coluna pela condição, não pelo vínculo gravado. O filtro usa o vínculo."
                                : undefined
                            }
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="size-2 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: s.color || "hsl(var(--muted-foreground))",
                                }}
                              />
                              {s.name}
                              {condicional && <Info className="h-3 w-3 shrink-0" />}
                            </span>
                          </Chip>
                        );
                      })}
                      <Chip
                        active={draft.stageNone}
                        onClick={() => set("stageNone", !draft.stageNone)}
                      >
                        Sem fase
                      </Chip>
                    </div>
                  </Campo>
                ) : (
                  // Vocabulário 2: lista longa vira busca + checkbox. A peneira
                  // é local (as fases já estão na memória) — só a superfície
                  // segue o padrão das facetas grandes.
                  <ListaFunilBusca
                    stages={stages}
                    selectedIds={draft.stageIds}
                    onToggle={(id) => toggleText("stageIds", id)}
                    stageNone={draft.stageNone}
                    onStageNone={(v) => set("stageNone", v)}
                  />
                )}

                {temFaseCondicional && (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    As fases marcadas com o ícone montam a coluna por regra. Aqui o filtro usa o
                    vínculo gravado, que pode não ser o que o quadro mostra.
                  </p>
                )}
              </Secao>
            )}

            {/* 8 ------------------------------------------------------------ */}
            <Secao value="rfv" title={titulo("rfv")} count={counts.rfv}>
              {rfvLoading ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando os segmentos…
                </p>
              ) : (
                segmentosVisiveis.length === 0 && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    A Análise RFV ainda não está liberada para este seller — falta histórico ou
                    clientes recorrentes.
                  </p>
                )
              )}

              {/* Vocabulário 1 da casa, o MESMO do funil no grupo acima: lista
                  curta (são 11 segmentos fixos) vira chips facetados, com a
                  bolinha da cor do segmento e o número de clientes ao lado. No
                  formato antigo eram checkboxes empilhadas — um terceiro
                  dialeto dentro do mesmo painel depois da unificação dos três
                  sheets (28/08/2026).

                  A fileira aparece SEMPRE, mesmo com a análise travada: sozinho,
                  o "Sem classificação" ainda é um filtro que o usuário pode ter
                  ligado (pela URL ou antes de o gate fechar), e sem o chip não
                  haveria como desligá-lo daqui. */}
              <Campo label="Segmento">
                <div className="flex flex-wrap gap-1.5">
                  {segmentosVisiveis.map((seg) => (
                    <Chip
                      key={seg.name}
                      active={draft.rfvSegments.includes(seg.name)}
                      onClick={() => toggleText("rfvSegments", seg.name)}
                      // Mesma unidade dos chips de faceta: o número é CLIENTES.
                      title={
                        seg.clients !== null
                          ? `${seg.clients.toLocaleString("pt-BR")} clientes`
                          : "Veio pelo link: a análise deste seller não listou este segmento."
                      }
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: seg.color }}
                        />
                        {seg.name}
                        {seg.clients !== null && (
                          <span className="tabular-nums opacity-60">
                            {seg.clients.toLocaleString("pt-BR")}
                          </span>
                        )}
                      </span>
                    </Chip>
                  ))}
                  <Chip
                    active={draft.rfvNone}
                    onClick={() => set("rfvNone", !draft.rfvNone)}
                    title="Cliente sem linha em client_rfv — entrou depois do último cálculo ou não pontua na matriz."
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
                      Sem classificação
                    </span>
                  </Chip>
                </div>
              </Campo>
            </Secao>
          </Accordion>
        </div>

    </FiltrosSheetShell>
  );
}

/** Busca + checkbox para funil com mais de 8 fases — peneira 100% local. */
function ListaFunilBusca({
  stages,
  selectedIds,
  onToggle,
  stageNone,
  onStageNone,
}: {
  stages: { id: string; name: string; color?: string | null; stage_type?: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  stageNone: boolean;
  onStageNone: (v: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visiveis = q ? stages.filter((s) => s.name.toLowerCase().includes(q)) : stages;

  return (
    <Campo label="Fase do funil">
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar fase…"
            className="h-9 pl-8"
          />
        </div>
        <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1">
          {visiveis.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nenhuma fase com esse nome.
            </p>
          )}
          {visiveis.map((s) => {
            const condicional = isConditionalStage(s);
            return (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                title={
                  condicional
                    ? "Fase por regra: o quadro monta a coluna pela condição, não pelo vínculo gravado. O filtro usa o vínculo."
                    : undefined
                }
              >
                <Checkbox
                  checked={selectedIds.includes(s.id)}
                  onCheckedChange={() => onToggle(s.id)}
                />
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color || "hsl(var(--muted-foreground))" }}
                />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{s.name}</span>
                {condicional && <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </label>
            );
          })}
          {/* "Sem fase" fora da peneira de busca: é uma opção fixa do filtro,
              não uma fase que possa "não casar" com o texto digitado. */}
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
            <Checkbox checked={stageNone} onCheckedChange={(c) => onStageNone(c === true)} />
            <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
            <span className="min-w-0 flex-1 text-xs text-foreground">Sem fase</span>
          </label>
        </div>
      </div>
    </Campo>
  );
}

export default ClientesMoreFiltersSheet;
