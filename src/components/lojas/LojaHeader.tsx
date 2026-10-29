import { useNavigate } from "react-router-dom";
import { ArrowLeft, Medal, Store, TrendingUp, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getInitials, hexToRgba } from "@/components/clients/sections/shared";
import { BolinhaMarca } from "@/components/mobile/blocos";
import { relativeLabel } from "@/utils/relativeDate";
import { cn } from "@/lib/utils";

import { INK_BG, INK_TEXT, LOJA_PERIODS, NAO_PLATAFORMA, fmtInt, useLojaInk } from "./lojaDetailShared";

interface Props {
  slug: string;
  label: string;
  period: string;
  onPeriodChange: (p: string) => void;
  rank: number;
  totalPlataformas: number;
  sharePct: number;
  lastOrderAt: string | null;
  uniqueClients: number;
  loading?: boolean;
}

export function LojaHeader({
  slug,
  label,
  period,
  onPeriodChange,
  rank,
  totalPlataformas,
  sharePct,
  lastOrderAt,
  uniqueClients,
  loading,
}: Props) {
  const navigate = useNavigate();
  const ink = useLojaInk(slug);
  const initials = getInitials(label);

  // Com uma plataforma só, "#1 de 1" é ruído — 39 sellers da base estão nesse caso.
  const showRank = rank > 0 && totalPlataformas > 1;
  const RankIcon = rank === 1 ? Trophy : rank <= 3 ? Medal : TrendingUp;
  const rankClass =
    rank === 1
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25"
      : rank <= 3
        ? "bg-slate-400/10 text-slate-700 dark:text-slate-300 border-slate-400/25"
        : "bg-muted text-muted-foreground border-border";

  const ultimo = relativeLabel(lastOrderAt);

  return (
    <div className="relative rounded-2xl bg-card shadow-sm overflow-hidden" style={ink.vars}>
      {/* Faixa na tinta da plataforma: um valor por tema, senão o preto do TikTok
          fica a 1,08:1 sobre o card escuro e a faixa simplesmente some. */}
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", INK_BG)} aria-hidden />

      <div className="p-4 pl-5 2xl:p-6 2xl:pl-7 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 -ml-2"
            onClick={() => navigate("/lojas")}
            aria-label="Voltar para Lojas"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div
            className={cn(
              "w-11 h-11 2xl:w-14 2xl:h-14 rounded-md flex items-center justify-center text-lg font-bold shrink-0",
              INK_TEXT,
            )}
            style={{ background: hexToRgba(ink.hex, 0.16) }}
          >
            {initials || <Store className="w-5 h-5 2xl:w-6 2xl:h-6" />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight text-foreground truncate">
                {label}
              </h1>
              {showRank && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${rankClass}`}
                >
                  <RankIcon className="w-3 h-3" />#{rank} de {totalPlataformas} lojas
                </span>
              )}
              {NAO_PLATAFORMA.has(slug) && (
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                  Origem sem plataforma
                </span>
              )}
            </div>

            <div className="flex items-center flex-wrap gap-x-1.5 text-sm text-muted-foreground mt-1.5">
              {!loading && sharePct > 0 && (
                <>
                  <span className="font-medium text-foreground tabular-nums">
                    {sharePct.toFixed(1)}% da receita
                  </span>
                  <span aria-hidden>·</span>
                </>
              )}
              {!loading && uniqueClients > 0 && (
                <>
                  <span className="tabular-nums">
                    {fmtInt(uniqueClients)} cliente{uniqueClients === 1 ? "" : "s"}
                  </span>
                  <span aria-hidden>·</span>
                </>
              )}
              <span>Último pedido {lastOrderAt ? ultimo.text : "—"}</span>
            </div>
          </div>
        </div>

        {/* Um seletor só, no cabeçalho, valendo para as quatro abas: período por
            aba faz o cabeçalho dizer 30 dias enquanto a aba mostra 90. */}
        <div className="shrink-0">
          <Select value={period} onValueChange={onPeriodChange}>
            <SelectTrigger className="w-[180px] rounded-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOJA_PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

/**
 * O mesmo cabeçalho no celular (23/10/2026), no desenho das outras telas: o
 * voltar no círculo neutro, a sigla no círculo da marca e o nome grande; embaixo,
 * a posição entre os marketplaces, a fatia da receita e o último pedido. O
 * período e as abas ficam em pílulas logo abaixo, em LojaDetail.
 */
export function LojaHeaderMobile({
  slug,
  label,
  rank,
  totalPlataformas,
  sharePct,
  lastOrderAt,
  loading,
}: Omit<Props, "period" | "onPeriodChange" | "uniqueClients">) {
  const navigate = useNavigate();
  const ink = useLojaInk(slug);
  const showRank = rank > 0 && totalPlataformas > 1;
  const RankIcon = rank === 1 ? Trophy : rank <= 3 ? Medal : TrendingUp;
  const ultimo = relativeLabel(lastOrderAt);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => navigate("/lojas")}
        aria-label="Voltar para Marketplaces"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-card to-muted text-foreground/75 shadow-[0_1px_2px_hsl(var(--foreground)/0.06)] ring-1 ring-inset ring-border/80 active:scale-95"
      >
        <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2} />
      </button>
      <BolinhaMarca cor={ink.hex}>{getInitials(label) || <Store className="h-4 w-4" />}</BolinhaMarca>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-foreground">{label}</h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
          {showRank && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[12px] font-medium text-amber-700 ring-1 ring-inset ring-amber-500/20 dark:text-amber-300">
              <RankIcon className="h-3 w-3" strokeWidth={2.25} />
              {rank}º de {totalPlataformas}
            </span>
          )}
          {NAO_PLATAFORMA.has(slug) && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
              Origem sem plataforma
            </span>
          )}
          {!loading && sharePct > 0 && (
            <span className="tabular-nums">{sharePct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da receita</span>
          )}
        </div>
        {lastOrderAt && (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">Último pedido {ultimo.text}</p>
        )}
      </div>
    </div>
  );
}

export default LojaHeader;
