import { useSyncExternalStore } from "react";

const assinarRede = (avisar: () => void) => {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
};

/**
 * Se o celular está sem rede agora. Sem internet as consultas do react-query
 * ficam em espera (nem dado, nem erro, nem carregando) e as cópias do site
 * desenham zero ou "sem pedidos": é por isto que as telas avisam.
 * No Android depende da permissão ACCESS_NETWORK_STATE (AndroidManifest).
 */
export const useSemRede = () => useSyncExternalStore(assinarRede, () => !navigator.onLine);
