import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSellerContext } from "@/contexts/SellerContext";
import { useToast } from "@/hooks/use-toast";
import type { Workflow } from "@/types/workflow";

/**
 * As consultas da tela Automações, tiradas de dentro da página do site
 * (src/pages/Workflows.tsx): a lista de automações da loja e o ligar/pausar.
 * Mesma consulta, mesma gravação e os mesmos avisos de lá.
 */

const chaveLista = (sellerId: string | undefined) => ["automacoes", sellerId] as const;

/** Até 100 automações da loja, das mais novas para as mais antigas (o teto do site). */
export function useListaAutomacoes(sellerId: string | undefined) {
  return useQuery<Workflow[]>({
    queryKey: chaveLista(sellerId),
    enabled: !!sellerId,
    // O site recarrega a lista quando a página ganha foco: uma automação
    // pausada ou editada no computador aparece ao voltar para o app.
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .eq("seller_id", sellerId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Workflow[];
    },
  });
}

/**
 * Liga ou pausa uma automação, como o switch do site: grava `active`, recarrega
 * a lista e, ao pausar, avisa o alerta externo de workflow (o mesmo webhook que
 * o site chama). `salvando` guarda os ids em gravação para o switch não aceitar
 * um segundo toque no meio.
 */
export function useLigarPausar() {
  const { activeSeller } = useSellerContext();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [salvando, setSalvando] = useState<ReadonlySet<string>>(new Set());
  // O estado desenha o switch travado; o ref barra o segundo toque que chega
  // antes do novo desenho.
  const emGravacao = useRef(new Set<string>());

  const marcar = (id: string, gravando: boolean) => {
    if (gravando) emGravacao.current.add(id);
    else emGravacao.current.delete(id);
    setSalvando((atual) => {
      const novo = new Set(atual);
      if (gravando) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  };

  const alternar = async (workflow: Workflow) => {
    if (emGravacao.current.has(workflow.id)) return;
    const newActiveState = !workflow.active;
    marcar(workflow.id, true);
    const { error } = await supabase.from("workflows").update({ active: newActiveState }).eq("id", workflow.id);
    marcar(workflow.id, false);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }

    // O site troca o estado na hora e recarrega a lista em seguida.
    queryClient.setQueryData<Workflow[]>(chaveLista(activeSeller?.id), (lista) =>
      lista?.map((w) => (w.id === workflow.id ? { ...w, active: newActiveState } : w)),
    );
    void queryClient.invalidateQueries({ queryKey: chaveLista(activeSeller?.id) });
    toast({ title: newActiveState ? "Workflow ativado" : "Workflow pausado" });

    // Pausa manual: o site avisa o webhook de alerta de workflow.
    if (!newActiveState) {
      try {
        const pausePayload = JSON.stringify({
          nome: activeSeller?.name || activeSeller?.id || "desconhecido",
          seller_id: activeSeller?.id,
          workflow_id: workflow.id,
          workflow_nome: workflow.name,
          reason: "MANUAL_PAUSE: Workflow pausado manualmente pelo usuário",
          source: "frontend-manual-toggle",
          paused_at: new Date().toISOString(),
        });
        fetch("https://api-hook.segundavenda.com.br/webhook/alerta-workflow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: pausePayload,
          mode: "no-cors",
        }).catch((err) => console.error("Failed to notify alerta-workflow:", err));
      } catch (err) {
        console.error("Failed to build manual pause payload:", err);
      }
    }

    // Ligar um fluxo de Disparo Retroativo não dispara nada: o aviso diz onde
    // fica. No site o texto aponta o card do gatilho, que no celular não recebe
    // toque; aqui aponta o botão Disparar do fluxo aberto.
    if (newActiveState && (workflow.nodes ?? []).some((n) => n.type === "retroactive-trigger")) {
      toast({
        title: "Fluxo ativo",
        description: 'Para disparar ou acompanhar o progresso, abra o fluxo e toque em "Disparar".',
      });
    }
  };

  return { alternar, salvando };
}
