import { useEffect, useState } from "react";

/**
 * Minutos que faltam para fechar a janela de 24h do WhatsApp, contados a partir
 * da ultima mensagem DO CLIENTE. Retorna 0 quando a janela ja fechou ou quando o
 * cliente nunca respondeu.
 *
 * Recalcula a cada 60s: a lista de conversas fica aberta o dia inteiro e um
 * numero congelado no valor da montagem mentiria em poucos minutos.
 */
export function useWindowCountdown(lastInboundAt: string | Date | null | undefined) {
  const compute = () => {
    if (!lastInboundAt) return 0;
    const last = new Date(lastInboundAt).getTime();
    if (isNaN(last)) return 0;
    const elapsed = (Date.now() - last) / 60000;
    return Math.max(0, 1440 - elapsed);
  };

  const [minutesRemaining, setMinutesRemaining] = useState<number>(compute);

  useEffect(() => {
    const atual = compute();
    setMinutesRemaining(atual);
    // Janela ja fechada (o caso de ~99% da lista, que nao e virtualizada): nao ha o
    // que contar. Sem esta saida cada card mantinha um timer proprio acordando o
    // React de minuto em minuto para reescrever o mesmo zero.
    if (atual <= 0) return;
    const id = setInterval(() => {
      const proximo = compute();
      setMinutesRemaining(proximo);
      if (proximo <= 0) clearInterval(id);
    }, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInboundAt]);

  return minutesRemaining;
}

/** "23h", "2h 30m", "45min". */
export function formatRemaining(minutes: number): string {
  if (minutes <= 0) return "0min";
  if (minutes < 60) return `${Math.ceil(minutes)}min`;
  // Arredonda antes de quebrar em h/min: sem isso 1319,97min (uma resposta que
  // acabou de chegar ha 2h) caia para "21h" em vez de "22h".
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  // Abaixo de 6h os minutos ainda importam para decidir se da tempo de responder.
  if (h < 6 && m > 0) return `${h}h ${m}m`;
  return `${h}h`;
}
