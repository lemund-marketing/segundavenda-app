/**
 * O supabase-js embrulha QUALQUER resposta não-2xx de edge function num
 * FunctionsHttpError cuja `.message` é sempre a mesma frase — "Edge Function
 * returned a non-2xx status code". O motivo real fica no corpo da resposta,
 * pendurado em `.context`. Sem desembrulhar, a tela mostra um erro que não diz
 * nada: foi exatamente o que aconteceu com o "Erro no escaneamento" em
 * Casos IA, que escondia um simples "sua sessão não é de admin".
 */
export async function mensagemDeErroDeFuncao(
  err: any,
  padrao = "Falha inesperada ao chamar o servidor.",
): Promise<string> {
  const ctx = err?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      // clone() porque o corpo só pode ser lido uma vez — sem isso, um segundo
      // leitor (ou um retry) recebe um stream já consumido.
      const resposta = typeof ctx.clone === "function" ? ctx.clone() : ctx;
      const corpo = await resposta.json();
      const texto = corpo?.error ?? corpo?.message;
      if (typeof texto === "string" && texto.trim()) return texto;
    } catch {
      /* corpo vazio ou não-JSON: cai no texto padrão abaixo */
    }
  }
  const bruto = typeof err?.message === "string" ? err.message : "";
  // A frase genérica do supabase-js não ajuda ninguém — só repassa a mensagem
  // quando ela for de fato específica.
  if (bruto && !bruto.includes("non-2xx")) return bruto;
  return padrao;
}
