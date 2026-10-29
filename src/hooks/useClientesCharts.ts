import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  withoutPeriod,
  type ClientesFilterPayload,
} from "@/components/clients/clientesFilters";
import { filtersKey } from "@/hooks/useClientesKpis";

const CHART_STALE_TIME = 5 * 60_000;

export interface StoreDistributionRow {
  store_key: string | null;
  client_count: number;
  revenue: number;
}

export interface GrowthSeriesPoint {
  /** Primeiro dia do mês, como `date` do Postgres (ex.: "2026-07-01"). */
  mes: string;
  novos: number;
  acumulado: number;
}

export interface GenderDistributionRow {
  gender: "Masculino" | "Feminino";
  client_count: number;
}

export interface AgeDistributionRow {
  age_range: "-24" | "25-34" | "35-49" | "50-64" | "65+";
  client_count: number;
}

export interface ClientesDemografia {
  gender: GenderDistributionRow[];
  age: AgeDistributionRow[];
}

/**
 * Quantos clientes e quanta receita por marketplace, dentro do recorte.
 *
 * `enabled` existe para quem esconde a aba "Lojas" (a tela travada numa loja):
 * sem ele a RPC continuaria rodando a cada troca de período para desenhar um
 * gráfico que ninguém vê.
 */
export function useStoreDistribution(
  sellerId: string | null | undefined,
  periodStart: string,
  filters: ClientesFilterPayload = {},
  enabled = true,
) {
  return useQuery<StoreDistributionRow[]>({
    queryKey: ["clientes-store-distribution", sellerId, periodStart, filtersKey(filters)],
    enabled: !!sellerId && enabled,
    staleTime: CHART_STALE_TIME,
    queryFn: async (): Promise<StoreDistributionRow[]> => {
      const { data, error } = await (supabase as any).rpc("get_clients_store_distribution", {
        _seller_id: sellerId,
        _period_start: periodStart,
        _filters: filters,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        store_key: row.store_key ?? null,
        client_count: Number(row.client_count ?? 0),
        revenue: Number(row.revenue ?? 0),
      }));
    },
  });
}

/**
 * Novos clientes por mês e o acumulado da base, dentro do recorte de PERFIL.
 *
 * O período não entra aqui de propósito (a migration avisa no corpo da RPC):
 * recortar por `periodStart` transformaria "novos" em "quem comprou dentro do
 * período" e a curva histórica desabaria para zero nos meses antigos.
 */
export function useGrowthSeries(
  sellerId: string | null | undefined,
  months = 6,
  filters: ClientesFilterPayload = {},
) {
  const semPeriodo = withoutPeriod(filters);
  return useQuery<GrowthSeriesPoint[]>({
    queryKey: ["clientes-growth-series", sellerId, months, filtersKey(semPeriodo)],
    enabled: !!sellerId,
    staleTime: CHART_STALE_TIME,
    queryFn: async (): Promise<GrowthSeriesPoint[]> => {
      const { data, error } = await (supabase as any).rpc("get_clients_growth_series", {
        _seller_id: sellerId,
        _months: months,
        _filters: semPeriodo,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        mes: String(row.mes),
        novos: Number(row.novos ?? 0),
        acumulado: Number(row.acumulado ?? 0),
      }));
    },
  });
}

/**
 * Gênero e faixa etária DO RECORTE, numa RPC só.
 *
 * Não dá para reaproveitar `get_dashboard_gender_distribution` /
 * `_age_distribution`: são do Dashboard, têm assinatura `_seller_ids uuid[]` e
 * outra tela depende delas. A normalização do gênero (6 grafias em `clients`)
 * é a mesma do filtro, senão o gráfico contaria menos gente do que a lista.
 */
export function useClientesDemografia(
  sellerId: string | null | undefined,
  filters: ClientesFilterPayload = {},
) {
  return useQuery<ClientesDemografia>({
    queryKey: ["clientes-demografia", sellerId, filtersKey(filters)],
    enabled: !!sellerId,
    staleTime: CHART_STALE_TIME,
    queryFn: async (): Promise<ClientesDemografia> => {
      const { data, error } = await (supabase as any).rpc("get_clientes_demografia", {
        _seller_id: sellerId,
        _filters: filters,
      });
      if (error) throw error;
      const raw = (data ?? {}) as { gender?: any[]; age?: any[] };
      return {
        gender: (raw.gender ?? []).map((row) => ({
          gender: row.gender as GenderDistributionRow["gender"],
          client_count: Number(row.client_count ?? 0),
        })),
        age: (raw.age ?? []).map((row) => ({
          age_range: row.age_range as AgeDistributionRow["age_range"],
          client_count: Number(row.client_count ?? 0),
        })),
      };
    },
  });
}
