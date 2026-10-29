import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/** O usuário logado é afiliado ativo? Decide se o item "Afiliados" aparece no menu. */
export function useEhAfiliado(): boolean {
  const { user } = useAuth();
  const [ehAfiliado, setEhAfiliado] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("affiliates")
        .select("status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      setEhAfiliado(!!data);
    })();
  }, [user]);

  return ehAfiliado;
}
