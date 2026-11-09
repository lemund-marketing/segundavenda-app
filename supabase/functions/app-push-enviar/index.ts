// =====================================================================
// Envia ao celular a notificação de oportunidade de venda (app Android).
//
// Quem chama: o job app_push_coletar (pg_cron, a cada minuto), só quando há
// oportunidade pendente em app_push_enviadas, com x-service-secret. Deploy com
// --no-verify-jwt: o job não manda JWT, e o portão de verdade é o
// autorizadoComoServico (a mesma regra das edges de sistema do site).
//
// O que faz: reserva até 50 oportunidades (app_push_reservar), descobre quem
// recebe em cada loja (app_push_alvos: dono e membros ativos que veem o
// WhatsApp, um dono por token) e manda pelo FCM HTTP v1, um envio por token.
// O texto da tela bloqueada não leva nome, telefone nem o resumo da IA.
//
// Segredo: FCM_SERVICE_ACCOUNT, o JSON inteiro da conta de serviço do
// Firebase (papel Firebase Cloud Messaging API Admin). O token OAuth sai de
// um JWT assinado aqui mesmo com crypto.subtle, sem biblioteca do Google.
//
// Os logs não levam token inteiro nem texto: só ids e a ponta do token.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { autorizadoComoServico } from '../_shared/auth-servico.ts';

const LOTE = 50;
const CONCORRENCIA = 8;
const MAX_TENTATIVAS = 3;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// ---------------------------------------------------------------------
// Texto (decisão do dono). intent_type que não estiver aqui cai em "outro".
// ---------------------------------------------------------------------
const ROTULOS: Record<string, { rotulo: string; frase: string }> = {
  recompra: { rotulo: 'Recompra', frase: 'quer comprar de novo.' },
  cross_sell: { rotulo: 'Cross-sell', frase: 'tem interesse em outro produto.' },
  catalogo: { rotulo: 'Pediu catálogo', frase: 'pediu o catálogo.' },
  variacao: { rotulo: 'Variação', frase: 'perguntou por outra variação.' },
  outro: { rotulo: 'Interesse', frase: 'demonstrou interesse em comprar.' },
};

export function textoDaNotificacao(intent: string, nomeLoja: string): { title: string; body: string } {
  const t = ROTULOS[intent] ?? ROTULOS.outro;
  return { title: `Oportunidade de venda · ${t.rotulo}`, body: `Um cliente de ${nomeLoja} ${t.frase}` };
}

// ---------------------------------------------------------------------
// OAuth2 da conta de serviço (JWT RS256 → access token), guardado em memória
// enquanto o isolate vive, até 5 min antes de vencer.
// ---------------------------------------------------------------------
// Projeto Firebase do google-services.json do app (android/app).
const PROJETO_FIREBASE = 'app-2v-352ef';

interface ContaServico {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
}

function lerContaServico(): ContaServico | null {
  const bruto = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!bruto) return null;
  try {
    const c = JSON.parse(bruto);
    if (!c?.client_email || !c?.private_key || !c?.project_id) return null;
    return c as ContaServico;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlTexto = (t: string) => b64url(new TextEncoder().encode(t));

async function chavePrivada(pem: string): Promise<CryptoKey> {
  const corpo = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    // O painel de segredos do Supabase pode guardar a quebra de linha como \n,
    // \\n ou \r\n literais, conforme foi colada: sai qualquer barra seguida de
    // n/r e, depois, tudo o que não é base64.
    .replace(/\\+[nr]/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');
  if (corpo.length < 100) {
    // Só o formato, nunca o conteúdo: diz o que o segredo trouxe.
    throw new Error(
      `chave privada vazia (private_key ${pem.length} car., BEGIN ${pem.includes('BEGIN')}, END ${pem.includes('END')}, base64 ${corpo.length} car.)`,
    );
  }
  const der = Uint8Array.from(atob(corpo), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

let oauthAtual: { token: string; venceEm: number } | null = null;
let oauthPedido: Promise<string> | null = null;

/**
 * `recusado`: o token que o FCM acabou de recusar com 401. Os envios correm em
 * paralelo; um pedido só ao Google serve a todos, em vez de um por envio.
 */
async function tokenOAuth(conta: ContaServico, recusado?: string): Promise<string> {
  if (oauthAtual && oauthAtual.token !== recusado && oauthAtual.venceEm - 5 * 60_000 > Date.now()) {
    return oauthAtual.token;
  }
  oauthPedido ??= pedirTokenOAuth(conta).finally(() => {
    oauthPedido = null;
  });
  return await oauthPedido;
}

async function pedirTokenOAuth(conta: ContaServico): Promise<string> {
  const agora = Date.now();
  const aud = conta.token_uri || 'https://oauth2.googleapis.com/token';
  const iat = Math.floor(agora / 1000);
  const cabecalho = b64urlTexto(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64urlTexto(
    JSON.stringify({
      iss: conta.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud,
      iat,
      exp: iat + 3600,
    }),
  );
  const assinar = `${cabecalho}.${corpo}`;
  const assinatura = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    await chavePrivada(conta.private_key),
    new TextEncoder().encode(assinar),
  );
  const jwt = `${assinar}.${b64url(new Uint8Array(assinatura))}`;

  const r = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!r.ok) {
    await r.body?.cancel();
    throw new Error(`oauth ${r.status}`);
  }
  const d = await r.json();
  if (!d?.access_token) throw new Error('oauth sem access_token');
  oauthAtual = { token: d.access_token, venceEm: agora + Number(d.expires_in ?? 3600) * 1000 };
  return oauthAtual.token;
}

// ---------------------------------------------------------------------
// FCM
// ---------------------------------------------------------------------
interface Reservada {
  case_id: string;
  conversation_id: string;
  client_id: string;
  seller_id: string;
  intent_type: string;
  tentativas: number;
}
interface Alvo {
  seller_id: string;
  nome_loja: string;
  profile_id: string;
  token: string;
}
type Resultado = 'ok' | 'token_invalido' | 'tentar_de_novo' | 'erro';

const pontaDoToken = (t: string) => `…${t.slice(-6)}`;

interface ErroFcm {
  status?: string;
  message?: string;
  details?: { errorCode?: string; fieldViolations?: { field?: string }[] }[];
}

const codigoDoErro = (erro: ErroFcm | null) =>
  (Array.isArray(erro?.details) ? erro.details : []).find((d) => typeof d?.errorCode === 'string')?.errorCode;

// SENDER_ID_MISMATCH fica de fora de propósito: todo token deste app nasce do
// mesmo google-services.json, então esse erro quase sempre é FCM_SERVICE_ACCOUNT
// de outro projeto. Apagar os tokens ali calaria todos os aparelhos até cada um
// reabrir o app, mesmo depois de corrigir o segredo.
/** O erro do FCM aponta para o token (e não para o resto da mensagem)? */
function erroDoToken(status: number, erro: ErroFcm | null): boolean {
  const detalhes = Array.isArray(erro?.details) ? erro.details : [];
  const codigoFcm = codigoDoErro(erro);
  if (status === 404 || codigoFcm === 'UNREGISTERED') return true;
  if (status === 400) {
    const campos = detalhes.flatMap((d) => (Array.isArray(d?.fieldViolations) ? d.fieldViolations : []));
    if (campos.some((v) => String(v?.field ?? '').includes('token'))) return true;
    if (/registration token/i.test(String(erro?.message ?? ''))) return true;
  }
  return false;
}

function montarMensagem(op: Reservada, alvo: Alvo) {
  const { title, body } = textoDaNotificacao(op.intent_type, alvo.nome_loja);
  return {
    message: {
      token: alvo.token,
      notification: { title, body },
      data: {
        tipo: 'oportunidade',
        rota: `/omnichannel?client_id=${op.client_id}&seller_id=${op.seller_id}`,
        seller_id: op.seller_id,
        conversation_id: op.conversation_id,
        client_id: op.client_id,
        case_id: op.case_id,
      },
      android: {
        priority: 'HIGH',
        ttl: '14400s',
        notification: {
          channel_id: 'oportunidades',
          // Mesma conversa substitui a notificação anterior em vez de empilhar.
          tag: `op:${op.conversation_id}`,
          icon: 'ic_stat_notificacao',
          visibility: 'PRIVATE',
        },
      },
    },
  };
}

async function enviarUm(conta: ContaServico, op: Reservada, alvo: Alvo): Promise<Resultado> {
  const url = `https://fcm.googleapis.com/v1/projects/${conta.project_id}/messages:send`;
  const corpo = JSON.stringify(montarMensagem(op, alvo));
  let recusado: string | undefined;
  for (;;) {
    let acesso: string;
    try {
      acesso = await tokenOAuth(conta, recusado);
    } catch (e) {
      // Chave errada ou Google fora: o aviso volta para a fila (o caso que já
      // saiu por outro token continua 'enviada').
      console.error(`[app-push] oauth: ${(e as Error).message}`);
      return 'tentar_de_novo';
    }
    let r: Response;
    try {
      r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${acesso}`, 'Content-Type': 'application/json' },
        body: corpo,
      });
    } catch (e) {
      console.warn(`[app-push] rede caso=${op.case_id} token=${pontaDoToken(alvo.token)}: ${(e as Error).message}`);
      return 'tentar_de_novo';
    }
    if (r.ok) {
      await r.body?.cancel();
      return 'ok';
    }
    // 401: o access token venceu ou foi revogado antes da hora. Uma renovação só.
    if (r.status === 401 && !recusado) {
      await r.body?.cancel();
      recusado = acesso;
      continue;
    }
    const erro: ErroFcm | null = await r.json().then((d) => d?.error ?? null).catch(() => null);
    if (erroDoToken(r.status, erro)) return 'token_invalido';
    console.warn(
      `[app-push] fcm ${r.status} ${erro?.status ?? ''} ${codigoDoErro(erro) ?? ''} projeto=${conta.project_id} caso=${op.case_id} token=${pontaDoToken(alvo.token)}`,
    );
    if (r.status === 429 || r.status >= 500) return 'tentar_de_novo';
    return 'erro';
  }
}

/** Roda as tarefas com no máximo `n` ao mesmo tempo. */
async function emParalelo<T>(tarefas: (() => Promise<T>)[], n: number): Promise<T[]> {
  const saida: T[] = new Array(tarefas.length);
  let proxima = 0;
  const trabalhador = async () => {
    while (proxima < tarefas.length) {
      const i = proxima++;
      saida[i] = await tarefas[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, tarefas.length) }, trabalhador));
  return saida;
}

// ---------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------
const criarCliente = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
type Supa = ReturnType<typeof criarCliente>;

/** Volta para a fila; quem já gastou as tentativas vira 'falhou'. */
async function devolver(supabase: Supa, ops: Reservada[], motivo: string) {
  const agora = new Date().toISOString();
  const voltam = ops.filter((o) => o.tentativas < MAX_TENTATIVAS).map((o) => o.case_id);
  const desistem = ops.filter((o) => o.tentativas >= MAX_TENTATIVAS).map((o) => o.case_id);
  if (voltam.length) {
    const { error } = await supabase
      .from('app_push_enviadas')
      .update({ status: 'pendente', motivo, processado_em: agora })
      .in('case_id', voltam);
    if (error) console.error('[app-push] devolver para pendente:', error.message);
  }
  if (desistem.length) {
    const { error } = await supabase
      .from('app_push_enviadas')
      .update({ status: 'falhou', motivo, processado_em: agora })
      .in('case_id', desistem);
    if (error) console.error('[app-push] marcar falhou:', error.message);
  }
}

async function marcar(supabase: Supa, ids: string[], status: string, motivo: string | null) {
  if (!ids.length) return;
  const { error } = await supabase
    .from('app_push_enviadas')
    .update({ status, motivo, processado_em: new Date().toISOString() })
    .in('case_id', ids);
  if (error) console.error(`[app-push] marcar ${status}:`, error.message);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabase = criarCliente();
  if (!(await autorizadoComoServico(req, supabase))) return json({ error: 'unauthorized' }, 401);

  // Antes de reservar: sem a conta de serviço nada sai, e o que ficar pendente
  // expira sozinho no coletor.
  const conta = lerContaServico();
  if (!conta) {
    console.error('[app-push] FCM_SERVICE_ACCOUNT ausente ou inválido');
    return json({ error: 'fcm_nao_configurado' }, 500);
  }
  // Só avisa: se o projeto mudar de propósito, basta trocar a constante.
  if (conta.project_id !== PROJETO_FIREBASE) {
    console.warn(`[app-push] FCM_SERVICE_ACCOUNT é do projeto ${conta.project_id}, o app usa ${PROJETO_FIREBASE}`);
  }

  const { data: reservadas, error: erroReserva } = await supabase.rpc('app_push_reservar', { limite: LOTE });
  if (erroReserva) {
    // O que a chamada chegou a reservar fica 'enviando' e o coletor devolve em 3 min.
    console.error('[app-push] reservar:', erroReserva.message);
    return json({ error: 'reservar' }, 500);
  }
  const ops = (reservadas ?? []) as Reservada[];
  if (!ops.length) return json({ reservadas: 0 });

  const sellerIds = [...new Set(ops.map((o) => o.seller_id))];
  const { data: alvosBrutos, error: erroAlvos } = await supabase.rpc('app_push_alvos', { seller_ids: sellerIds });
  if (erroAlvos) {
    console.error('[app-push] alvos:', erroAlvos.message);
    await devolver(supabase, ops, 'erro_alvos');
    return json({ error: 'alvos' }, 500);
  }
  const alvosPorLoja = new Map<string, Alvo[]>();
  for (const a of (alvosBrutos ?? []) as Alvo[]) {
    const lista = alvosPorLoja.get(a.seller_id) ?? [];
    lista.push(a);
    alvosPorLoja.set(a.seller_id, lista);
  }

  const semAparelho: string[] = [];
  const envios: { op: Reservada; alvo: Alvo }[] = [];
  for (const op of ops) {
    const alvos = alvosPorLoja.get(op.seller_id) ?? [];
    if (!alvos.length) semAparelho.push(op.case_id);
    for (const alvo of alvos) envios.push({ op, alvo });
  }

  const resultados = await emParalelo(
    envios.map((e) => () => enviarUm(conta, e.op, e.alvo)),
    CONCORRENCIA,
  );

  const porCaso = new Map<string, Resultado[]>();
  const tokensInvalidos = new Set<string>();
  envios.forEach((e, i) => {
    const lista = porCaso.get(e.op.case_id) ?? [];
    lista.push(resultados[i]);
    porCaso.set(e.op.case_id, lista);
    if (resultados[i] === 'token_invalido') tokensInvalidos.add(e.alvo.token);
  });

  const enviadas: string[] = [];
  const soTokenInvalido: string[] = [];
  const falharam: string[] = [];
  const paraDevolver: Reservada[] = [];
  for (const op of ops) {
    const rs = porCaso.get(op.case_id);
    if (!rs) continue; // sem aparelho
    if (rs.includes('ok')) enviadas.push(op.case_id);
    else if (rs.includes('tentar_de_novo')) paraDevolver.push(op);
    else if (rs.every((r) => r === 'token_invalido')) soTokenInvalido.push(op.case_id);
    else falharam.push(op.case_id);
  }

  // Celular desinstalou o app ou trocou de projeto: o token não volta a valer.
  if (tokensInvalidos.size) {
    const { error } = await supabase.from('app_push_aparelhos').delete().in('token', [...tokensInvalidos]);
    if (error) console.error('[app-push] apagar tokens inválidos:', error.message);
  }

  await marcar(supabase, enviadas, 'enviada', null);
  await marcar(supabase, semAparelho, 'sem_aparelho', null);
  await marcar(supabase, soTokenInvalido, 'sem_aparelho', 'tokens_invalidos');
  await marcar(supabase, falharam, 'falhou', 'fcm_recusou');
  await devolver(supabase, paraDevolver, 'fcm_indisponivel');

  const resumo = {
    reservadas: ops.length,
    envios: envios.length,
    enviadas: enviadas.length,
    sem_aparelho: semAparelho.length + soTokenInvalido.length,
    falharam: falharam.length,
    devolvidas: paraDevolver.length,
    tokens_apagados: tokensInvalidos.size,
  };
  console.log('[app-push]', JSON.stringify(resumo));
  return json(resumo);
});
