import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarRange } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { MercadoLivreSelo } from "@/components/omnichannel/ml/MercadoLivreSelo";

interface StageOption {
  id: string;
  name: string;
  color?: string | null;
}

interface InstanceOption {
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;

  // FASE DO KANBAN
  stageOptions: StageOption[];
  stageFilter: string;
  setStageFilter: (v: string) => void;

  // SEGMENTO RFV
  rfvOptions: { name: string; color: string; clients?: number }[];
  rfvFilter: string;
  setRfvFilter: (v: string) => void;

  // NÚMERO DE ORIGEM (whatsapp_cloud_instances que atende/enviou a conversa)
  instanceOptions: InstanceOption[];
  instanceFilter: string;
  setInstanceFilter: (v: string) => void;

  // TEMPLATES (multi: e so peneira de navegador sobre `conversations.template_tag`)
  templateOptions: string[];
  templateColor: (tpl: string) => { bg: string; text: string };
  templateFilters: string[];
  setTemplateFilters: (v: string[]) => void;

  // CLASSIFICACAO IA
  sentimentFilter: string;
  setSentimentFilter: (v: string) => void;

  // WORKFLOW DE ORIGEM
  workflowOptions: [string, string][];
  workflowFilter: string;
  setWorkflowFilter: (v: string) => void;

  // DATA DA ÚLTIMA MENSAGEM
  // Diferente dos outros: este NÃO peneira no navegador, vai na consulta do
  // servidor (ver Omnichannel.tsx). `last_message_at` é a coluna que ordena e
  // pagina a lista, então filtrar por ela é exato — enquanto fase e marketplace,
  // que peneiram as 20 carregadas, precisam de carga extra para não zerar.
  dateFrom?: Date;
  dateTo?: Date;
  setDateFrom: (d?: Date) => void;
  setDateTo: (d?: Date) => void;

  // MARKETPLACE
  marketplaceOptions: string[];
  marketplaceLabel: (mk: string) => string;
  marketplaceFilter: string;
  setMarketplaceFilter: (v: string) => void;

  onClear: () => void;
  activeCount: number;

  // CANAL — Suporte do Mercado Livre (via hub). Opcionais: o grupo só aparece
  // para o seller com a chave ligada, e quem não passa nada não vê diferença.
  mlDisponivel?: boolean;
  mlOnly?: boolean;
  setMlOnly?: (v: boolean) => void;
}

const CONTAGEM_CLASS =
  "min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center tabular-nums normal-case";

/**
 * "Mais filtros" do inbox do Omnichannel: accordion por grupo, titulo em
 * maiusculas, contagem do que esta ligado e rodape Limpar/Fechar — mesmo desenho
 * do Segundo Pedido.
 *
 * Existe porque a coluna do inbox tem 320px: os seis selects nao cabiam no
 * popover sem virar rolagem. Canal e status ficam de fora, na barra, onde o
 * usuario troca o tempo todo.
 *
 * Fase, RFV, sentimento, workflow e marketplace continuam de selecao UNICA
 * (`all`/`none` + valor). Nao e estilo: fase, RFV e marketplace disparam carga
 * extra no servidor por valor escolhido, e multi-selecao mudaria esses tres
 * efeitos junto. Numero de origem tambem e unico, mas so tem `all` + valor —
 * nao ha item "sem numero", entao as conversas com `whatsapp_instance_id` nulo
 * (25.361 de 368.319 em producao, 29/08/2026) so aparecem em "Todos os numeros".
 */
export function OmnichannelFiltersSheet({
  open, onOpenChange,
  stageOptions, stageFilter, setStageFilter,
  rfvOptions, rfvFilter, setRfvFilter,
  instanceOptions, instanceFilter, setInstanceFilter,
  templateOptions, templateColor, templateFilters, setTemplateFilters,
  sentimentFilter, setSentimentFilter,
  workflowOptions, workflowFilter, setWorkflowFilter,
  marketplaceOptions, marketplaceLabel, marketplaceFilter, setMarketplaceFilter,
  dateFrom, dateTo, setDateFrom, setDateTo,
  onClear, activeCount,
  mlDisponivel = false, mlOnly = false, setMlOnly,
}: Props) {
  // Abre ja expandido o grupo que esta filtrado — senao o usuario abre o sheet e
  // ve oito accordions fechados, sem pista de onde esta o filtro ligado.
  // (O conteudo do Sheet desmonta ao fechar, entao isso recalcula a cada abertura.)
  const defaultOpen: string[] = [];
  if (stageFilter !== "all") defaultOpen.push("fase");
  if (rfvFilter !== "all") defaultOpen.push("rfv");
  if (instanceFilter !== "all") defaultOpen.push("instance");
  if (templateFilters.length > 0) defaultOpen.push("templates");
  if (sentimentFilter !== "all") defaultOpen.push("ia");
  if (workflowFilter !== "all") defaultOpen.push("workflow");
  if (marketplaceFilter !== "all") defaultOpen.push("marketplace");
  if (dateFrom || dateTo) defaultOpen.push("data");
  if (mlOnly) defaultOpen.push("canal");

  const toggleTemplate = (tpl: string) => {
    setTemplateFilters(
      templateFilters.includes(tpl) ? templateFilters.filter((t) => t !== tpl) : [...templateFilters, tpl],
    );
  };

  const tituloGrupo = (label: string, ligado: boolean, contagem?: number) => (
    <span className="flex items-center gap-2">
      {label}
      {ligado && <span className={CONTAGEM_CLASS}>{contagem ?? 1}</span>}
    </span>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle className="text-[18px] font-bold text-foreground flex items-center gap-2">
            Mais filtros
            {activeCount > 0 && (
              <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold inline-flex items-center justify-center tabular-nums">
                {activeCount}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-2">
          <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
            {/* CANAL — no topo porque o último grupo leva `border-b-0`. */}
            {mlDisponivel && setMlOnly && (
              <AccordionItem value="canal" className="border-b border-border">
                <AccordionTrigger className="text-[13px] font-semibold text-foreground uppercase tracking-wide">
                  {tituloGrupo("Canal", mlOnly)}
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pt-2 pb-4">
                  <label className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer">
                    <Checkbox checked={mlOnly} onCheckedChange={(v) => setMlOnly(v === true)} />
                    <MercadoLivreSelo tamanho="sm" />
                    <span className="text-[13px] text-foreground flex-1">Somente conversas do Mercado Livre</span>
                  </label>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Sem marcar, as conversas pós-venda do Mercado Livre aparecem misturadas na aba
                    Todas, em amarelo, enquanto nenhum filtro de cliente (fase, RFV, número, template,
                    IA, workflow, loja) estiver ligado. Elas nunca entram nos contadores das abas.
                  </p>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* FASE DO KANBAN */}
            <AccordionItem value="fase" className="border-b border-border">
              <AccordionTrigger className="text-[13px] font-semibold text-foreground uppercase tracking-wide">
                {tituloGrupo("Fase do Kanban", stageFilter !== "all")}
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pt-2 pb-4">
                <Label className="text-[12px] font-medium text-muted-foreground">Fase atual do cliente</Label>
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="h-9 rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as fases</SelectItem>
                    <SelectItem value="none">Sem fase atribuída</SelectItem>
                    {stageOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color || "#6366f1" }} />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </AccordionContent>
            </AccordionItem>

            {/* SEGMENTO RFV */}
            {(rfvOptions.length > 0 || rfvFilter !== "all") && (
              <AccordionItem value="rfv" className="border-b border-border">
                <AccordionTrigger className="text-[13px] font-semibold text-foreground uppercase tracking-wide">
                  {tituloGrupo("Análise RFV", rfvFilter !== "all")}
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pt-2 pb-4">
                  <Label className="text-[12px] font-medium text-muted-foreground">Segmento do cliente</Label>
                  <Select value={rfvFilter} onValueChange={setRfvFilter}>
                    <SelectTrigger className="h-9 rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os segmentos</SelectItem>
                      <SelectItem value="none">Sem segmento</SelectItem>
                      {rfvOptions.map((opt) => (
                        <SelectItem key={opt.name} value={opt.name}>
                          <span className="inline-flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: opt.color }} />
                            {opt.name}
                            {opt.clients !== undefined && (
                              <span className="text-[11px] text-muted-foreground tabular-nums">{opt.clients}</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Segmento calculado por Recência, Frequência e Valor. A lista é buscada no servidor,
                    não só o que já apareceu na tela.
                  </p>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* NÚMERO DE ORIGEM */}
            <AccordionItem value="instance" className="border-b border-border">
              <AccordionTrigger className="text-[13px] font-semibold text-foreground uppercase tracking-wide">
                {tituloGrupo("Número de origem", instanceFilter !== "all")}
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pt-2 pb-4">
                <Label className="text-[12px] font-medium text-muted-foreground">
                  Número de WhatsApp que atende a conversa
                </Label>
                <Select value={instanceFilter} onValueChange={setInstanceFilter}>
                  <SelectTrigger className="h-9 rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os números</SelectItem>
                    {instanceOptions.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </AccordionContent>
            </AccordionItem>

            {/* DATA DA ÚLTIMA MENSAGEM */}
            <AccordionItem value="data" className="border-b border-border">
              <AccordionTrigger className="text-[13px] font-semibold text-foreground uppercase tracking-wide">
                {tituloGrupo("Data", !!(dateFrom || dateTo), (dateFrom ? 1 : 0) + (dateTo ? 1 : 0))}
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pt-2 pb-4">
                <Label className="text-[12px] font-medium text-muted-foreground">
                  Data da última mensagem
                </Label>
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-9 flex-1 justify-start text-left font-normal",
                          !dateFrom && "text-muted-foreground",
                        )}
                      >
                        <CalendarRange className="mr-2 h-4 w-4 shrink-0" />
                        {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: ptBR }) : "De"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={setDateFrom}
                        disabled={(d) => d > new Date()}
                        initialFocus
                        locale={ptBR}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground text-sm shrink-0">até</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-9 flex-1 justify-start text-left font-normal",
                          !dateTo && "text-muted-foreground",
                        )}
                      >
                        <CalendarRange className="mr-2 h-4 w-4 shrink-0" />
                        {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: ptBR }) : "Até"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={setDateTo}
                        disabled={(d) => d > new Date() || (dateFrom ? d < dateFrom : false)}
                        initialFocus
                        locale={ptBR}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Limpar datas
                  </button>
                )}
                {/* Só um dos dois preenchido é válido de propósito: "de 01/08 em
                    diante" e "até 10/08" são recortes que o usuário pede. */}
                <p className="text-[11px] text-muted-foreground">
                  Preencha só um dos campos para deixar o outro lado em aberto.
                </p>
              </AccordionContent>
            </AccordionItem>

            {/* TEMPLATES */}
            {templateOptions.length > 0 && (
              <AccordionItem value="templates" className="border-b border-border">
                <AccordionTrigger className="text-[13px] font-semibold text-foreground uppercase tracking-wide">
                  {tituloGrupo("Templates", templateFilters.length > 0, templateFilters.length)}
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2 pb-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-[12px] font-medium text-muted-foreground">
                      Template que abriu a conversa
                    </Label>
                    {templateFilters.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setTemplateFilters([])}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {templateOptions.map((tpl) => (
                      <label
                        key={tpl}
                        className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={templateFilters.includes(tpl)}
                          onCheckedChange={() => toggleTemplate(tpl)}
                        />
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: templateColor(tpl).bg }}
                        />
                        <span className="text-[13px] text-foreground flex-1 truncate">{tpl}</span>
                      </label>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* CLASSIFICACAO IA */}
            <AccordionItem value="ia" className="border-b border-border">
              <AccordionTrigger className="text-[13px] font-semibold text-foreground uppercase tracking-wide">
                {tituloGrupo("Classificação IA", sentimentFilter !== "all")}
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pt-2 pb-4">
                <Label className="text-[12px] font-medium text-muted-foreground">
                  Sentimento da última mensagem do cliente
                </Label>
                <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                  <SelectTrigger className="h-9 rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="positive">😊 Positivo</SelectItem>
                    <SelectItem value="neutral">😐 Neutro</SelectItem>
                    <SelectItem value="negative">😡 Negativo</SelectItem>
                    <SelectItem value="none">Sem classificação</SelectItem>
                  </SelectContent>
                </Select>
              </AccordionContent>
            </AccordionItem>

            {/* WORKFLOW DE ORIGEM */}
            <AccordionItem value="workflow" className="border-b border-border">
              <AccordionTrigger className="text-[13px] font-semibold text-foreground uppercase tracking-wide">
                {tituloGrupo("Workflow de origem", workflowFilter !== "all")}
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pt-2 pb-4">
                <Label className="text-[12px] font-medium text-muted-foreground">Fluxo que iniciou a conversa</Label>
                <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
                  <SelectTrigger className="h-9 rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="none">Sem workflow</SelectItem>
                    {workflowOptions.map(([id, nome]) => (
                      <SelectItem key={id} value={id}>⚡ {nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </AccordionContent>
            </AccordionItem>

            {/* MARKETPLACE */}
            <AccordionItem value="marketplace" className="border-b-0">
              <AccordionTrigger className="text-[13px] font-semibold text-foreground uppercase tracking-wide">
                {tituloGrupo("Loja / Marketplace", marketplaceFilter !== "all")}
              </AccordionTrigger>
              <AccordionContent className="space-y-2 pt-2 pb-4">
                <Label className="text-[12px] font-medium text-muted-foreground">Onde o cliente comprou</Label>
                <Select value={marketplaceFilter} onValueChange={setMarketplaceFilter}>
                  <SelectTrigger className="h-9 rounded-md">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="none">Sem pedido</SelectItem>
                    {marketplaceOptions.map((mk) => (
                      <SelectItem key={mk} value={mk}>{marketplaceLabel(mk)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <SheetFooter className="px-6 py-4 border-t border-border flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClear} className="w-full sm:w-auto rounded-md">
            Limpar filtros
          </Button>
          <Button
            onClick={() => onOpenChange(false)}
            className="w-full sm:flex-1 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default OmnichannelFiltersSheet;
