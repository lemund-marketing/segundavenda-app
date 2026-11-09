// Autenticação das functions de sistema (as que rodam por cron ou à mão, nunca
// pelo navegador do cliente).
//
// POR QUE NÃO BASTA verify_jwt: a anon key é um JWT válido e assinado pelo
// projeto. Uma função com verify_jwt=true e nenhuma checagem interna é, na
// prática, pública — basta um curl com a chave que está no bundle do frontend.
// Foi assim que monitor-seller-captures ficou invocável por qualquer um.
//
// Dois caminhos aceitos:
//   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//   x-service-secret: <SERVICO_SECRET, ou system_secrets.cron_secret>
//
// O segundo existe porque SUPABASE_SERVICE_ROLE_KEY neste projeto foi
// sobrescrito como secret customizado e não é mais igual à chave JWT que o
// gateway aceita — sem ele, não há como invocar estas funções nem para testar.
//
// ⚠️ SEGREDO DE VALOR CONHECIDO NÃO É SEGREDO. Neste projeto
// system_secrets.cron_secret é a string literal 'NEUTRALIZADO', 12 caracteres.
// Com ela mais a anon key — as duas públicas, uma está no bundle do frontend —
// dava para rodar o ciclo inteiro de check-alertas-board e ler nome e e-mail de
// todos os clientes com incidente. E no dia em que a chave do Board existir,
// essa mesma senha de valor conhecido autorizaria board-simular, cuja função é
// justamente postar um exemplar de cada tipo de tarefa NO CRM REAL.
//
// Por isso o valor é VALIDADO antes de ser aceito: placeholder conhecido e
// segredo curto não autenticam ninguém, venham da env ou da tabela.
//
// Para habilitar este caminho, defina SERVICO_SECRET (ou troque
// system_secrets.cron_secret) por um valor aleatório de 32+ caracteres.

/** Valores de base neutralizada/placeholder. Nunca autenticam. */
const PROIBIDOS = new Set([
  'neutralizado',
  'changeme',
  'change-me',
  'placeholder',
  'todo',
  'secret',
  'test',
  'teste',
  'admin',
  'null',
  'undefined',
]);

/** Curto demais para resistir a força bruta contra um endpoint público. */
const TAMANHO_MINIMO = 24;

export function segredoUtilizavel(v: string | null | undefined): boolean {
  if (!v) return false;
  const t = v.trim();
  if (t.length < TAMANHO_MINIMO) return false;
  if (PROIBIDOS.has(t.toLowerCase())) return false;
  return true;
}

/** Comparação de tempo constante: não vaza o prefixo correto por timing. */
function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function autorizadoComoServico(req: Request, supabase: any): Promise<boolean> {
  const esperado = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const enviadoAuth = req.headers.get('Authorization') || '';
  if (segredoUtilizavel(esperado) && iguais(enviadoAuth, `Bearer ${esperado}`)) return true;

  const enviado = (req.headers.get('x-service-secret') || '').trim();
  if (!segredoUtilizavel(enviado)) return false;

  // Env antes da tabela: dá um caminho de configuração que não depende de
  // ninguém lembrar de trocar a linha de system_secrets.
  const doEnv = Deno.env.get('SERVICO_SECRET');
  if (segredoUtilizavel(doEnv) && iguais(enviado, doEnv!)) return true;

  const { data, error } = await supabase
    .from('system_secrets')
    .select('cron_secret')
    .eq('id', 1)
    .maybeSingle();
  if (error) return false;

  const daTabela: string | null = data?.cron_secret ?? null;
  if (!segredoUtilizavel(daTabela)) {
    console.warn(
      '[AUTH] system_secrets.cron_secret é placeholder ou curto demais — recusado. ' +
        'Defina SERVICO_SECRET com 32+ caracteres aleatórios para habilitar este caminho.',
    );
    return false;
  }
  return iguais(enviado, daTabela!);
}
