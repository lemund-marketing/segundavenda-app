/**
 * Campos compostos dos painéis de filtro: faixa de dinheiro em slider de dois
 * polegares e faixa de datas De/Até.
 *
 * Movidos de `ClientesMoreFiltersSheet.tsx` sem uma linha de mudança (contrato
 * `docs/GATILHO_FILTROS.md`, §S4.1). O sheet de Clientes está em produção: o
 * render tem de continuar idêntico, e variação nova entra como prop opcional.
 */
import { useEffect, useState } from "react";
import { CalendarRange } from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils/formatters";

import { parseNumberInput } from "./numeros";

/* ---------------------------------------------------------------- escalas R$ */

/**
 * Escala POR DEGRAUS das faixas de dinheiro, não linear.
 *
 * O gasto real vai de dezenas a dezenas de milhares de reais: num slider linear
 * de 0 a 50.000 com step fixo, a região onde mora quase toda a base (até uns
 * R$ 500) ocupa 1% do trilho e é impossível de acertar com o dedo. O p95 real
 * seria o teto ideal, mas exigiria RPC nova — e esta etapa é SÓ front. Então a
 * escala é fixa: degraus finos embaixo (onde os clientes estão), largos em
 * cima, e o ÚLTIMO degrau é sentinela de "sem teto" ("R$ X ou mais"), o mesmo
 * contrato do MAX_VALUE_CAP do sheet de Pedidos. Quem precisar de um corte fora
 * dos degraus ainda pode editá-lo no `?f=` da URL — o contrato continua
 * aceitando qualquer número.
 */
export const DEGRAUS_GASTO = [
  0, 50, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000,
  7500, 10000, 15000, 20000, 30000, 50000,
] as const;

/** Ticket médio é gasto ÷ pedidos: a cauda é bem mais curta que a do gasto. */
export const DEGRAUS_TICKET = [
  0, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000,
  5000,
] as const;

/** Índice do degrau mais próximo de um valor vindo do rascunho (ou da URL). */
function indiceDoDegrau(
  degraus: readonly number[],
  v: number | null,
  fallback: number,
): number {
  if (v === null) return fallback;
  let melhor = 0;
  let menorDist = Infinity;
  degraus.forEach((d, i) => {
    const dist = Math.abs(d - v);
    if (dist < menorDist) {
      menorDist = dist;
      melhor = i;
    }
  });
  return melhor;
}

/**
 * Faixa de dinheiro em slider de DOIS polegares sobre a escala de degraus.
 *
 * `@/components/ui/slider` renderiza um `<Thumb>` fixo: com `value=[a, b]` o
 * Radix só liga o primeiro polegar e o teto ficava inarrastável — o mesmo bug
 * que o sheet de Pedidos já contornou. Aqui os polegares saem do próprio
 * `value` (padrão copiado de PedidosFiltersSheet), e o slider anda sobre os
 * ÍNDICES dos degraus, não sobre reais — é o que dá resolução fina embaixo.
 *
 * Honestidade do rótulo: parado, ele mostra o valor REAL do rascunho (que pode
 * ter vindo digitado fora dos degraus, via URL); só durante o arrasto mostra o
 * degrau sob o polegar. Assim abrir o sheet nunca "muda" o filtro sozinho — o
 * rascunho só é reescrito quando o usuário solta o polegar.
 */
export function FaixaDinheiro({
  label,
  degraus,
  min,
  max,
  onCommit,
}: {
  label: string;
  degraus: readonly number[];
  /** Strings do contrato (`totalSpentMin`…): "" = sem corte. */
  min: string;
  max: string;
  onCommit: (min: string, max: string) => void;
}) {
  const topo = degraus.length - 1;

  const [faixa, setFaixa] = useState<[number, number]>(() => [
    indiceDoDegrau(degraus, parseNumberInput(min), 0),
    indiceDoDegrau(degraus, parseNumberInput(max), topo),
  ]);
  const [arrastando, setArrastando] = useState(false);

  // Rascunho mudou por fora (abrir o sheet, "Limpar", chip removido): os
  // polegares seguem. Durante o arrasto quem manda é o estado local.
  useEffect(() => {
    setFaixa([
      indiceDoDegrau(degraus, parseNumberInput(min), 0),
      indiceDoDegrau(degraus, parseNumberInput(max), topo),
    ]);
  }, [min, max, degraus, topo]);

  const [iMin, iMax] = faixa;
  const vMin = arrastando ? degraus[iMin] : (parseNumberInput(min) ?? 0);
  const vMax = arrastando
    ? iMax >= topo
      ? null
      : degraus[iMax]
    : parseNumberInput(max);

  const rotulo =
    vMin <= 0 && vMax === null
      ? "Qualquer valor"
      : vMax === null
        ? `${formatCurrency(vMin)} ou mais`
        : `${formatCurrency(vMin)} – ${formatCurrency(vMax)}`;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {/* Valor formatado AO VIVO — é o que substitui os dois inputs crus. */}
        <span className="text-xs font-medium tabular-nums text-foreground">{rotulo}</span>
      </div>
      <SliderPrimitive.Root
        className="relative flex w-full touch-none select-none items-center"
        min={0}
        max={topo}
        step={1}
        minStepsBetweenThumbs={1}
        value={faixa}
        onValueChange={(v) => {
          setArrastando(true);
          setFaixa([v[0], v[1]]);
        }}
        onValueCommit={(v) => {
          setArrastando(false);
          // Ponta esquerda no zero e ponta direita no topo = filtro desligado:
          // a chave nem entra no payload (convenção de clientesFilters.ts).
          // Só o lado cujo ÍNDICE mudou é reescrito — o outro mantém o valor
          // original do rascunho, que pode estar fora dos degraus (ex.: "120"
          // vindo da URL não pode virar "100" sem o usuário tocar nele).
          const idx0 = indiceDoDegrau(degraus, parseNumberInput(min), 0);
          const idx1 = indiceDoDegrau(degraus, parseNumberInput(max), topo);
          onCommit(
            v[0] !== idx0 ? (v[0] <= 0 ? "" : String(degraus[v[0]])) : min,
            v[1] !== idx1 ? (v[1] >= topo ? "" : String(degraus[v[1]])) : max,
          );
        }}
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
          <SliderPrimitive.Range className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        {faixa.map((_, i) => (
          <SliderPrimitive.Thumb
            key={i}
            aria-label={i === 0 ? `${label} — mínimo` : `${label} — máximo`}
            className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Root>
    </div>
  );
}

/** "2026-08-01" → Date local (T00:00:00 evita o recuo de um dia do fuso). */
const isoParaDate = (iso: string): Date | undefined =>
  iso ? new Date(`${iso}T00:00:00`) : undefined;

/**
 * Faixa de datas De/Até em Calendar meio-aberto — padrão copiado do
 * OmnichannelFiltersSheet. O contrato continua guardando strings "yyyy-MM-dd"
 * (`lastOrderFrom`…): só a superfície muda, o payload sai idêntico ao dos
 * antigos `<input type="date">`.
 */
export function CampoPeriodoDatas({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const dFrom = isoParaDate(from);
  const dTo = isoParaDate(to);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-9 flex-1 justify-start text-left font-normal",
                !dFrom && "text-muted-foreground",
              )}
            >
              <CalendarRange className="mr-2 h-4 w-4 shrink-0" />
              {dFrom ? format(dFrom, "dd/MM/yyyy", { locale: ptBR }) : "De"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dFrom}
              onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : "", to)}
              // Compras estão no passado; oferecer amanhã só gera faixa vazia.
              disabled={(d) => d > new Date()}
              initialFocus
              locale={ptBR}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        <span className="shrink-0 text-sm text-muted-foreground">até</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-9 flex-1 justify-start text-left font-normal",
                !dTo && "text-muted-foreground",
              )}
            >
              <CalendarRange className="mr-2 h-4 w-4 shrink-0" />
              {dTo ? format(dTo, "dd/MM/yyyy", { locale: ptBR }) : "Até"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dTo}
              onSelect={(d) => onChange(from, d ? format(d, "yyyy-MM-dd") : "")}
              disabled={(d) => d > new Date() || (dFrom ? d < dFrom : false)}
              initialFocus
              locale={ptBR}
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>
      {(from || to) && (
        <button
          type="button"
          onClick={() => onChange("", "")}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          Limpar datas
        </button>
      )}
      {/* Só um dos dois preenchido é válido de propósito: "de 01/08 em diante"
          e "até 10/08" são recortes que o usuário pede. */}
      <p className="text-[11px] leading-snug text-muted-foreground">
        Preencha só um dos lados para deixar o outro em aberto.
      </p>
    </div>
  );
}
