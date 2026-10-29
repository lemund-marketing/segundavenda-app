import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { callRpcScalar } from "@/hooks/rpc";

/**
 * Trava de "número errado" (migration 20261013190000_numeros_errados.sql).
 *
 * Quem respondeu "Não sou eu" / "Número errado" fica marcado por CLIENTE +
 * TELEFONE em `public.numeros_errados`, e o motor deixa de mandar WhatsApp e
 * SMS para aquele par. A marca de botão ou texto claro vale em todas as lojas
 * (`escopo = 'global'`); a que veio só da IA vale na loja onde foi informada
 * (`escopo = 'loja'`). A tela só LÊ a tabela (RLS: admin e membros das lojas
 * do cliente) e desfaz pela RPC `numero_errado_desfazer`.
 */

export type NumeroErradoFonte = "botao" | "texto" | "ia" | "no" | "admin" | "backfill";
export type NumeroErradoEscopo = "global" | "loja";

export interface NumeroErrado {
  id: string;
  client_id: string;
  /** Sempre `numero_errado_telefone(...)`: 55 + DDD + 9º dígito. */
  telefone: string;
  seller_id: string | null;
  escopo: NumeroErradoEscopo;
  fonte: NumeroErradoFonte;
  classificacao: string | null;
  resposta: string | null;
  criado_em: string;
}

const COLUNAS = "id, client_id, telefone, seller_id, escopo, fonte, classificacao, resposta, criado_em";

type RespostaPostgrest<T> = PromiseLike<{
  data: T | null;
  error: { code?: string; message: string } | null;
}>;

/**
 * `types.ts` não conhece a tabela (não regeneramos o arquivo). Em vez de
 * `(supabase as any)`, o escape fica restrito à cadeia exata usada aqui —
 * mesma ideia do `callRpc` em hooks/rpc.ts.
 */
const tabela = supabase as unknown as {
  from: (t: "numeros_errados") => {
    select: (colunas: string) => {
      eq: (coluna: "client_id", valor: string) => {
        is: (coluna: "desfeito_em", valor: null) => {
          order: (coluna: "criado_em", opcoes: { ascending: boolean }) => RespostaPostgrest<NumeroErrado[]>;
        };
      };
    };
  };
};

/** Espelho de `public.normalize_br_contact_phone` (20260801140000): 55 + 9º dígito. */
function normalizarBr(raw: string | null | undefined): string | null {
  let v = (raw ?? "").replace(/\D/g, "");
  if (!v) return null;
  if (!v.startsWith("55") && (v.length === 10 || v.length === 11)) v = "55" + v;
  if (v.length === 12 && v.startsWith("55") && v[4] >= "6" && v[4] <= "9") {
    v = v.slice(0, 4) + "9" + v.slice(4);
  }
  return v;
}

/**
 * Espelho de `public.numero_errado_telefone` (migration 20261013190000), que é
 * como o banco grava `numeros_errados.telefone`: normalize_br_contact_phone, DDD
 * 55 sem DDI (10/11 dígitos começando com 55) ganha o 55 do país, e só vale de
 * 12 a 15 dígitos. Precisa ser a MESMA conta do banco, senão a etiqueta some num
 * cliente que o motor está barrando.
 */
export function normalizarTelefoneBr(raw: string | null | undefined): string | null {
  let v = normalizarBr(raw);
  if (v && /^55\d{8,9}$/.test(v)) v = normalizarBr("55" + v);
  return v && /^\d{12,15}$/.test(v) ? v : null;
}

export const FONTE_NUMERO_ERRADO: Record<NumeroErradoFonte, { curto: string; longo: string }> = {
  botao: { curto: "Botão", longo: "Clicou no botão de número errado" },
  texto: { curto: "Texto", longo: "Escreveu que o número não é dela" },
  ia: { curto: "IA", longo: "A IA entendeu a resposta como número errado" },
  no: { curto: "Fluxo", longo: "Caiu no ramo de número errado do fluxo" },
  admin: { curto: "Equipe", longo: "Marcado à mão pela equipe" },
  backfill: { curto: "Histórico", longo: "Resposta antiga, carregada do histórico" },
};

export const ESCOPO_NUMERO_ERRADO: Record<NumeroErradoEscopo, string> = {
  global: "Todas as lojas",
  loja: "Só esta loja",
};

const chave = (clientId: string | null | undefined) => ["numero-errado", clientId ?? null] as const;

/**
 * Marca ATIVA que vale para este cliente, nesta loja, num dos telefones dados.
 *
 * Só conta a marca do telefone que está em uso: se o cliente trocou de número,
 * a marca antiga não barra mais nada e a etiqueta vermelha ali seria mentira.
 * Entre global e loja, a global vem primeiro (é a que diz "todas as lojas").
 */
export function useNumeroErrado(
  clientId: string | null | undefined,
  sellerId: string | null | undefined,
  telefones: Array<string | null | undefined>,
) {
  const query = useQuery({
    queryKey: chave(clientId),
    queryFn: async (): Promise<NumeroErrado[]> => {
      const { data, error } = await tabela
        .from("numeros_errados")
        .select(COLUNAS)
        .eq("client_id", clientId!)
        .is("desfeito_em", null)
        .order("criado_em", { ascending: true });
      if (error) {
        // Front publicado antes da migration (ou sem permissão de leitura): a
        // etiqueta é informativa, não pode derrubar o cabeçalho do cliente.
        console.warn("[numeros_errados] leitura falhou:", error.code, error.message);
        return [];
      }
      return data ?? [];
    },
    enabled: !!clientId,
    staleTime: 60_000,
  });

  const chaveTelefones = telefones.map(normalizarTelefoneBr).filter(Boolean).join("|");

  const marca = useMemo<NumeroErrado | null>(() => {
    const alvos = new Set(chaveTelefones ? chaveTelefones.split("|") : []);
    if (alvos.size === 0) return null;
    const aplicaveis = (query.data ?? []).filter(
      (m) => alvos.has(m.telefone) && (m.escopo === "global" || (!!sellerId && m.seller_id === sellerId)),
    );
    return aplicaveis.find((m) => m.escopo === "global") ?? aplicaveis[0] ?? null;
  }, [query.data, chaveTelefones, sellerId]);

  return { marca, isLoading: query.isLoading };
}

/** Desfaz a marca (RPC confere admin/membro da loja). Recarrega a etiqueta e o aviso. */
export function useDesfazerNumeroErrado(clientId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, motivo }: { id: string; motivo: string }) => {
      await callRpcScalar<null>("numero_errado_desfazer", { p_id: id, p_motivo: motivo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chave(clientId) });
    },
  });
}
