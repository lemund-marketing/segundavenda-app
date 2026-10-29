import { useEffect, useRef, useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { FiltrosSheetShell } from "@/components/filtros/FiltrosSheetShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, Download, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/formatters";
import { noSite } from "@/app/site"; // app: a exportação abre no site (ver o rodapé)
import { Input } from "@/components/ui/input";
import { UF_LIST } from "@/lib/ufs";
import { useClientesFacet } from "@/hooks/useClientesFacets";
import { statusLabel } from "./statusPedido";

/** 1000 é o topo do slider e significa "sem teto" — acima disso não há corte. */
export const MAX_VALUE_CAP = 1000;

export interface AdvancedFilters {
  /** is_second_sale: "second" = recompra, "first" = primeira compra */
  type: "all" | "first" | "second";
  /** order_status cru ("all" = todos) */
  status: string;
  minValue: number;
  maxValue: number;
  whatsappContacted: "all" | "yes" | "no";
  /**
   * Cancelados/reembolsados ficam FORA por padrão — os KPIs e o gráfico desta
   * tela também os excluem, e a lista discordar do card é bug visível.
   */
  includeCancelled: boolean;

  /* Dimensões de PERFIL do cliente (Etapa 2). A lista usa as colunas
     computadas genero_norm/cep_limpo e as RPCs usam as MESMAS funções —
     é isso que garante card e tabela contando igual. */
  /** UFs (multi). Vence o select de UF da barra quando não-vazio — quem
      aplica aqui zera a barra, e vice-versa (uma verdade só na tela). */
  states: string[];
  /** grafia exata do banco — opções vêm da faceta de cidades */
  cities: string[];
  /** "all" | "cpf" | "cnpj" */
  documentType: string;
  /** "male" | "female" | "unknown" */
  genders: string[];
  /** prefixo de CEP (dígitos; hífen é ignorado) */
  cepPrefix: string;
  productText: string;
  /** "contains" | "not-contains" | "starts-with" | "ends-with" | "exact" */
  productOperator: string;
}

export const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = {
  type: "all",
  status: "all",
  minValue: 0,
  maxValue: MAX_VALUE_CAP,
  whatsappContacted: "all",
  includeCancelled: false,
  states: [],
  cities: [],
  documentType: "all",
  genders: [],
  cepPrefix: "",
  productText: "",
  productOperator: "contains",
};

export function countActiveAdvanced(f: AdvancedFilters): number {
  let n = 0;
  if (f.type !== "all") n++;
  if (f.status !== "all") n++;
  if (f.minValue > 0 || f.maxValue < MAX_VALUE_CAP) n++;
  if (f.whatsappContacted !== "all") n++;
  if (f.includeCancelled) n++;
  if (f.states.length > 0) n++;
  if (f.cities.length > 0) n++;
  if (f.documentType !== "all") n++;
  if (f.genders.length > 0) n++;
  if (f.cepPrefix.replace(/\D/g, "")) n++;
  if (f.productText.trim()) n++;
  return n;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: AdvancedFilters;
  onChange: (next: AdvancedFilters) => void;
  /** valores crus de order_status presentes no período; vazio esconde o grupo */
  statusOptions: string[];
  /** para as opções de cidade (faceta do seller inteiro) */
  sellerId: string | null;
}

/**
 * Slider de DOIS polegares.
 *
 * `@/components/ui/slider` renderiza um `<Thumb>` fixo: com `value=[min, max]`
 * o Radix só liga o primeiro, e o topo da faixa ficava preso em R$ 1.000 —
 * `maxAmount` nunca chegava à consulta. Aqui os polegares saem do próprio
 * `value`, então a faixa funciona nas duas pontas. O visual é o mesmo do
 * componente compartilhado, que segue intocado para os sliders de valor único.
 */
function RangeSlider({
  min,
  max,
  step,
  value,
  onValueChange,
  onValueCommit,
}: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onValueChange: (v: number[]) => void;
  onValueCommit: (v: number[]) => void;
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
      onValueCommit={onValueCommit}
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

/** Chip de alternância — mesmo desenho do sheet de Clientes. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Busca + lista de cidades da faceta do seller — SEM contagem: a faceta conta
 * CLIENTES e esta tela conta PEDIDOS; mostrar "187" aqui prometeria o número
 * errado. As opções vêm com a grafia exata do banco (o filtro casa por
 * igualdade, como nas RPCs).
 */
function CidadeBusca({
  sellerId,
  selected,
  onChange,
  enabled,
}: {
  sellerId: string | null;
  selected: string[];
  onChange: (next: string[]) => void;
  enabled: boolean;
}) {
  const [busca, setBusca] = useState("");
  // 300ms, como as sugestões da barra de Pedidos: sem isto cada TECLA virava
  // um get_clientes_facetas novo (o termo entra na queryKey, então não há
  // cache que segure), e a RPC varre os clientes do seller inteiro.
  const [buscaDebounced, setBuscaDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);
  const { data: opcoes = [], isLoading } = useClientesFacet(
    sellerId,
    "cities",
    buscaDebounced,
    enabled,
  );
  const toggle = (cidade: string) =>
    onChange(selected.includes(cidade) ? selected.filter((c) => c !== cidade) : [...selected, cidade]);

  return (
    <div className="space-y-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <Chip key={c} active onClick={() => toggle(c)}>
              {c} ×
            </Chip>
          ))}
        </div>
      )}
      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar cidade…"
        className="h-9"
      />
      <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
        {opcoes.length === 0 ? (
          <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
            {isLoading ? "Carregando…" : "Nenhuma cidade encontrada."}
          </p>
        ) : (
          opcoes.slice(0, 60).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={cn(
                "flex w-full items-center rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                selected.includes(o.value) && "bg-primary/10 font-medium text-primary",
              )}
            >
              {o.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Texto que só APLICA no blur/Enter: aplicar a cada tecla refaria contagem,
 * lista, KPIs e gráfico por caractere (mesmo motivo do slider com commit).
 */
function CampoTextoCommit({
  value,
  onCommit,
  placeholder,
  inputMode,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric";
}) {
  const [texto, setTexto] = useState(value);
  useEffect(() => setTexto(value), [value]);

  // O que foi digitado e não commitado sobe no DESMONTE também: fechar o sheet
  // no Esc ou no X desmonta o campo sem disparar blur, e o texto sumia sem
  // aviso. As refs seguram o valor atual sem re-registrar o efeito a cada
  // tecla (o cleanup roda uma vez, na saída).
  const textoRef = useRef(texto);
  const valueRef = useRef(value);
  const commitRef = useRef(onCommit);
  textoRef.current = texto;
  valueRef.current = value;
  commitRef.current = onCommit;
  useEffect(
    () => () => {
      if (textoRef.current !== valueRef.current) commitRef.current(textoRef.current);
    },
    [],
  );

  return (
    <Input
      value={texto}
      inputMode={inputMode}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => texto !== value && onCommit(texto)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder={placeholder}
      className="h-9"
    />
  );
}

function Group({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
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
        <span className="text-[13px] font-semibold text-foreground uppercase tracking-wider">{title}</span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-1 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export const PedidosFiltersSheet = ({ open, onOpenChange, filters, onChange, statusOptions, sellerId }: Props) => {
  /**
   * RASCUNHO — o sheet só empurra no "Aplicar", como os de Clientes e Kanban.
   *
   * Aplicar ao vivo era tolerável com 4 controles single; com os multi de UF,
   * cidade e gênero, marcar 5 UFs virava 5 recargas completas da tela (lista +
   * `count exact` + os 6 KPIs + o gráfico), e o texto de CEP/produto digitado e
   * não commitado sumia sem aviso quando o sheet fechava no Esc.
   */
  const [draft, setDraft] = useState<AdvancedFilters>(filters);
  // Reabrir sincroniza com o que está valendo (inclui o que mudou por fora:
  // barra de UF, "Limpar filtros" do topo, deep-link).
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const set = <K extends keyof AdvancedFilters>(k: K, v: AdvancedFilters[K]) =>
    setDraft((p) => ({ ...p, [k]: v }));

  const aplicar = () => {
    onChange(draft);
    onOpenChange(false);
  };
  const nDraft = countActiveAdvanced(draft);

  /**
   * Faixa de valor: o arrasto vive num estado LOCAL e só sobe no `onValueCommit`
   * (quando o polegar é solto).
   *
   * O `onValueChange` do Radix dispara a cada passo — arrastar de R$ 1.000 até
   * R$ 200 com step 10 são ~80 mudanças, e cada uma refazia contagem exata,
   * página de pedidos, workflow_executions, `get_pedidos_kpis` e
   * `get_pedidos_chart_series` (queryKey novo a cada passo, o react-query não
   * deduplica): ~400 requisições num arrasto, com os 6 cards e o gráfico
   * piscando em skeleton o tempo todo.
   */
  const [range, setRange] = useState<[number, number]>([draft.minValue, draft.maxValue]);
  useEffect(() => {
    setRange([draft.minValue, draft.maxValue]);
  }, [draft.minValue, draft.maxValue]);

  const toggleLista = (k: "states" | "cities" | "genders", item: string) =>
    setDraft((p) => ({
      ...p,
      [k]: p[k].includes(item) ? p[k].filter((x) => x !== item) : [...p[k], item],
    }));

  const [minShown, maxShown] = range;
  const faixa =
    maxShown >= MAX_VALUE_CAP
      ? `${formatCurrency(minShown)} ou mais`
      : `${formatCurrency(minShown)} – ${formatCurrency(maxShown)}`;

  return (
    <FiltrosSheetShell
      open={open}
      onOpenChange={onOpenChange}
      title="Mais filtros"
      subtitle="Recortam a lista de pedidos e os indicadores do topo ao mesmo tempo."
      icon={SlidersHorizontal}
      count={nDraft}
      footer={
        <div className="space-y-3">
          {/* Exportar mora aqui a pedido (11/08): na barra de filtros ele era o
              único botão que não filtrava nada, e no notebook empurrava a linha.
              Dentro do sheet ele fica ao lado do recorte que acabou de ser
              montado — e recebe a contagem de filtros ativos, que é o aviso de
              que o CSV do servidor não conhece esse recorte. */}
          {/* app: exportar gera um arquivo no aparelho, que o app ainda não
              consegue salvar; a exportação abre no site, no navegador. */}
          <Button variant="outline" size="sm" asChild>
            <a href={noSite("/pedidos")} target="_blank" rel="noopener noreferrer">
              <Download className="w-4 h-4 mr-2" />
              Exportar pelo site
            </a>
          </Button>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <Button
              variant="outline"
              onClick={() => {
                // Limpar APLICA na hora (padrão de Clientes e Kanban) e mantém o
                // sheet aberto: o usuário vê o painel esvaziar e a lista soltar.
                setDraft(DEFAULT_ADVANCED_FILTERS);
                onChange(DEFAULT_ADVANCED_FILTERS);
              }}
            >
              Limpar filtros
            </Button>
            <Button onClick={aplicar}>Aplicar{nDraft > 0 ? ` (${nDraft})` : ""}</Button>
          </div>
        </div>
      }
    >
        <div className="-mx-6 px-6">
          <Group title="Tipo de pedido" defaultOpen>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={draft.type} onValueChange={(v) => set("type", v as AdvancedFilters["type"])}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="first">Apenas primeira compra</SelectItem>
                  <SelectItem value="second">Apenas segunda venda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-xs text-foreground">Incluir cancelados e reembolsos</Label>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Fora por padrão, para a lista bater com os indicadores do topo.
                </p>
              </div>
              <Switch
                checked={draft.includeCancelled}
                onCheckedChange={(v) => set("includeCancelled", v)}
                className="mt-0.5 shrink-0"
              />
            </div>
          </Group>

          {statusOptions.length > 0 && (
            <Group title="Status">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Status do pedido</Label>
                <Select value={draft.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    {statusOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Group>
          )}

          <Group title="Financeiro">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-muted-foreground">Faixa de valor</Label>
                <span className="text-xs font-medium text-foreground font-tabular">{faixa}</span>
              </div>
              <RangeSlider
                min={0}
                max={MAX_VALUE_CAP}
                step={10}
                value={range}
                onValueChange={(v) => setRange([v[0], v[1]])}
                onValueCommit={(v) => setDraft((p) => ({ ...p, minValue: v[0], maxValue: v[1] }))}
              />
            </div>
          </Group>

          <Group title="Localização">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Estado (UF)</Label>
              <div className="flex flex-wrap gap-1.5">
                {UF_LIST.map((uf) => (
                  <Chip
                    key={uf}
                    active={draft.states.includes(uf)}
                    onClick={() => toggleLista("states", uf)}
                  >
                    {uf}
                  </Chip>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Marcar aqui substitui o seletor de estado da barra.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Cidade</Label>
              <CidadeBusca
                sellerId={sellerId}
                selected={draft.cities}
                onChange={(next) => setDraft((p) => ({ ...p, cities: next }))}
                enabled={open}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">CEP começa com</Label>
              <CampoTextoCommit
                value={draft.cepPrefix}
                inputMode="numeric"
                onCommit={(v) => setDraft((p) => ({ ...p, cepPrefix: v }))}
                placeholder="Ex.: 01310 ou 8"
              />
              <p className="text-[11px] leading-snug text-muted-foreground">
                Só os dígitos contam — CEP com ou sem hífen entra igual.
              </p>
            </div>
          </Group>

          <Group title="Perfil do cliente">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Tipo de documento</Label>
              <Select
                value={draft.documentType}
                onValueChange={(v) => set("documentType", v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="cpf">CPF (pessoa física)</SelectItem>
                  <SelectItem value="cnpj">CNPJ (empresa)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Gênero</Label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { value: "male", label: "Masculino" },
                  { value: "female", label: "Feminino" },
                  { value: "unknown", label: "Sem informação" },
                ].map((g) => (
                  <Chip
                    key={g.value}
                    active={draft.genders.includes(g.value)}
                    onClick={() => toggleLista("genders", g.value)}
                  >
                    {g.label}
                  </Chip>
                ))}
              </div>
            </div>
          </Group>

          <Group title="Produto">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nome do produto</Label>
              <Select
                value={draft.productOperator}
                onValueChange={(v) => set("productOperator", v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contém</SelectItem>
                  <SelectItem value="not-contains">Não contém</SelectItem>
                  <SelectItem value="starts-with">Começa com</SelectItem>
                  <SelectItem value="ends-with">Termina com</SelectItem>
                  <SelectItem value="exact">Exatamente</SelectItem>
                </SelectContent>
              </Select>
              <CampoTextoCommit
                value={draft.productText}
                onCommit={(v) => setDraft((p) => ({ ...p, productText: v }))}
                placeholder="Trecho do nome do produto"
              />
              <p className="text-[11px] leading-snug text-muted-foreground">
                O asterisco (*) vale como “qualquer coisa”: <strong>cabo*2,5</strong> acha
                “cabo 2x2,5” e “cabo de 2,5”.
              </p>
            </div>
          </Group>

          <Group title="Comunicação">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">WhatsApp já contatado?</Label>
              <Select
                value={draft.whatsappContacted}
                onValueChange={(v) => set("whatsappContacted", v as AdvancedFilters["whatsappContacted"])}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="yes">Sim</SelectItem>
                  <SelectItem value="no">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Group>
        </div>

    </FiltrosSheetShell>
  );
};

export default PedidosFiltersSheet;
