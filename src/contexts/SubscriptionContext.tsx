import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface SubscriptionData {
  subscribed: boolean;
  plan_type?: string;
  billing_interval?: string;
  /**
   * Compatibilidade com bundle antigo: a `check-subscription` devolve aqui o MESMO valor de
   * `limite_mensal`. Código novo lê `limite_mensal`.
   */
  client_limit?: number;
  /** Teto do mês: `subscriptions.limite_mensal`, calculado no banco. */
  limite_mensal?: number;
  /** Total do contrato (mensal × meses do intervalo). Não é régua de tela. */
  client_limit_contrato?: number;
  /** Pedidos capturados no ciclo mensal [captura_ciclo_inicio, captura_ciclo_fim). */
  current_client_count?: number;
  captura_ciclo_inicio?: string | null;
  /** Exclusivo: é o instante em que o contador zera. */
  captura_ciclo_fim?: string | null;
  /**
   * Total capturado somando todos os meses (antes do ciclo + ciclo corrente),
   * mesma régua do contador mensal. null = ainda não calculado: não mostrar.
   */
  captura_total?: number | null;
  subscription_end?: string;
  is_enterprise?: boolean;
  can_add_clients?: boolean;
  payment_overdue?: boolean;
  subscription_status?: string;
  loading: boolean;
}

interface SubscriptionContextType extends SubscriptionData {
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscription must be used within SubscriptionProvider");
  }
  return context;
};

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData>({
    subscribed: false,
    loading: true,
  });

  const fetchSubscription = async () => {
    if (!user) {
      setSubscriptionData({ subscribed: false, loading: false });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");

      if (error) {
        console.error("Error checking subscription:", error);
        setSubscriptionData({ subscribed: false, loading: false });
        return;
      }

      setSubscriptionData({
        ...data,
        loading: false,
      });
    } catch (error) {
      console.error("Error fetching subscription:", error);
      setSubscriptionData({ subscribed: false, loading: false });
    }
  };

  useEffect(() => {
    fetchSubscription();

    // DESABILITADO: Polling constante estava sobrecarregando o Supabase
    // Subscription só atualiza quando muda de usuário
    // const interval = setInterval(fetchSubscription, 60000);
    // return () => clearInterval(interval);

    // `user?.id` e nao `user`: o supabase-js emite SIGNED_IN ao voltar para a aba com um
    // objeto `user` novo de mesmo id — depender do objeto invocava `check-subscription`
    // a cada troca de aba.
  }, [user?.id]);

  const value: SubscriptionContextType = {
    ...subscriptionData,
    refreshSubscription: fetchSubscription,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
