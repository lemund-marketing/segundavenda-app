import { supabase } from "@/integrations/supabase/client";

/** Linha crua devolvida por uma RPC, antes da normalização. */
export type RpcRow = Record<string, unknown>;

/**
 * Chamada de RPC para funções que ainda não estão nos tipos gerados do
 * Supabase. O projeto vinha resolvendo isso com `(supabase as any).rpc(...)`,
 * que desliga o checador no ponto exato em que ele seria útil; aqui o escape
 * fica confinado a esta função e o resto do código trabalha com `unknown`.
 */
export async function callRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcRow[]> {
  const client = supabase as unknown as {
    rpc: (
      f: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };

  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data as RpcRow[] | null) ?? [];
}

/**
 * Variante para RPC que devolve `jsonb` escalar (get_state_detail,
 * get_dashboard_crm_funnel). Nesses casos o PostgREST entrega o objeto direto,
 * não um array de linhas — passar pelo callRpc daria um "array" que não é array
 * e quebraria no primeiro .map().
 */
export async function callRpcScalar<T>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const client = supabase as unknown as {
    rpc: (
      f: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };

  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(error.message);
  return (data as T | null) ?? null;
}

/** Postgres serializa `numeric` como string no JSON — normaliza de uma vez. */
export const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);

/** Texto opcional: string vazia e null viram null. */
export const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
