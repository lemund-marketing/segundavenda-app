/**
 * Nome de arquivo -> chave de Storage.
 *
 * O Supabase recusa a chave inteira ("Invalid key") quando ela sai de um
 * conjunto ASCII estreito: `\w` na validação dele NÃO tem a flag unicode, então
 * qualquer acento derruba o upload. Em português isso não é caso de borda — foi
 * "Envelopes Plásticos.jpeg" que quebrou em produção, e "Cartão", "Endereço",
 * "Promoção" quebrariam igual.
 *
 * Aqui a saída fica de propósito num subconjunto menor do que o Supabase aceita
 * (só `A-Z a-z 0-9 . _ -`): não preciso acertar a fronteira exata da validação
 * dele para ficar seguro dela, e chave sem espaço nem símbolo também sobrevive
 * inteira dentro de uma URL assinada.
 *
 * O nome ORIGINAL não se perde: quem chama guarda ele em `media_filename`, que é
 * o que o cliente vê e o que vai para o WhatsApp.
 */

// \u0300-\u036f e a faixa de acentos combinantes que o NFD separa da letra.
// Escapado, e não com os caracteres literais: combinante solto num arquivo-fonte
// se cola no caractere anterior e some da revisão.
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const limpar = (s: string) =>
  s
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

/** Comprimento de sobra: a chave ainda leva pasta do seller e timestamp. */
const MAX_BASE = 60;
const MAX_EXT = 12;

/**
 * Devolve um nome utilizável como chave. Nome que vira vazio depois da limpeza
 * (só emoji, só símbolos) cai no `fallback` — chave vazia é erro do mesmo jeito.
 */
export const nomeSeguroParaChave = (nome?: string | null, fallback = "arquivo"): string => {
  const cru = semAcento((nome ?? "").trim());
  const ponto = cru.lastIndexOf(".");
  const temExtensao = ponto > 0 && ponto < cru.length - 1;

  const base = limpar(temExtensao ? cru.slice(0, ponto) : cru).slice(0, MAX_BASE) || fallback;
  const ext = temExtensao ? limpar(cru.slice(ponto + 1)).slice(0, MAX_EXT) : "";

  return ext ? `${base}.${ext}` : base;
};

/**
 * Só a extensão, para quem monta a chave com UUID e não quer o nome do usuário.
 *
 * O `split('.').pop()` que existia nos uploaders de mídia devolvia o NOME
 * INTEIRO quando o arquivo não tinha ponto — um "Envelopes Plásticos" sem
 * extensão virava `uuid.Envelopes Plásticos` e caía no mesmo Invalid key.
 */
export const extensaoSegura = (nome: string | null | undefined, padrao: string): string => {
  const cru = semAcento((nome ?? "").trim());
  const ponto = cru.lastIndexOf(".");
  if (ponto <= 0 || ponto === cru.length - 1) return padrao;
  const ext = cru.slice(ponto + 1).replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, MAX_EXT);
  return ext || padrao;
};
