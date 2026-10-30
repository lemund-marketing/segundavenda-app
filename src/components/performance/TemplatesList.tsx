import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  ArrowRight,
  Mail,
  MessageSquare,
  Smartphone,
  SearchX,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  calculateTemplateHealth,
  categorizeTemplate,
  CATEGORIES,
  type CategoryKey,
  type HealthStatus,
  type HealthInfo,
} from "@/utils/templateHealth";
import { calculateEmailTemplateHealth } from "@/utils/emailTemplateHealth";

export type Channel = "whatsapp" | "email" | "sms";

export interface Template {
  id?: string;
  name: string;
  category?: string | null;
  sent: number;
  delivered: number;
  read?: number;
  opened?: number;
  clicked?: number;
  replied?: number;
  failed: number;
  bounced?: number;
  complained?: number;
}

function getHealthFor(t: Template, channel: Channel): HealthInfo {
  if (channel === "email") {
    return calculateEmailTemplateHealth({
      sent: t.sent,
      delivered: t.delivered,
      opened: t.opened,
      bounced: t.bounced,
      complained: t.complained,
    });
  }
  return calculateTemplateHealth(t);
}

interface Props {
  templates: Template[];
  channel: Channel;
  onTemplateClick?: (t: Template) => void;
  isLoading?: boolean;
  /** Empty state custom (canal em configuração) */
  disabledReason?: string;
}

type ViewMode = "cards" | "table";
type SortKey =
  | "sent-desc"
  | "engage-desc"
  | "action-desc"
  | "failed-desc"
  | "name-asc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "sent-desc", label: "Mais envios" },
  { key: "engage-desc", label: "Maior taxa de leitura/abertura" },
  { key: "action-desc", label: "Maior taxa de resposta/clique" },
  { key: "failed-desc", label: "Mais não entregues" },
  { key: "name-asc", label: "Nome A-Z" },
];

const HEALTH_CHIPS: { status: HealthStatus; label: string; emoji: string }[] = [
  { status: "healthy", label: "Saudáveis", emoji: "🟢" },
  { status: "attention", label: "Atenção", emoji: "🟡" },
  { status: "critical", label: "Críticos", emoji: "🔴" },
];

const VIEW_STORAGE_KEY = "templates-view-mode";

// ----- helpers de canal -----
function getEngagementValue(t: Template, channel: Channel): number {
  if (channel === "email") return t.opened ?? 0;
  if (channel === "whatsapp") return t.read ?? 0;
  return t.delivered;
}
function getActionValue(t: Template, channel: Channel): number {
  if (channel === "email") return t.clicked ?? 0;
  if (channel === "whatsapp") return t.replied ?? 0;
  return 0;
}
function pct(num: number, den: number) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}
function rateColor(p: number) {
  if (p >= 90) return "text-success";
  if (p >= 70) return "text-warning";
  // Cinza, não vermelho (20/08): entrega baixa é sinal de rotina de canal.
  return "text-muted-foreground";
}
function getChannelLabels(channel: Channel) {
  if (channel === "email") {
    return {
      col2: "Abertos",
      col3: "Cliques",
      pctEngage: "aberto",
      pctAction: "clique",
      headerEngage: "Abertura%",
      headerAction: "Clique%",
    };
  }
  if (channel === "whatsapp") {
    return {
      col2: "Lidas",
      col3: "Respondidas",
      pctEngage: "lido",
      pctAction: "resp.",
      headerEngage: "Leitura%",
      headerAction: "Resp.%",
    };
  }
  return {
    col2: "Entregues",
    col3: "Não entregues",
    pctEngage: "",
    pctAction: "",
    headerEngage: "",
    headerAction: "",
  };
}
function channelIcon(channel: Channel) {
  return channel === "email" ? Mail : channel === "sms" ? Smartphone : MessageSquare;
}

// ============================================================
export function TemplatesList({
  templates,
  channel,
  onTemplateClick,
  isLoading,
  disabledReason,
}: Props) {
  const labels = getChannelLabels(channel);
  const disabled = !!disabledReason;

  // modo de visualização
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "cards";
    return (localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode) || "cards";
  });
  // Celular: sempre em cards (a tabela não cabe) e filtros em pílulas.
  const isMobile = useIsMobile();
  const vista: ViewMode = isMobile ? "cards" : view;
  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  // filtros simples
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryKey | "all">("all");
  const [sort, setSort] = useState<SortKey>("sent-desc");

  // filtros avançados
  const [sheetOpen, setSheetOpen] = useState(false);
  const [healthFilter, setHealthFilter] = useState<HealthStatus[]>([]);
  const [minSampleVolume, setMinSampleVolume] = useState<"all" | "10" | "50" | "100">("all");

  const sentRangeBounds = useMemo<[number, number]>(() => {
    if (!templates.length) return [0, 100];
    const sents = templates.map((t) => t.sent);
    return [Math.min(...sents), Math.max(...sents)];
  }, [templates]);
  const [sentRange, setSentRange] = useState<[number, number]>(sentRangeBounds);
  useEffect(() => setSentRange(sentRangeBounds), [sentRangeBounds[0], sentRangeBounds[1]]);

  // categorias dinâmicas
  const categoriesAvailable = useMemo(() => {
    const counts = new Map<CategoryKey, number>();
    templates.forEach((t) => {
      const c = categorizeTemplate(t.name).key;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([key, n]) => ({
      key,
      label: CATEGORIES[key].label,
      count: n,
    }));
  }, [templates]);

  // pipeline de filtros
  const filtered = useMemo(() => {
    const minVol = minSampleVolume === "all" ? 0 : Number(minSampleVolume);
    let arr = templates.filter((t) => {
      if (query && !t.name.toLowerCase().includes(query.toLowerCase())) return false;
      if (category !== "all" && categorizeTemplate(t.name).key !== category) return false;
      if (t.sent < minVol) return false;
      if (t.sent < sentRange[0] || t.sent > sentRange[1]) return false;
      if (healthFilter.length > 0) {
        const h = getHealthFor(t, channel).status;
        if (!healthFilter.includes(h)) return false;
      }
      return true;
    });
    arr = [...arr].sort((a, b) => {
      switch (sort) {
        case "sent-desc":
          return b.sent - a.sent;
        case "engage-desc":
          return pct(getEngagementValue(b, channel), b.delivered)
               - pct(getEngagementValue(a, channel), a.delivered);
        case "action-desc":
          return pct(getActionValue(b, channel), b.delivered)
               - pct(getActionValue(a, channel), a.delivered);
        case "failed-desc":
          return (b.failed ?? 0) - (a.failed ?? 0);
        case "name-asc":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });
    return arr;
  }, [templates, query, category, minSampleVolume, sentRange, healthFilter, sort, channel]);

  const advancedCount =
    (healthFilter.length > 0 ? 1 : 0) +
    (minSampleVolume !== "all" ? 1 : 0) +
    (sentRange[0] !== sentRangeBounds[0] || sentRange[1] !== sentRangeBounds[1] ? 1 : 0);

  const clearAdvanced = () => {
    setHealthFilter([]);
    setMinSampleVolume("all");
    setSentRange(sentRangeBounds);
  };
  const clearAll = () => {
    setQuery("");
    setCategory("all");
    setSort("sent-desc");
    clearAdvanced();
  };

  const toggleHealth = (s: HealthStatus) => {
    setHealthFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  // ===== render
  if (isLoading) {
    return (
      <Card className="rounded-2xl shadow-sm bg-card">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* HEADER / FILTROS — no celular (22/10/2026): busca em pílula e os
          filtros numa fileira de pílulas que rola de lado, como no resto do
          app; a troca cards/tabela some (no celular é sempre cards). */}
      {isMobile ? (
        <div className={cn("flex flex-col gap-3", disabled && "opacity-60 pointer-events-none")}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar template"
              className="h-11 rounded-full border-border/60 bg-card pl-10 text-[15px]"
            />
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Select value={category} onValueChange={(v) => setCategory(v as any)}>
              <SelectTrigger
                className={cn(
                  "h-9 w-auto shrink-0 gap-1.5 rounded-full border-border/60 bg-card px-3.5 text-[13px] font-semibold shadow-none focus:ring-0 focus:ring-offset-0",
                  category !== "all" && "border-transparent bg-primary/10 text-primary",
                )}
              >
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categoriesAvailable.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {CATEGORIES[c.key].emoji} {c.label} ({c.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 w-auto shrink-0 gap-1.5 rounded-full border-border/60 bg-card px-3.5 text-[13px] font-semibold shadow-none focus:ring-0 focus:ring-offset-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className={cn(
                "h-9 shrink-0 gap-1.5 rounded-full border-border/60 bg-card px-3.5 text-[13px] font-semibold shadow-none",
                advancedCount > 0 && "border-transparent bg-primary/10 text-primary",
              )}
              onClick={() => setSheetOpen(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Mais filtros
              {advancedCount > 0 && (
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                  {advancedCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      ) : (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-card shadow-sm",
          disabled && "opacity-60 pointer-events-none"
        )}
      >
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar template..."
            className="pl-9 h-10 rounded-xl bg-background"
          />
        </div>

        <Select value={category} onValueChange={(v) => setCategory(v as any)}>
          <SelectTrigger className="w-[200px] h-10 rounded-xl">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categoriesAvailable.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {CATEGORIES[c.key].emoji} {c.label} ({c.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[230px] h-10 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          className="h-10 rounded-xl gap-2 relative"
          onClick={() => setSheetOpen(true)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Mais filtros
          {advancedCount > 0 && (
            <Badge className="ml-1 h-5 px-1.5 text-[10px] bg-primary text-primary-foreground">
              {advancedCount}
            </Badge>
          )}
        </Button>

        <div className="ml-auto flex items-center gap-1 p-1 rounded-xl bg-muted">
          <button
            onClick={() => setView("cards")}
            className={cn(
              "p-2 rounded-lg transition-all",
              view === "cards"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Cards"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView("table")}
            className={cn(
              "p-2 rounded-lg transition-all",
              view === "table"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Tabela"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>
      )}

      {/* CORPO */}
      {disabled ? (
        <DisabledEmptyState channel={channel} message={disabledReason!} />
      ) : templates.length === 0 ? (
        <EmptyNoTemplates channel={channel} />
      ) : filtered.length === 0 ? (
        <EmptyFiltered onClear={clearAll} />
      ) : vista === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((t, i) => (
            <TemplateCard
              key={t.id ?? t.name}
              template={t}
              channel={channel}
              index={i}
              onClick={() => onTemplateClick?.(t)}
            />
          ))}
        </div>
      ) : (
        <TemplatesTable
          templates={filtered}
          channel={channel}
          labels={labels}
          onClick={(t) => onTemplateClick?.(t)}
        />
      )}

      {/* SHEET — filtros avançados */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[360px] sm:w-[360px]">
          <SheetHeader>
            <SheetTitle className="text-lg font-bold">Mais Filtros</SheetTitle>
          </SheetHeader>

          <div className="py-6 space-y-6">
            {/* saúde */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Status de Saúde
              </p>
              <div className="flex flex-wrap gap-2">
                {HEALTH_CHIPS.map((c) => {
                  const active = healthFilter.includes(c.status);
                  return (
                    <button
                      key={c.status}
                      onClick={() => toggleHealth(c.status)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card border-border text-foreground hover:bg-muted/50"
                      )}
                    >
                      {c.emoji} {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* faixa de envios */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Faixa de Envios
                </p>
                <span className="text-xs tabular-nums text-foreground font-semibold">
                  {sentRange[0]} – {sentRange[1]}
                </span>
              </div>
              <Slider
                min={sentRangeBounds[0]}
                max={sentRangeBounds[1]}
                step={1}
                value={sentRange}
                onValueChange={(v) => setSentRange([v[0], v[1]] as [number, number])}
              />
            </div>

            {/* amostra mínima */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Amostra Mínima
              </p>
              <Select value={minSampleVolume} onValueChange={(v) => setMinSampleVolume(v as any)}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="10">Apenas com 10+ envios</SelectItem>
                  <SelectItem value="50">Apenas com 50+ envios</SelectItem>
                  <SelectItem value="100">Apenas com 100+ envios</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={clearAdvanced}>Limpar filtros</Button>
            <Button onClick={() => setSheetOpen(false)}>Aplicar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ============================================================
// CARD
// ============================================================
function TemplateCard({
  template,
  channel,
  onClick,
  index,
}: {
  template: Template;
  channel: Channel;
  onClick: () => void;
  index: number;
}) {
  const cat = categorizeTemplate(template.name);
  const health = getHealthFor(template, channel);
  const labels = getChannelLabels(channel);

  const sent = template.sent || 0;
  const delivered = template.delivered || 0;
  const failed = template.failed || 0;
  const engageVal = getEngagementValue(template, channel);
  const actionVal = getActionValue(template, channel);

  // Entrega sobre TENTATIVAS, não sobre `sent`: no WhatsApp `sent` já exclui as
  // falhas, e "98% entregue" ao lado de "23% falha" não podia ser verdade junto.
  // (`attempts` é definido logo abaixo; e-mail não muda, lá sent = tentativas.)
  const deliveryPct = pct(delivered, channel === "email" ? sent : sent + failed);
  // engajamento % → whatsapp: read/delivered · email: opened/delivered · sms: 0
  const engagePct = pct(engageVal, delivered);
  // falha % — para EMAIL o denominador é sempre `sent` (total de tentativas)
  // e o numerador soma falhas + bounces (bounces também são falha de entrega).
  const failNumerator = channel === "email" ? (failed + (template.bounced || 0)) : failed;

  /**
   * TENTATIVAS, não "enviadas": no WhatsApp `sent` conta só o que a Meta aceitou
   * (status sent/delivered/read) — quem falhou nunca entra ali. Dividir falha por
   * `sent` daria 70/230 = 30% no card enquanto a tela de detalhe mostra
   * 70/300 = 23%, que é a conta certa (TemplatePerformance.tsx usa sent+failed).
   * No e-mail `sent` já é o total de tentativas, por isso a exceção.
   */
  const attempts = channel === "email" ? sent : sent + failed;
  const failPct = pct(failNumerator, attempts);

  // segmentos (% das tentativas — mesma base da porcentagem acima)
  const failW = attempts ? (failNumerator / attempts) * 100 : 0;
  const engageW = attempts ? (engageVal / attempts) * 100 : 0;
  const deliveredNotEngagedW = Math.max(
    attempts ? ((delivered - engageVal) / attempts) * 100 : 0,
    0
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      onClick={onClick}
      className="rounded-2xl shadow-sm bg-card p-5 cursor-pointer transition-all hover:shadow-hover hover:-translate-y-0.5"
    >
      {/* header */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0",
            cat.bgClass
          )}
        >
          {cat.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-[15px] font-semibold text-foreground truncate"
            title={template.name}
          >
            {template.name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Categoria · {cat.label}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold",
            health.pillClass
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full", health.dotClass)} />
          {health.label}
        </span>
      </div>

      <div className="my-3 h-px bg-border/50" />

      {/* barra de saúde */}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
        <div className="h-full bg-success/40" style={{ width: `${deliveredNotEngagedW}%` }} />
        <div className="h-full bg-success" style={{ width: `${engageW}%` }} />
        <div className="h-full bg-muted-foreground/40" style={{ width: `${failW}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5">
        {channel === "sms" ? (
          <>{deliveryPct}% entregue · {failPct}% não entregue</>
        ) : (
          <>
            {deliveryPct}% entregue · {engagePct}% {labels.pctEngage} · {failPct}% não entregue
          </>
        )}
      </p>

      {/* métricas */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <Metric label="Envios" value={sent} />
        <Metric label={labels.col2} value={channel === "sms" ? delivered : engageVal} />
        <Metric
          label={labels.col3}
          value={channel === "sms" ? failed : actionVal}
          tone="default"
        />
      </div>

      <div className="mt-4 pt-3 border-t border-border/50">
        <button
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          className="text-xs font-semibold text-primary hover:text-primary/80 inline-flex items-center gap-1"
        >
          Ver detalhes <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
}

function Metric({
  label, value, tone = "default",
}: { label: string; value: number; tone?: "default" | "danger" }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn(
        "text-lg font-bold tabular-nums leading-tight mt-0.5",
        tone === "danger" ? "text-muted-foreground" : "text-foreground"
      )}>
        {value.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

// ============================================================
// TABELA
// ============================================================
function TemplatesTable({
  templates, channel, labels, onClick,
}: {
  templates: Template[];
  channel: Channel;
  labels: ReturnType<typeof getChannelLabels>;
  onClick: (t: Template) => void;
}) {
  const isSms = channel === "sms";
  return (
    <Card className="rounded-2xl shadow-sm bg-card">
      <CardContent className="p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] font-semibold text-muted-foreground border-b">
              <th className="text-left py-3 pl-2 w-10">●</th>
              <th className="text-left py-3">Nome</th>
              <th className="text-right py-3">Envios</th>
              <th className="text-right py-3">Entrega%</th>
              {!isSms && <th className="text-right py-3">{labels.headerEngage}</th>}
              {!isSms && <th className="text-right py-3">{labels.headerAction}</th>}
              <th className="text-right py-3">Não entregues</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const cat = categorizeTemplate(t.name);
              const health = getHealthFor(t, channel);
              const dPct = pct(t.delivered, t.sent);
              const engagePct = pct(getEngagementValue(t, channel), t.delivered);
              const actionPct = pct(getActionValue(t, channel), t.delivered);
              return (
                <tr
                  key={t.id ?? t.name}
                  onClick={() => onClick(t)}
                  className="border-b border-border/50 hover:bg-muted/40 cursor-pointer transition-colors group"
                >
                  <td className="py-3.5 pl-2">
                    <span
                      title={health.label}
                      className={cn("inline-block w-3 h-3 rounded-full", health.dotClass)}
                    />
                  </td>
                  <td className="py-3.5">
                    <p className="font-medium text-foreground truncate max-w-[280px]" title={t.name}>
                      {t.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {cat.emoji} {cat.label}
                    </p>
                  </td>
                  <td className="text-right tabular-nums">{t.sent.toLocaleString("pt-BR")}</td>
                  <td className={cn("text-right tabular-nums font-semibold", rateColor(dPct))}>
                    {dPct}%
                  </td>
                  {!isSms && (
                    <td className={cn("text-right tabular-nums font-semibold", rateColor(engagePct))}>
                      {engagePct}%
                    </td>
                  )}
                  {!isSms && (
                    <td className="text-right tabular-nums text-foreground">
                      {actionPct}%
                    </td>
                  )}
                  <td className={cn(
                    "text-right tabular-nums font-semibold",
                    "text-muted-foreground"
                  )}>
                    {t.failed ?? 0}
                  </td>
                  <td className="text-right pr-2 text-muted-foreground group-hover:text-primary transition">
                    <ArrowRight className="w-4 h-4 inline-block" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ============================================================
// EMPTY STATES
// ============================================================
function EmptyNoTemplates({ channel }: { channel: Channel }) {
  const Icon = channelIcon(channel);
  const subtitle =
    channel === "whatsapp"
      ? "Crie e configure templates pra começar a disparar"
      : channel === "email"
      ? "Nenhum template de e-mail foi disparado neste período"
      : "Nenhum template de SMS foi disparado neste período";

  return (
    <Card className="rounded-2xl shadow-sm bg-card">
      <CardContent className="py-16 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <h4 className="text-base font-bold text-foreground mb-1">
          Nenhum template ainda
        </h4>
        <p className="text-sm text-muted-foreground max-w-sm">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

function EmptyFiltered({ onClear }: { onClear: () => void }) {
  return (
    <Card className="rounded-2xl shadow-sm bg-card">
      <CardContent className="py-16 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <SearchX className="w-7 h-7 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <h4 className="text-base font-bold text-foreground mb-1">
          Nenhum template encontrado
        </h4>
        <p className="text-sm text-muted-foreground mb-4">
          Ajuste os filtros para ver mais resultados
        </p>
        <Button variant="outline" onClick={onClear}>Limpar filtros</Button>
      </CardContent>
    </Card>
  );
}

function DisabledEmptyState({ channel, message }: { channel: Channel; message: string }) {
  const Icon = channelIcon(channel);
  return (
    <Card className="rounded-2xl shadow-sm bg-card">
      <CardContent className="py-16 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-muted-foreground" strokeWidth={1.75} />
        </div>
        <h4 className="text-base font-bold text-foreground mb-1">
          {channel === "email" ? "Disparos por Email em configuração" : "Disparos por SMS em configuração"}
        </h4>
        <p className="text-sm text-muted-foreground max-w-md">{message}</p>
      </CardContent>
    </Card>
  );
}
