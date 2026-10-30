import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface WhatsAppCloudInstance {
  id: string;
  waba_id: string;
  phone_number_id: string;
  business_phone_number: string;
  label: string;
  display_name: string | null;
  waba_name: string | null;
  is_default: boolean;
  status: string;
  seller_id: string;
  dispatch_enabled?: boolean;
  dispatch_disabled_reason?: string | null;
}


/**
 * @param sellerIdParam quando o chamador já sabe de qual seller são os números
 *   (o modal de teste recebe o seller por prop), passe aqui. Sem ele o hook
 *   descobre o seller pelo usuário logado — e esse lookup devolve UMA linha
 *   arbitrária para quem é membro de mais de um seller.
 */
export function useWhatsAppCloudInstances(sellerIdParam?: string) {
  const { user } = useAuth();
  const [instances, setInstances] = useState<WhatsAppCloudInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellerId, setSellerId] = useState<string | null>(null);

  const loadInstances = async () => {
    // Com sellerIdParam não precisamos do usuário para descobrir o seller;
    // a RLS continua barrando seller de outro dono (devolve zero linhas).
    if (!user && !sellerIdParam) {
      setInstances([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Get seller_id
      let targetSellerId = sellerIdParam || null;
      if (!targetSellerId) {
        const { data: sellerMember } = await supabase
          .from('seller_members')
          .select('seller_id')
          .eq('profile_id', user!.id)
          .limit(1)
          .single();

        if (!sellerMember) {
          setInstances([]);
          setLoading(false);
          return;
        }

        targetSellerId = sellerMember.seller_id;
      }

      setSellerId(targetSellerId);

      // Fetch all WhatsApp Cloud instances for this seller
      const { data, error } = await (supabase as any)
        .from('whatsapp_cloud_instances')
        // Colunas explícitas, e não '*': a tabela guarda access_token em texto puro,
        // access_token_encrypted, webhook_verify_token e two_step_pin_encrypted, e a
        // RLS não restringe coluna — com '*' o token permanente da WABA descia para o
        // navegador. Este hook agora roda em toda visita a /workflows, o que tornava
        // o vazamento rotineiro em vez de eventual.
        .select('id, waba_id, phone_number_id, business_phone_number, label, display_name, waba_name, is_default, status, seller_id, dispatch_enabled, dispatch_disabled_reason')
        .eq('seller_id', targetSellerId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;

      setInstances(data || []);
    } catch (error) {
      console.error('Error loading WhatsApp Cloud instances:', error);
      setInstances([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstances();
  }, [user, sellerIdParam]);

  const getDefaultInstance = () => {
    return instances.find(i => i.is_default) || instances[0] || null;
  };

  const getInstanceById = (id: string) => {
    return instances.find(i => i.id === id) || null;
  };

  return {
    instances,
    loading,
    sellerId,
    refresh: loadInstances,
    getDefaultInstance,
    getInstanceById,
  };
}
