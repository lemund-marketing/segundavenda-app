import { useEffect, useMemo, useRef, useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarRange, ChevronDown, Loader2, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FiltrosSheetShell } from "@/components/filtros/FiltrosSheetShell";
import { Switch } from "@/components/ui/switch";
import { RFV_COLORS, useRfvFilterOptions, useRfvSummary } from "@/hooks/useRfv";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/formatters";

import {
  KANBAN_RECENCY,
  countActiveKanbanFilters,
  makeEmptyKanbanFilters,
  type KanbanAdvancedFilters,
} from "./kanbanFilters";

/** Topo do slider de pedidos = "sem teto" (vira maxOrders vazio).
 *  10, não 20: p95 da base é 2 pedidos e p99 é 3 (medido em client_metrics,
 *  1,64M linhas) — com 20 passos, 95% dos clientes viviam nos 2 primeiros. */
const ORDERS_CAP = 10;
/** Degraus do gasto, finos embaixo e largos em cima — mesmo desenho do sheet
 *  de Clientes e pelo mesmo motivo medido: p50 do total_spent é R$ 69, p95 é
 *  R$ 848; num slider LINEAR 0–10k, 96% da base morava nos primeiros 10% do
 *  trilho e nenhum corte abaixo de R$ 100 era expressável. Último degrau =
 *  sentinela "sem teto" (maxSpent vazio). */
const DEGRAUS_GASTO_KANBAN = [
  0, 50, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000,
] as const;
const SPENT_TOP = DEGRAUS_GASTO_KANBAN.length - 1;
/** Índice do degrau mais próximo de um valor vindo do rascunho/URL. */
const indiceDoDegrau = (valor: number): number => {
  let melhor = 0;
  for (let i = 0; i < DEGRAUS_GASTO_KANBAN.length; i++) {
    if (Math.abs(DEGRAUS_GASTO_KANBAN[i] - valor) < Math.abs(DEGRAUS_GASTO_KANBAN[melhor] - valor)) melhor = i;
  }
  return melhor;
};

interface KanbanMoreFiltersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: KanbanAdvancedFilters;
  onApply: (next: KanbanAdvancedFilters) => void;
  /** Dono das opções de RFV (nomes, cores e quantos clientes há em cada
   *  segmento hoje) — `rfv_summary` é por seller. */
  sellerId: string;
  states: string[];
  /** Sobrescreve o texto do cabeçalho — a instância por coluna precisa deixar
   *  claro que o filtro não vale para o quadro inteiro. */
  titulo?: string;
  descricao?: string;
}

/**
 * Slider de DOIS polegares — mesma cópia local do PedidosFiltersSheet, pelo
 * mesmo motivo: `@/components/ui/slider` renderiza um `<Thumb>` fixo, então com
 * `value=[min, max]` o Radix só liga o primeiro e o teto da faixa nunca chega à
 * consulta. Aqui os polegares saem do próprio `value`.
 */
function RangeSlider({
  min,
  max,
  step,
  value,
  onValueChange,
}: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onValueChange: (v: number[]) => void;
}) {
  return (
    <SliderPrimitive.Root
      className="relative flex w-full touch-none select-none items-center"
      min={min}
      max={max}
      step={step}
      minStepsBetweenThumbs={1}
      value={value}
      onValueChange={onValueChange}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {value.map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={i === 0 ? "Valor mínimo" : "Valor máximo"}
          className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

const CONTAGEM_CLASS =
  "min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center tabular-nums normal-case";

/**
 * Grupo do padrão (PedidosFiltersSheet) + os dois upgrades do Omnichannel:
 * badge com a contagem do que está ligado dentro do grupo e abertura automática
 * quando há filtro ativo — senão o usuário abre o sheet e vê grupos fechados
 * sem pista de onde está o filtro ligado. `defaultOpen` funciona porque o
 * conteúdo do Sheet desmonta ao fechar, então isso recalcula a cada abertura.
 */
function Group({
  title,
  count = 0,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b border-border pb-1">
      {/* py-5 (era py-3/3.5): com os títulos colados o painel virava uma pilha
          de linhas indistinguíveis, e num sheet de 8 grupos fechados o olho não
          achava onde começava cada um. Pedido de 29/08. */}
      <CollapsibleTrigger className="w-full flex items-center justify-between py-5 text-left">
        <span className="text-[13px] font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
          {title}
          {count > 0 && <span className={CONTAGEM_CLASS}>{count}</span>}
        </span>
        <ChevronDown
          className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-1 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Preset "1ª compra vs recorrente" DERIVADO de minOrders/maxOrders — não é um
 * campo novo do contrato. Escolher no select só preenche a faixa de pedidos
 * (1ª compra = máx. 1; recorrente = mín. 2), então preset e slider nunca podem
 * discordar nem contar como dois filtros.
 */
function presetDePedidos(f: KanbanAdvancedFilters): "all" | "first" | "recurrent" | "custom" {
  const min = f.minOrders.trim();
  const max = f.maxOrders.trim();
  if (!min && !max) return "all";
  if (!min && max === "1") return "first";
  if (min === "2" && !max) return "recurrent";
  return "custom";
}

/**
 * Versão enxuta e honesta do sheet do Segundo Pedido: lá são 969 linhas e ~26
 * filtros, dos quais 10 contam no badge e não filtram nada no Kanban. Aqui todo
 * campo tem parâmetro correspondente em get_pipeline_stage_clients.
 *
 * "Última compra" só tem o lado "De" DE PROPÓSITO: a RPC expõe apenas
 * `_last_order_from` (sem "_last_order_to"), e `_period_start`/`_period_end`
 * não servem de substituto — filtram a data de ENTRADA NA FASE e já são
 * ocupados pelo período do quadro e pelo calendário da própria coluna.
 */
export function KanbanMoreFiltersSheet({
  open,
  onOpenChange,
  value,
  onApply,
  sellerId,
  states,
  titulo,
  descricao,
}: KanbanMoreFiltersSheetProps) {
  const [draft, setDraft] = useState<KanbanAdvancedFilters>(value);

  // O sheet é um rascunho: só "Aplicar" empurra para o quadro.
  //
  // Sincroniza só na ABERTURA. Antes a dependência era a identidade de `value`,
  // e quem passasse um objeto novo a cada render (o caso do filtro por coluna,
  // cujo padrão é um objeto vazio criado no JSX) apagava o que o usuário estava
  // digitando a cada re-render do pai — inclusive por um refetch do realtime.
  const estavaAberto = useRef(false);
  useEffect(() => {
    if (open && !estavaAberto.current) setDraft(value);
    estavaAberto.current = open;
  }, [open, value]);

  const set = <K extends keyof KanbanAdvancedFilters>(k: K, v: KanbanAdvancedFilters[K]) =>
    setDraft((p) => ({ ...p, [k]: v }));

  const toggleSegmento = (nome: string) =>
    setDraft((p) => ({
      ...p,
      rfvSegments: p.rfvSegments.includes(nome)
        ? p.rfvSegments.filter((s) => s !== nome)
        : [...p.rfvSegments, nome],
    }));

  const count = countActiveKanbanFilters(draft);

  // ---- Segmento RFV --------------------------------------------------------
  // Os 11 segmentos com a contagem de clientes de cada um; devolve [] enquanto o
  // seller não passa no gate de histórico (useRfvFilterOptions).
  //
  // Só consulta com o sheet ABERTO (`open ? sellerId : null` desliga a query).
  // Em 07/08/2026, quando este filtro saiu, existia UMA instância do sheet por
  // quadro; hoje o KanbanColumn monta mais uma por coluna, todas montadas o
  // tempo todo — o rfv_summary é RPC pesada e dispararia no carregamento do
  // quadro para quem nunca abre "Mais filtros". A queryKey é a mesma da tela
  // /rfv e das outras colunas, então a consulta é uma só e, com staleTime de
  // 5 min, reabrir o sheet não refaz a conta.
  const rfvOptions = useRfvFilterOptions(open ? sellerId : null);
  const { isLoading: rfvCarregando } = useRfvSummary(open ? sellerId : null);

  // Os segmentos vindos do resumo MAIS os que já estão marcados no rascunho e
  // não vieram nele. Sem isso, um filtro aplicado antes (o quadro e cada coluna
  // guardam o seu) ficaria contando no badge sem caixinha para desmarcar se a
  // consulta falhasse ou o gate fechasse — filtro preso, só o "Limpar" resolvia.
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

  // ---- Última compra (preset OU data exata, nunca os dois) -----------------
  const dataUltimaCompra = draft.lastOrderFrom ? new Date(draft.lastOrderFrom) : undefined;
  const escolherDataUltimaCompra = (d?: Date) => {
    if (!d) {
      set("lastOrderFrom", "");
      return;
    }
    // Início do dia: além de ser o que o usuário quer dizer com "desde 12/08",
    // mantém o valor estável para a queryKey (ver advancedFiltersToRpcArgs).
    const inicio = new Date(d);
    inicio.setHours(0, 0, 0, 0);
    setDraft((p) => ({ ...p, lastOrderFrom: inicio.toISOString(), recencyDays: "all" }));
  };

  // ---- Faixas numéricas (slider ↔ strings do contrato) ---------------------
  // Os campos do contrato seguem sendo strings (minOrders etc.); o slider é só
  // a cara nova. Valor digitado antigamente acima do teto continua valendo no
  // filtro até o polegar ser mexido — o slider não sobrescreve sozinho.
  const ordersRange: [number, number] = [
    Math.min(Math.max(parseInt(draft.minOrders, 10) || 0, 0), ORDERS_CAP),
    draft.maxOrders.trim() === ""
      ? ORDERS_CAP
      : Math.min(Math.max(parseInt(draft.maxOrders, 10) || 0, 0), ORDERS_CAP),
  ];
  const setOrdersRange = (v: number[]) =>
    setDraft((p) => {
      // Só o lado que o usuário arrastou muda; o outro fica com o valor
      // original (que pode estar fora do trilho, vindo de sessão antiga).
      const novoMin = v[0] !== ordersRange[0] ? (v[0] > 0 ? String(v[0]) : "") : p.minOrders;
      const novoMax = v[1] !== ordersRange[1] ? (v[1] >= ORDERS_CAP ? "" : String(v[1])) : p.maxOrders;
      return { ...p, minOrders: novoMin, maxOrders: novoMax };
    });
  const faixaPedidos =
    ordersRange[0] === 0 && ordersRange[1] >= ORDERS_CAP
      ? "Qualquer quantidade"
      : ordersRange[1] >= ORDERS_CAP
        ? `${ordersRange[0]} ou mais`
        : `${ordersRange[0]} – ${ordersRange[1]}`;

  // O slider anda sobre ÍNDICES dos degraus. O commit escreve SÓ o lado cujo
  // índice mudou: arrastar um polegar não pode reescrever a outra ponta para o
  // degrau mais próximo (um "120" vindo de sessão antiga viraria "100" sem o
  // usuário ter tocado naquele lado).
  const spentIdx: [number, number] = [
    indiceDoDegrau(Math.max(Math.round(Number(draft.minSpent.replace(",", ".")) || 0), 0)),
    draft.maxSpent.trim() === ""
      ? SPENT_TOP
      : indiceDoDegrau(Math.max(Math.round(Number(draft.maxSpent.replace(",", ".")) || 0), 0)),
  ];
  const setSpentRange = (v: number[]) =>
    setDraft((p) => {
      const novoMin = v[0] !== spentIdx[0]
        ? (v[0] > 0 ? String(DEGRAUS_GASTO_KANBAN[v[0]]) : "")
        : p.minSpent;
      const novoMax = v[1] !== spentIdx[1]
        ? (v[1] >= SPENT_TOP ? "" : String(DEGRAUS_GASTO_KANBAN[v[1]]))
        : p.maxSpent;
      return { ...p, minSpent: novoMin, maxSpent: novoMax };
    });
  // Rótulo honesto: mostra o valor REAL do rascunho, não o degrau encostado.
  const gastoMinReal = Math.max(Math.round(Number(draft.minSpent.replace(",", ".")) || 0), 0);
  const gastoMaxReal = draft.maxSpent.trim() === "" ? null
    : Math.max(Math.round(Number(draft.maxSpent.replace(",", ".")) || 0), 0);
  const faixaGasto =
    gastoMinReal === 0 && gastoMaxReal === null
      ? "Qualquer valor"
      : gastoMaxReal === null
        ? `${formatCurrency(gastoMinReal)} ou mais`
        : `${formatCurrency(gastoMinReal)} – ${formatCurrency(gastoMaxReal)}`;

  const preset = presetDePedidos(draft);
  const escolherPreset = (v: string) => {
    if (v === "first") setDraft((p) => ({ ...p, minOrders: "", maxOrders: "1" }));
    else if (v === "recurrent") setDraft((p) => ({ ...p, minOrders: "2", maxOrders: "" }));
    else if (v === "all") setDraft((p) => ({ ...p, minOrders: "", maxOrders: "" }));
  };

  // ---- Badges por grupo e auto-expansão ------------------------------------
  // Auto-expansão sai do APLICADO (`value`): é o filtro que já vale no quadro
  // que o usuário veio procurar. Os badges saem do RASCUNHO, acompanhando o
  // "Aplicar (N)" enquanto ele mexe.
  const nUltima = draft.recencyDays !== "all" || draft.lastOrderFrom ? 1 : 0;
  const nPedidos =
    (draft.minOrders.trim() || draft.maxOrders.trim() ? 1 : 0) +
    (draft.minSpent.trim() || draft.maxSpent.trim() ? 1 : 0);
  const nDemografia = (draft.birthdayMonth ? 1 : 0) + (draft.gender !== "all" ? 1 : 0);
  const nLocalizacao = (draft.stateCode !== "all" ? 1 : 0) + (draft.city.trim() ? 1 : 0);
  // 1 para o conjunto, não o número de segmentos marcados: é um corte só na RPC
  // e é assim que countActiveKanbanFilters conta — os badges dos grupos têm de
  // somar o "Aplicar (N)". Quantos estão marcados o próprio grupo mostra.
  const nRfv = draft.rfvSegments.length > 0 ? 1 : 0;

  const abreUltima = true; // primeiro grupo sempre aberto (padrão)
  const abrePedidos = !!(
    value.minOrders.trim() ||
    value.maxOrders.trim() ||
    value.minSpent.trim() ||
    value.maxSpent.trim()
  );
  const abreDemografia = value.birthdayMonth || value.gender !== "all";
  const abreLocalizacao = value.stateCode !== "all" || !!value.city.trim();
  const abreRfv = value.rfvSegments.length > 0;

  return (
    <FiltrosSheetShell
      open={open}
      onOpenChange={onOpenChange}
      title={titulo ?? "Mais filtros"}
      subtitle={
        descricao ??
        "Filtram as colunas do quadro. Os KPIs no topo seguem sendo do funil inteiro."
      }
      icon={SlidersHorizontal}
      // Mesma soma que rotula o "Aplicar (N)" — padrão do sheet de Clientes.
      count={count}
      footer={
        /* A MECÂNICA de rascunho fica: cada mudança aplicada dispara as
           consultas das colunas, então nada sobe antes do "Aplicar" (ver o
           comentário do sync na abertura, lá em cima). */
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => {
              // Limpar APLICA: zera o rascunho e já empurra o quadro vazio de
              // filtros — só limpar o rascunho deixava os chips ativos no board.
              // O sheet fica aberto, como em Clientes: o usuário vê o painel
              // esvaziar e o quadro atrás soltar.
              const vazio = makeEmptyKanbanFilters();
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
            Aplicar{count > 0 ? ` (${count})` : ""}
          </Button>
        </div>
      }
    >
        <div className="-mx-6 px-6">
          <Group title="Última compra" count={nUltima} defaultOpen={abreUltima}>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Recência</Label>
              <Select
                value={draft.recencyDays}
                onValueChange={(v) =>
                  // Preset e data exata alimentam o mesmo _last_order_from:
                  // escolher um zera o outro para não haver dois cortes
                  // invisíveis se atropelando.
                  setDraft((p) => ({ ...p, recencyDays: v, lastOrderFrom: "" }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KANBAN_RECENCY.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Ou a partir de uma data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "h-9 w-full justify-start text-left font-normal",
                      !dataUltimaCompra && "text-muted-foreground",
                    )}
                  >
                    <CalendarRange className="mr-2 h-4 w-4 shrink-0" />
                    {dataUltimaCompra
                      ? `Comprou desde ${format(dataUltimaCompra, "dd/MM/yyyy", { locale: ptBR })}`
                      : "Comprou desde…"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dataUltimaCompra}
                    onSelect={escolherDataUltimaCompra}
                    disabled={(d) => d > new Date()}
                    initialFocus
                    locale={ptBR}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {dataUltimaCompra && (
                <button
                  type="button"
                  onClick={() => set("lastOrderFrom", "")}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Limpar data
                </button>
              )}
              {/* Não existe "até": a RPC deste quadro só filtra o começo da
                  janela (_last_order_from). Melhor dizer isso do que exibir um
                  campo que não filtra nada. */}
              <p className="text-[11px] text-muted-foreground">
                Só o começo da janela: "comprou de tal dia em diante".
              </p>
            </div>
          </Group>

          <Group title="Pedidos e gasto" count={nPedidos} defaultOpen={abrePedidos}>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Tipo de cliente</Label>
              <Select value={preset} onValueChange={escolherPreset}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tanto faz</SelectItem>
                  <SelectItem value="first">Só 1ª compra (até 1 pedido)</SelectItem>
                  <SelectItem value="recurrent">Só recorrente (2+ pedidos)</SelectItem>
                  {/* Estado derivado da faixa abaixo — aparece quando o slider
                      não casa com nenhum preset, para o select não mentir. */}
                  {preset === "custom" && (
                    <SelectItem value="custom" disabled>
                      Faixa personalizada
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">Nº de pedidos</Label>
                <span className="text-xs font-medium text-foreground tabular-nums">
                  {faixaPedidos}
                </span>
              </div>
              <RangeSlider
                min={0}
                max={ORDERS_CAP}
                step={1}
                value={ordersRange}
                onValueChange={setOrdersRange}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">Total gasto</Label>
                <span className="text-xs font-medium text-foreground tabular-nums">
                  {faixaGasto}
                </span>
              </div>
              <RangeSlider
                min={0}
                max={SPENT_TOP}
                step={1}
                value={spentIdx}
                onValueChange={setSpentRange}
              />
            </div>
          </Group>

          <Group title="Demografia" count={nDemografia} defaultOpen={abreDemografia}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-xs text-foreground">Aniversariantes do mês</Label>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Desligado por padrão. Usa o mês de Brasília, igual ao bolo do card.
                </p>
              </div>
              <Switch
                checked={draft.birthdayMonth}
                onCheckedChange={(v) => set("birthdayMonth", v)}
                className="mt-0.5 shrink-0"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Gênero</Label>
              <Select value={draft.gender} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="male">Masculino</SelectItem>
                  <SelectItem value="female">Feminino</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Group>

          <Group title="Localização" count={nLocalizacao} defaultOpen={abreLocalizacao}>
            {/* Sem UFs carregadas o select seria uma lista vazia — some, e a
                cidade (texto livre) continua servindo. */}
            {states.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Estado (UF)</Label>
                <Select value={draft.stateCode} onValueChange={(v) => set("stateCode", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">Todos</SelectItem>
                    {states.map((uf) => (
                      <SelectItem key={uf} value={uf}>
                        {uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Cidade</Label>
              <Input
                className="h-9"
                value={draft.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="Nome exato da cidade"
              />
            </div>
          </Group>

          {/* Último grupo, como era antes de 07/08/2026: é o recorte mais
              específico do sheet e o único que depende de dado calculado
              (client_rfv), então não pode empurrar os campos do dia a dia para
              baixo da dobra. */}
          <Group title="Segmento RFV" count={nRfv} defaultOpen={abreRfv}>
            {rfvCarregando && segmentosVisiveis.length === 0 && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando os segmentos…
              </p>
            )}

            {/* "Ainda não perguntei" e "não tem" são coisas diferentes: o texto
                do gate só aparece depois que o resumo respondeu. */}
            {!rfvCarregando && segmentosVisiveis.length === 0 && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                A Análise RFV ainda não está liberada para este seller — falta histórico ou
                clientes recorrentes.
              </p>
            )}

            {segmentosVisiveis.length > 0 && (
              <div className="space-y-1.5">
                {segmentosVisiveis.map((seg) => (
                  <label
                    key={seg.name}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted"
                  >
                    <Checkbox
                      checked={draft.rfvSegments.includes(seg.name)}
                      onCheckedChange={() => toggleSegmento(seg.name)}
                    />
                    {/* A bolinha usa a MESMA cor de rfv_segment_meta que o selo
                        do cartão e a tela /rfv — é por ela que o usuário liga o
                        que marcou aqui com o que vê no quadro. */}
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="flex-1 truncate text-sm text-foreground">{seg.name}</span>
                    {/* Sem contagem quando o segmento veio só do rascunho: aí o
                        número seria chute, não o que o resumo respondeu. */}
                    {seg.clients !== null && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {seg.clients.toLocaleString("pt-BR")}
                      </span>
                    )}
                  </label>
                ))}
                {/* Vários marcados = OU entre eles (a RPC faz `segment = any`),
                    e não a interseção — dizer isso evita a leitura de que marcar
                    dois estreita o resultado. */}
                <p className="pt-1 text-[11px] leading-snug text-muted-foreground">
                  {draft.rfvSegments.length > 1
                    ? `${draft.rfvSegments.length} segmentos marcados: o cliente entra se estiver em qualquer um deles.`
                    : "Marque mais de um para somar os segmentos."}
                </p>
              </div>
            )}
          </Group>
        </div>

    </FiltrosSheetShell>
  );
}
