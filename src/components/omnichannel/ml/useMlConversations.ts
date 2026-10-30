import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  envioIncerto,
  falhaTalvezEmCurso,
  JANELA_ENVIO_EM_CURSO_MS,
  mensagemDeErroDaEdge,
  mesmoTextoMl,
  tempoMl,
  tentativaApareceu,
  type MlAbrirResposta,
  type MlConversa,
  type TentativaEnvioMl,
} from "./mlTipos";

/**
 * `seller_hub_vinculos` e `ml_conversas` não existem no `types.ts` gerado, então
 * o cliente tipado recusa o nome da tabela. Um único ponto de escape
 * documentado (molde: UserChannelsTab.tsx), em vez de `as any` em cada consulta.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbSemTipo = supabase as any;

const TAMANHO_PAGINA = 30;
const UM_DIA_MS = 86400000;

/**
 * Último "sincronizar" disparado por seller. Fica no módulo, e não no hook, para
 * sobreviver à desmontagem: ir e voltar da aba WhatsApp não pode virar uma
 * chamada ao hub a cada visita — no máximo uma por minuto por seller. O cron
 * (`ml-suporte-sync`) já roda a cada minuto; isto só adianta a primeira olhada.
 */
const ultimoSincronizar = new Map<string, number>();
const INTERVALO_SINCRONIZAR_MS = 60_000;

/** Tira o que quebra o `.or()` do PostgREST (vírgula, parênteses, aspas, curinga). */
const termoSeguro = (bruto: string) =>
  (bruto || "").replace(/[,()"'*%\\]/g, " ").replace(/\s+/g, " ").trim();

const casaBusca = (c: MlConversa, termo: string) => {
  const t = termo.toLowerCase();
  return [c.comprador_nome, c.pedido_ml, c.pack_id, c.produto_titulo].some((v) =>
    (v || "").toLowerCase().includes(t),
  );
};

const porMaisRecente = (a: MlConversa, b: MlConversa) => {
  const d = tempoMl(b.ultima_mensagem_em) - tempoMl(a.ultima_mensagem_em);
  return d !== 0 ? d : b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
};

/** Cursor da próxima página = a última linha desta (a mais antiga). */
const cursorDaPagina = (pagina: MlConversa[]) => {
  const ultima = pagina[pagina.length - 1];
  return ultima?.ultima_mensagem_em ? { em: ultima.ultima_mensagem_em, id: ultima.id } : null;
};

/** O mais recente de dois instantes (null só se os dois forem nulos). */
const maisRecente = (a: string | null | undefined, b: string | null | undefined) =>
  (tempoMl(b) > tempoMl(a) ? b : a) ?? null;

/**
 * Junta a versão nova de uma linha com a que a tela já tinha. A nova vence em
 * tudo, MENOS no `visto_em`, que fica o maior dos dois: o `abrir` grava
 * `releitura_ml_em` ANTES de ler a conversa, o realtime entrega a linha inteira
 * com o `visto_em` velho do servidor, e sem isto a bolinha que o clique apagou
 * (`marcarVistaLocal`) voltava até a edge gravar o visto, 1 a 23 s depois — ou
 * ficava acesa de vez se a leitura do hub falhasse. O `visto_em` só anda para
 * a frente no banco, então o maior é sempre o certo.
 */
const juntarLinha = (atual: MlConversa | undefined, nova: MlConversa): MlConversa =>
  atual ? { ...atual, ...nova, visto_em: maisRecente(atual.visto_em, nova.visto_em) } : nova;

/** Junta sem repetir id (a versão de `novas` vence, salvo o `visto_em`) e devolve ordenado. */
const mesclar = (base: MlConversa[], novas: MlConversa[]) => {
  const porId = new Map(base.map((c) => [c.id, c]));
  novas.forEach((c) => porId.set(c.id, juntarLinha(porId.get(c.id), c)));
  return Array.from(porId.values()).sort(porMaisRecente);
};

export interface OpcoesMlConversations {
  /** O mesmo texto da busca da lista do WhatsApp. */
  busca: string;
  dateFrom?: Date;
  dateTo?: Date;
  /**
   * `last_message_at` da última conversa da PÁGINA do WhatsApp enquanto ainda há
   * página no servidor; `null` = sem corte (mostra todas as ML carregadas).
   * Sem ele uma ML de ontem apareceria antes de uma conversa de WhatsApp de hoje
   * que só chega na próxima página.
   */
  corte: string | null;
  /** "Somente Mercado Livre": ignora o corte, a lista é só a do ML. */
  somenteMl: boolean;
}

export interface MlConversationsEstado {
  /** Seller tem vínculo com o hub e o admin ligou a chave. False = nada é consultado. */
  habilitado: boolean;
  lista: MlConversa[];
  carregando: boolean;
  temMais: boolean;
  /**
   * A última consulta da lista do ML falhou. Enquanto houver erro, o
   * `carregarMais` automático (rolagem, cobertura do corte) não insiste — quem
   * tenta de novo é `tentarDeNovo`, pelo botão da faixa.
   */
  erro: string | null;
  carregarMais: () => Promise<void>;
  /** Refaz o que falhou: o vínculo, a 1ª página (recarregar) ou a página seguinte (carregarMais). */
  tentarDeNovo: () => Promise<void>;
  /**
   * A leitura do vínculo (a chave do ML desta loja) falhou seguidas vezes numa
   * loja que, pela última leitura boa, TEM o ML. `erro` vem preenchido e a
   * página mostra a faixa de falha com "Tentar de novo" — sem isto o ML sumia
   * inteiro, calado. Loja sem esse sinal não vê faixa: a releitura segue em
   * silêncio.
   */
  vinculoFalhou: boolean;
  marcarVistaLocal: (id: string) => void;
  recarregar: () => Promise<void>;
}

const ERRO_LISTA_ML = "Não foi possível carregar as conversas do Mercado Livre.";
const ERRO_VINCULO_ML = "Não foi possível verificar se o Mercado Livre está ligado nesta loja.";

/** Esperas entre as tentativas de reler o vínculo depois de uma falha passageira. */
const ESPERAS_VINCULO_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
/** Falhas seguidas até a faixa de erro aparecer (as primeiras costumam ser oscilação). */
const FALHAS_ATE_AVISAR = 3;

/**
 * Último `habilitado` lido com SUCESSO, por seller: na memória do módulo (vale
 * a sessão inteira, mesmo desmontando a página) e no localStorage (vale entre
 * sessões). É o sinal de que a loja TEM o ML.
 *
 * A faixa "não foi possível verificar se o Mercado Livre está ligado" só
 * aparece com esse sinal. Sem ele, quem não vende no ML (a grande maioria)
 * via, a cada oscilação do PostgREST, um erro sobre um canal que a loja não
 * tem, na aba "Todas". Sem o sinal a releitura continua, calada.
 */
const habilitadoConhecido = new Map<string, boolean>();
const chaveSinalMl = (sellerId: string) => `sv:ml-habilitado:${sellerId}`;

function guardarSinalMl(sellerId: string, habilitado: boolean) {
  habilitadoConhecido.set(sellerId, habilitado);
  try {
    if (habilitado) window.localStorage.setItem(chaveSinalMl(sellerId), "1");
    else window.localStorage.removeItem(chaveSinalMl(sellerId));
  } catch {
    // Storage bloqueado (janela privada, cookies desligados): fica só a memória.
  }
}

function lojaTemMl(sellerId: string): boolean {
  const naMemoria = habilitadoConhecido.get(sellerId);
  if (naMemoria !== undefined) return naMemoria;
  try {
    return window.localStorage.getItem(chaveSinalMl(sellerId)) === "1";
  } catch {
    return false;
  }
}

/**
 * Tabela ausente (migration ainda não aplicada neste ambiente): não é falha
 * passageira nem assunto do atendente — o ML só não existe aqui. 42P01 vem do
 * Postgres; PGRST205 é o "Could not find the table" do PostgREST.
 */
const tabelaInexistente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /could not find the table|does not exist/i.test(e.message || ""));

/**
 * Conversas pós-venda do Mercado Livre (via hub) do seller, para conviver com a
 * lista do WhatsApp sem entrar nela.
 *
 * Estado SEPARADO de `conversations` de propósito: os contadores das abas, a
 * busca no servidor, o "marcar todas como lidas" e o realtime do WhatsApp
 * continuam enxergando só o WhatsApp. Quem mistura é a página, no fim.
 *
 * Seller sem a chave ligada: uma consulta (o vínculo) e mais nada — sem lista,
 * sem realtime, sem chamada ao hub.
 */
export function useMlConversations(
  sellerId: string | null | undefined,
  { busca, dateFrom, dateTo, corte, somenteMl }: OpcoesMlConversations,
): MlConversationsEstado {
  const [habilitado, setHabilitado] = useState(false);
  const [todas, setTodas] = useState<MlConversa[]>([]);
  /** Achadas pela busca no servidor fora das páginas carregadas. */
  const [achadasNaBusca, setAchadasNaBusca] = useState<MlConversa[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Refs espelham o que os callbacks precisam ler sem refazer as dependências
  // (e sem a corrida de duas páginas pedidas no mesmo frame de rolagem).
  const geracaoRef = useRef(0);
  const carregandoRef = useRef(false);
  const temMaisRef = useRef(false);
  const cursorRef = useRef<{ em: string; id: string } | null>(null);
  /** Onde falhou: o vínculo ('vinculo'), a 1ª página ('lista') ou uma seguinte ('pagina'). */
  const erroEmRef = useRef<"vinculo" | "lista" | "pagina" | null>(null);
  const [vinculoFalhou, setVinculoFalhou] = useState(false);
  /** Muda para reler o vínculo agora (o "Tentar de novo" da faixa). */
  const [releituraVinculo, setReleituraVinculo] = useState(0);

  // O Calendar devolve meia-noite LOCAL; o fim é a meia-noite do dia seguinte
  // com `lt` — o mesmo recorte de `fetchConversationsPage` no Omnichannel.tsx.
  const desde = dateFrom ? dateFrom.toISOString() : null;
  const ate = dateTo ? new Date(dateTo.getTime() + UM_DIA_MS).toISOString() : null;

  const definirTemMais = useCallback((v: boolean) => {
    temMaisRef.current = v;
    setTemMais(v);
  }, []);

  const definirErro = useCallback((onde: "vinculo" | "lista" | "pagina" | null) => {
    erroEmRef.current = onde;
    setErro(onde === "vinculo" ? ERRO_VINCULO_ML : onde ? ERRO_LISTA_ML : null);
  }, []);

  // 1) A chave. Troca de seller zera tudo antes de perguntar de novo.
  //
  // Tabela ausente (migration pendente) fica calada: o WhatsApp segue igual, só
  // não há ML. Qualquer OUTRA falha (rede, 5xx/timeout do PostgREST recarregando
  // o schema — justamente quando as migrations do ML entram) é passageira:
  // tenta de novo com espera crescente e ao voltar para a aba. Antes ela só ia
  // para o console e o ML sumia pelo resto da sessão, sem cards, sem o filtro e
  // sem erro na tela. Depois de algumas falhas seguidas, a faixa aparece — mas
  // só para a loja que sabidamente tem o ML (lojaTemMl); as outras seguem
  // tentando em silêncio.
  const sellerDoVinculoRef = useRef<string | null | undefined>(undefined);
  /** Falhas seguidas da leitura do vínculo. O "Tentar de novo" não zera: se falhar de novo, a faixa volta na hora. */
  const falhasVinculoRef = useRef(0);
  /** A faixa de falha do vínculo está na tela (espelho de `vinculoFalhou` para o efeito). */
  const avisandoVinculoRef = useRef(false);
  const marcarVinculoFalhou = useCallback((v: boolean) => {
    avisandoVinculoRef.current = v;
    setVinculoFalhou(v);
  }, []);
  useEffect(() => {
    if (sellerDoVinculoRef.current !== sellerId) {
      sellerDoVinculoRef.current = sellerId;
      setHabilitado(false);
      setTodas([]);
      setAchadasNaBusca([]);
      definirTemMais(false);
      definirErro(null);
      marcarVinculoFalhou(false);
      falhasVinculoRef.current = 0;
      cursorRef.current = null;
      geracaoRef.current++;
    }
    if (!sellerId) return;
    const seller = sellerId;

    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    /** Releitura com a faixa na tela: mostra o giro no "Tentar de novo" dela. */
    let reconferindo = false;
    let lidoEm = 0;
    const ler = async () => {
      timer = null;
      lidoEm = Date.now();
      reconferindo = avisandoVinculoRef.current;
      if (reconferindo) setCarregando(true);
      const { data, error } = await dbSemTipo
        .from("seller_hub_vinculos")
        .select("id")
        .eq("seller_id", seller)
        .eq("ml_suporte_ativo", true)
        .limit(1);
      if (cancelado) return;
      if (reconferindo) setCarregando(false);
      reconferindo = false;
      if (!error) {
        const tem = (data || []).length > 0;
        guardarSinalMl(seller, tem);
        falhasVinculoRef.current = 0;
        marcarVinculoFalhou(false);
        if (erroEmRef.current === "vinculo") definirErro(null);
        setHabilitado(tem);
        return;
      }
      if (tabelaInexistente(error)) {
        console.warn("[omnichannel/ml] tabela do vínculo com o hub ausente:", error.code || error.message);
        return;
      }
      const falhas = ++falhasVinculoRef.current;
      console.warn(`[omnichannel/ml] vínculo com o hub não lido (falha ${falhas}):`, error.message || error.code);
      if (falhas >= FALHAS_ATE_AVISAR && lojaTemMl(seller)) {
        marcarVinculoFalhou(true);
        definirErro("vinculo");
      }
      timer = setTimeout(() => void ler(), ESPERAS_VINCULO_MS[Math.min(falhas, ESPERAS_VINCULO_MS.length) - 1]);
    };
    void ler();

    // Com uma nova tentativa agendada, voltar para a aba relê na hora.
    // Sem tentativa agendada, relê mesmo assim (no máximo a cada 30 s): a chave
    // pode ter sido ligada/desligada pelo admin com esta aba aberta, e sem isso
    // o ML só aparecia depois de um F5 (revisão 3, feliz-2).
    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) {
        clearTimeout(timer);
        void ler();
      } else if (Date.now() - lidoEm > 30_000) {
        void ler();
      }
    };
    window.addEventListener("focus", aoVoltar);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      if (reconferindo) setCarregando(false);
      window.removeEventListener("focus", aoVoltar);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [sellerId, releituraVinculo, definirTemMais, definirErro, marcarVinculoFalhou]);

  /**
   * Uma página por cursor (ultima_mensagem_em, id) — e não por deslocamento: o
   * realtime insere no topo o tempo todo e o offset pularia ou repetiria linhas.
   * O valor vai entre aspas no `.or()` porque o timestamp tem `:` `.` `+`.
   * Conversa sem nenhuma mensagem (`ultima_mensagem_em` nulo) fica de fora: não
   * há o que ler nem a quem responder.
   */
  const buscarPagina = useCallback(
    async (cursor: { em: string; id: string } | null) => {
      let q = dbSemTipo
        .from("ml_conversas")
        .select("*")
        .eq("seller_id", sellerId)
        .not("ultima_mensagem_em", "is", null);
      if (desde) q = q.gte("ultima_mensagem_em", desde);
      if (ate) q = q.lt("ultima_mensagem_em", ate);
      if (cursor) {
        q = q.or(
          `ultima_mensagem_em.lt."${cursor.em}",and(ultima_mensagem_em.eq."${cursor.em}",id.lt.${cursor.id})`,
        );
      }
      const { data, error } = await q
        .order("ultima_mensagem_em", { ascending: false })
        .order("id", { ascending: false })
        .limit(TAMANHO_PAGINA);
      if (error) throw error;
      return (data || []) as MlConversa[];
    },
    [sellerId, desde, ate],
  );

  const recarregar = useCallback(async () => {
    if (!sellerId || !habilitado) return;
    const geracao = ++geracaoRef.current;
    carregandoRef.current = true;
    setCarregando(true);
    definirErro(null);
    try {
      const pagina = await buscarPagina(null);
      if (geracao !== geracaoRef.current) return;
      cursorRef.current = cursorDaPagina(pagina);
      // A página nova substitui a lista, mas o `visto_em` local de quem já
      // estava nela não volta para trás (ver juntarLinha).
      setTodas((prev) => {
        const antes = new Map(prev.map((c) => [c.id, c]));
        return pagina.map((c) => juntarLinha(antes.get(c.id), c)).sort(porMaisRecente);
      });
      definirTemMais(pagina.length === TAMANHO_PAGINA);
    } catch (e) {
      if (geracao !== geracaoRef.current) return;
      console.warn("[omnichannel/ml] lista não carregou:", (e as { message?: string })?.message);
      // Some com o que era de OUTRO recorte (período anterior): sem isto, os
      // cards de fora da data escolhida continuavam misturados na lista. A
      // faixa de erro da página oferece o "Tentar de novo".
      setTodas([]);
      cursorRef.current = null;
      definirTemMais(false);
      definirErro("lista");
    } finally {
      if (geracao === geracaoRef.current) {
        carregandoRef.current = false;
        setCarregando(false);
      }
    }
  }, [sellerId, habilitado, buscarPagina, definirTemMais, definirErro]);

  // 2) Primeira página: ao ligar, ao trocar de seller e ao mudar o período.
  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const carregarMais = useCallback(async () => {
    if (!sellerId || !habilitado || carregandoRef.current || !temMaisRef.current || erroEmRef.current) return;
    const geracao = geracaoRef.current;
    carregandoRef.current = true;
    setCarregando(true);
    try {
      const pagina = await buscarPagina(cursorRef.current);
      if (geracao !== geracaoRef.current) return;
      cursorRef.current = cursorDaPagina(pagina) ?? cursorRef.current;
      setTodas((prev) => mesclar(prev, pagina));
      definirTemMais(pagina.length === TAMANHO_PAGINA);
    } catch (e) {
      if (geracao !== geracaoRef.current) return;
      // NÃO zera `temMais`: zerar escondia o "Carregar mais" do ML pelo resto da
      // sessão por causa de uma falha passageira. O erro fica marcado — e com
      // ele a rolagem e a cobertura do corte (abaixo) param de pedir a mesma
      // página em laço; `tentarDeNovo` (faixa da página) destrava.
      console.warn("[omnichannel/ml] página seguinte não carregou:", (e as { message?: string })?.message);
      definirErro("pagina");
    } finally {
      if (geracao === geracaoRef.current) {
        carregandoRef.current = false;
        setCarregando(false);
      }
    }
  }, [sellerId, habilitado, buscarPagina, definirTemMais, definirErro]);

  const tentarDeNovo = useCallback(async () => {
    const onde = erroEmRef.current;
    if (onde === "vinculo") {
      // Relê o vínculo agora (o efeito 1 roda de novo; a contagem de falhas segue).
      setReleituraVinculo((n) => n + 1);
      return;
    }
    definirErro(null);
    if (onde === "pagina") await carregarMais();
    else await recarregar();
  }, [carregarMais, recarregar, definirErro]);

  // 3) Cobertura do corte: enquanto o WhatsApp rola para trás, o ML precisa ter
  // carregado pelo menos até a mesma data — senão um buraco de ML some da lista.
  // E com UMA PÁGINA DE FOLGA além dela: a página nova do WhatsApp baixa o corte
  // de uma vez, e sem folga as ML desse trecho chegavam depois, em outra
  // consulta, e entravam no meio da página que o atendente já estava lendo
  // (empurrando o card em que ele ia clicar). Com a folga elas já estão
  // carregadas — só escondidas pelo corte — e aparecem junto com o WhatsApp.
  const alemDoCorte = useMemo(() => {
    if (!corte) return 0;
    const limite = tempoMl(corte);
    return todas.reduce((n, c) => (tempoMl(c.ultima_mensagem_em) < limite ? n + 1 : n), 0);
  }, [todas, corte]);
  useEffect(() => {
    if (!habilitado || somenteMl || !corte || !temMais || carregando || erro) return;
    if (alemDoCorte >= TAMANHO_PAGINA) return;
    void carregarMais();
  }, [habilitado, somenteMl, corte, temMais, carregando, erro, alemDoCorte, carregarMais]);

  // 4) Busca no servidor (300 ms, como a do WhatsApp): a peneira local só vê as
  // páginas carregadas, e o pedido que o comprador cita costuma ser antigo.
  const termo = termoSeguro(busca);
  useEffect(() => {
    if (!sellerId || !habilitado || termo.length < 2) {
      setAchadasNaBusca([]);
      return;
    }
    let cancelado = false;
    const timer = setTimeout(async () => {
      let q = dbSemTipo
        .from("ml_conversas")
        .select("*")
        .eq("seller_id", sellerId)
        .not("ultima_mensagem_em", "is", null)
        .or(
          ["comprador_nome", "pedido_ml", "pack_id", "produto_titulo"]
            .map((col) => `${col}.ilike.%${termo}%`)
            .join(","),
        );
      if (desde) q = q.gte("ultima_mensagem_em", desde);
      if (ate) q = q.lt("ultima_mensagem_em", ate);
      const { data, error } = await q.order("ultima_mensagem_em", { ascending: false }).limit(TAMANHO_PAGINA);
      if (cancelado) return;
      if (error) {
        console.warn("[omnichannel/ml] busca no servidor falhou:", error.message || error.code);
        return;
      }
      setAchadasNaBusca((data || []) as MlConversa[]);
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [sellerId, habilitado, termo, desde, ate]);

  // 5) Realtime: a edge e o cron gravam o espelho; a lista acompanha sozinha.
  useEffect(() => {
    if (!sellerId || !habilitado) return;
    const dentroDoPeriodo = (c: MlConversa) => {
      const t = tempoMl(c.ultima_mensagem_em);
      if (!c.ultima_mensagem_em) return false;
      if (desde && t < tempoMl(desde)) return false;
      if (ate && t >= tempoMl(ate)) return false;
      return true;
    };
    const tirar = (id: string) => {
      setTodas((prev) => prev.filter((c) => c.id !== id));
      setAchadasNaBusca((prev) => prev.filter((c) => c.id !== id));
    };

    const canal = supabase
      .channel(`ml-conversas-${sellerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ml_conversas", filter: `seller_id=eq.${sellerId}` },
        (payload: { eventType: string; new: unknown; old: unknown }) => {
          if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string } | null)?.id;
            if (id) tirar(id);
            return;
          }
          const linha = payload.new as MlConversa | null;
          if (!linha?.id || linha.seller_id !== sellerId) return;
          if (!dentroDoPeriodo(linha)) {
            tirar(linha.id);
            return;
          }
          setTodas((prev) => {
            const existe = prev.some((c) => c.id === linha.id);
            // Linha nova MAIS ANTIGA que a última página: a paginação traz quando
            // chegar lá. Entrar agora deixaria um card solto no meio do buraco.
            const cursor = cursorRef.current;
            if (!existe && temMaisRef.current && cursor && tempoMl(linha.ultima_mensagem_em) < tempoMl(cursor.em)) {
              return prev;
            }
            return mesclar(prev, [linha]);
          });
          setAchadasNaBusca((prev) =>
            prev.some((c) => c.id === linha.id) ? prev.map((c) => (c.id === linha.id ? juntarLinha(c, linha) : c)) : prev,
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [sellerId, habilitado, desde, ate]);

  // 6) Pede ao hub a novidade ao abrir a aba (no máximo 1x por minuto por seller).
  // O resultado chega pelo realtime acima; falha aqui não é do atendente.
  useEffect(() => {
    if (!sellerId || !habilitado) return;
    const agora = Date.now();
    if (agora - (ultimoSincronizar.get(sellerId) ?? 0) < INTERVALO_SINCRONIZAR_MS) return;
    ultimoSincronizar.set(sellerId, agora);
    void supabase.functions
      .invoke("ml-suporte", { body: { acao: "sincronizar", seller_id: sellerId } })
      .then(({ error }) => {
        if (error) console.warn("[omnichannel/ml] sincronizar falhou:", error.message);
      });
  }, [sellerId, habilitado]);

  // O "visto" local é a própria `ultima_mensagem_em` da linha (relógio do
  // SERVIDOR), não o relógio da máquina: como o `visto_em` agora só anda para a
  // frente na tela (juntarLinha), um relógio local adiantado esconderia a
  // bolinha das mensagens que chegassem nesses minutos.
  const marcarVistaLocal = useCallback((id: string) => {
    const marcar = (prev: MlConversa[]) =>
      prev.some((c) => c.id === id)
        ? prev.map((c) => (c.id === id ? { ...c, visto_em: maisRecente(c.visto_em, c.ultima_mensagem_em) } : c))
        : prev;
    setTodas(marcar);
    setAchadasNaBusca(marcar);
  }, []);

  const lista = useMemo(() => {
    if (!habilitado) return [];
    // O período vale também para o que já estava carregado: enquanto a consulta
    // do período novo voa (ou se ela falhar), as ML do recorte anterior não
    // ficam misturadas na lista.
    const desdeMs = desde ? tempoMl(desde) : null;
    const ateMs = ate ? tempoMl(ate) : null;
    const noPeriodo = (c: MlConversa) => {
      const t = tempoMl(c.ultima_mensagem_em);
      return (desdeMs === null || t >= desdeMs) && (ateMs === null || t < ateMs);
    };
    if (termo) return mesclar(todas, achadasNaBusca).filter((c) => noPeriodo(c) && casaBusca(c, termo));
    if (!somenteMl && corte) {
      const limite = tempoMl(corte);
      return todas.filter((c) => noPeriodo(c) && tempoMl(c.ultima_mensagem_em) >= limite);
    }
    return desde || ate ? todas.filter(noPeriodo) : todas;
  }, [habilitado, todas, achadasNaBusca, termo, somenteMl, corte, desde, ate]);

  return {
    habilitado,
    lista,
    carregando,
    temMais,
    erro,
    carregarMais,
    tentarDeNovo,
    vinculoFalhou,
    marcarVistaLocal,
    recarregar,
  };
}

// ── Conversa aberta ─────────────────────────────────────────────────────────

/**
 * `incerto`: a falha não prova que a mensagem não saiu (ver `envioIncerto`). A
 * tela não convida a reenviar — a thread é relida e ela confere.
 */
export type ResultadoEnvioMl = { ok: true } | { ok: false; erro: string; incerto: boolean };

export interface MlConversaAberta {
  /** Resposta do `abrir`/`responder` — sempre da conversa pedida (zera ao trocar). */
  dados: MlAbrirResposta | null;
  carregando: boolean;
  erro: string | null;
  /**
   * Envio DESTA conversa em voo. É por conversa: outra conversa enviando não
   * trava esta, e trocar de conversa não solta a trava da que ficou enviando
   * (voltar para ela com o POST no ar mostrava a caixa livre e vazia — e o
   * reenvio chegava em dobro ao comprador).
   */
  enviando: boolean;
  /** Releitura em voo para conferir se o envio incerto DESTA conversa saiu. */
  conferindo: boolean;
  /** O último envio que falhou NESTA conversa e ainda não foi resolvido. */
  tentativa: TentativaEnvioMl | null;
  /** Esquece a tentativa (a tela já avisou que saiu, ou o atendente decidiu reenviar). */
  descartarTentativa: (conversaId: string) => void;
  /**
   * Relê a conversa aberta (o botão de atualizar e o "Tentar de novo"). Com
   * envio incerto dela ainda sem resposta, vai como CONFERÊNCIA.
   */
  recarregar: () => void;
  /**
   * `idsAntes`: as outbound que a thread mostrava no clique. A edge as tira da
   * prova de envio — uma resposta igual mandada antes não passa por esta.
   */
  responder: (texto: string, idsAntes: string[]) => Promise<ResultadoEnvioMl>;
}

type Conhecida = { em: string | null; status: string | null };

/** A linha do espelho traz novidade em relação ao que a última resposta mostrou? */
const mudouDoConhecido = (
  conhecida: Conhecida | null,
  linha: Pick<MlConversa, "ultima_mensagem_em" | "status">,
) => {
  if (!conhecida) return true;
  return (
    tempoMl(linha.ultima_mensagem_em) !== tempoMl(conhecida.em) || (linha.status ?? null) !== conhecida.status
  );
};

/** Tentativas mais velhas que isto são esquecidas (a tela só as usa por alguns minutos). */
const VIDA_TENTATIVA_MS = 30 * 60_000;

const comId = (s: ReadonlySet<string>, id: string, sim: boolean): ReadonlySet<string> => {
  if (s.has(id) === sim) return s;
  const n = new Set(s);
  if (sim) n.add(id);
  else n.delete(id);
  return n;
};

/**
 * Thread + pedido da conversa ML aberta, compartilhados pelo chat e pelo painel
 * da direita (um `abrir` só alimenta os dois).
 *
 * Recarrega quando o realtime da PRÓPRIA conversa muda `ultima_mensagem_em` ou
 * `status`. Evento que chega com uma chamada em voo para a mesma conversa fica
 * guardado e é conferido na volta: a edge grava o espelho ANTES de responder, e
 * sem isso o eco do próprio `abrir` (visto_em) dispararia outro `abrir` — e cada
 * um custa uma releitura no ML.
 *
 * O ENVIO é preso à conversa que o originou: `enviando`, `conferindo` e a
 * tentativa que falhou são guardados por id e sobrevivem à troca de conversa
 * (o hook mora na página; o chat do ML é desmontado ao abrir um WhatsApp).
 */
export function useMlConversaAberta(conversaId: string | null): MlConversaAberta {
  const [dados, setDados] = useState<MlAbrirResposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviandoIds, setEnviandoIds] = useState<ReadonlySet<string>>(() => new Set());
  const [conferindoIds, setConferindoIds] = useState<ReadonlySet<string>>(() => new Set());
  const [tentativas, setTentativas] = useState<ReadonlyMap<string, TentativaEnvioMl>>(() => new Map());

  const idRef = useRef<string | null>(conversaId);
  const geracaoRef = useRef(0);
  /** Chamadas em voo por conversa — a troca de conversa não mistura as contas. */
  const voosRef = useRef(new Map<string, number>());
  const conhecidaRef = useRef<Conhecida | null>(null);
  const pendenteRef = useRef<MlConversa | null>(null);
  const abrirRef = useRef<(id: string, silencioso: boolean, conferencia?: boolean) => Promise<void>>();
  /** Espelho de `tentativas` para quem roda depois de um await. */
  const tentativasRef = useRef<ReadonlyMap<string, TentativaEnvioMl>>(tentativas);

  /**
   * Conferências em voo por conversa. É contagem, e não só o Set: o clique em
   * atualizar pode conferir com a releitura automática ainda no ar, e a
   * primeira a voltar não pode apagar o "Conferindo…" (nem soltar a trava do
   * reenvio) da outra.
   */
  const conferenciasRef = useRef(new Map<string, number>());

  const emVoo = (id: string) => (voosRef.current.get(id) ?? 0) > 0;
  const somarVoo = (id: string, d: number) => {
    const n = Math.max(0, (voosRef.current.get(id) ?? 0) + d);
    if (n === 0) voosRef.current.delete(id);
    else voosRef.current.set(id, n);
  };
  const somarConferencia = (id: string, d: number) => {
    const n = Math.max(0, (conferenciasRef.current.get(id) ?? 0) + d);
    if (n === 0) conferenciasRef.current.delete(id);
    else conferenciasRef.current.set(id, n);
    setConferindoIds((s) => comId(s, id, n > 0));
  };

  const mudarTentativa = (id: string, t: TentativaEnvioMl | null) => {
    const n = new Map(tentativasRef.current);
    const limite = Date.now() - VIDA_TENTATIVA_MS;
    for (const [k, v] of n) if (v.em < limite) n.delete(k);
    if (t) n.set(id, t);
    else n.delete(id);
    tentativasRef.current = n;
    setTentativas(n);
  };

  /**
   * Uma leitura da conversa voltou: resolve a tentativa que falhou nela. A
   * mensagem apareceu (outbound nova com o mesmo texto, dentro da janela do
   * envio) → saiu. Não apareceu numa leitura COMEÇADA depois da falha E relida
   * no ML (`relido_no_ml`) → conferida, não saiu. A leitura que não chegou ao
   * ML (pausa de 30 s da conversa, teto do vínculo, sync que falhou) olhou só
   * o banco do hub — que no envio ambíguo não tem a mensagem — e não resolve
   * nada: a faixa "Não deu para conferir" com o "Enviar mesmo assim" continua.
   *
   * Falha de tempo/rede (`emCurso`): o POST do hub ao ML pode terminar depois
   * da releitura. Aí "não saiu" só vale numa leitura começada
   * JANELA_ENVIO_EM_CURSO_MS depois da falha. A edge aplica a mesma regra do
   * lado dela (relido_no_ml false), e esta aqui segura a edge antiga ou o
   * caso em que nem a linha de ml_respostas existe.
   */
  const conferirTentativa = (id: string, resposta: MlAbrirResposta | null, iniciou: number) => {
    const t = tentativasRef.current.get(id);
    if (!t || t.saiu) return;
    const mensagens = Array.isArray(resposta?.mensagens) ? resposta!.mensagens : [];
    if (tentativaApareceu(t, mensagens)) mudarTentativa(id, { ...t, saiu: true });
    else if (
      iniciou >= t.em + (t.emCurso ? JANELA_ENVIO_EM_CURSO_MS : 0) &&
      resposta?.relido_no_ml === true &&
      !t.relidaSemAchar
    ) {
      mudarTentativa(id, { ...t, relidaSemAchar: true });
    }
  };

  /** Na volta de uma chamada: o que chegou pelo realtime enquanto ela voava é mais novo? */
  const conferirPendente = (id: string) => {
    const pendente = pendenteRef.current;
    if (!pendente || pendente.id !== id || emVoo(id)) return;
    pendenteRef.current = null;
    if (idRef.current === id && mudouDoConhecido(conhecidaRef.current, pendente)) {
      void abrirRef.current?.(id, true);
    }
  };

  const aplicar = (id: string, resposta: MlAbrirResposta) => {
    if (idRef.current !== id) return;
    setDados(resposta);
    conhecidaRef.current = {
      em: resposta?.conversa?.ultima_mensagem_em ?? null,
      status: resposta?.conversa?.status ?? null,
    };
  };

  const abrir = async (id: string, silencioso: boolean, conferencia = false) => {
    const geracao = ++geracaoRef.current;
    const iniciou = Date.now();
    somarVoo(id, 1);
    if (conferencia) somarConferencia(id, 1);
    if (!silencioso) setCarregando(true);
    setErro(null);
    try {
      // `conferir`: a releitura depois de um envio que falhou precisa chegar ao
      // ML. A edge, achando a tentativa incerta em ml_respostas, pula a pausa de
      // 30 s da conversa e usa o teto de conferência do vínculo.
      const { data, error } = await supabase.functions.invoke("ml-suporte", {
        body: conferencia ? { acao: "abrir", conversa_id: id, conferir: true } : { acao: "abrir", conversa_id: id },
      });
      if (error) throw error;
      if (data?.erro) throw new Error(String(data.erro));
      // A tentativa é da conversa, não da tela: confere mesmo se outra
      // chamada mais nova vai ganhar a vez de mostrar.
      conferirTentativa(id, data as MlAbrirResposta, iniciou);
      if (geracao !== geracaoRef.current) return;
      aplicar(id, data as MlAbrirResposta);
    } catch (e) {
      if (geracao !== geracaoRef.current) return;
      setErro(await mensagemDeErroDaEdge(e, "Não foi possível abrir a conversa do Mercado Livre."));
    } finally {
      somarVoo(id, -1);
      if (conferencia) somarConferencia(id, -1);
      if (geracao === geracaoRef.current) setCarregando(false);
      conferirPendente(id);
    }
  };
  // Só refs dentro dela: a versão de qualquer render serve. O ref existe para o
  // efeito do realtime e o `conferirPendente` chamarem sem virar dependência.
  abrirRef.current = abrir;

  useEffect(() => {
    idRef.current = conversaId;
    // Zerar ANTES de buscar (mesma lição do WhatsApp): sem isso o cabeçalho já
    // mostra o comprador novo com a thread e o pedido do anterior. O envio em
    // voo NÃO é zerado aqui: ele é da conversa que o originou (enviandoIds).
    setDados(null);
    setErro(null);
    conhecidaRef.current = null;
    pendenteRef.current = null;
    if (!conversaId) {
      geracaoRef.current++;
      setCarregando(false);
      return;
    }
    void abrirRef.current?.(conversaId, false);

    const canal = supabase
      .channel(`ml-conversa-${conversaId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ml_conversas", filter: `id=eq.${conversaId}` },
        (payload: { new: unknown }) => {
          const linha = payload.new as MlConversa | null;
          if (!linha?.id || idRef.current !== linha.id) return;
          // Para os campos dele, o espelho é sempre o mais fresco.
          setDados((prev) =>
            prev && prev.conversa?.id === linha.id ? { ...prev, conversa: { ...prev.conversa, ...linha } } : prev,
          );
          if ((voosRef.current.get(linha.id) ?? 0) > 0) {
            pendenteRef.current = linha;
            return;
          }
          if (mudouDoConhecido(conhecidaRef.current, linha)) void abrirRef.current?.(linha.id, true);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [conversaId]);

  /**
   * O botão de atualizar e o "Tentar de novo" releem a conversa. Com envio
   * incerto DELA ainda sem resposta, a releitura vai como conferência: a edge
   * confirma a tentativa em ml_respostas e só então pula a pausa de 30 s e usa
   * o teto próprio do vínculo. Sem isto, o clique depois de uma conferência
   * que falhou caía na pausa que ela mesma carimbou e não chegava ao ML.
   */
  const recarregar = useCallback(() => {
    const id = idRef.current;
    if (!id) return;
    const t = tentativasRef.current.get(id);
    const conferir = !!t && t.incerto && !t.saiu && !t.relidaSemAchar;
    void abrirRef.current?.(id, false, conferir);
  }, []);

  const descartarTentativa = useCallback((id: string) => {
    if (!tentativasRef.current.has(id)) return;
    const n = new Map(tentativasRef.current);
    n.delete(id);
    tentativasRef.current = n;
    setTentativas(n);
  }, []);

  /**
   * Na falha, a thread é RELIDA em silêncio (se a conversa ainda estiver
   * aberta): no envio ambíguo (504, 422 com a mensagem na conversa, rede) a
   * edge não mexe no espelho, então nem o realtime traria a novidade antes do
   * cron do minuto seguinte — e o atendente, vendo a caixa ainda cheia,
   * apertava Enter de novo. A tentativa fica guardada por conversa até uma
   * releitura resolvê-la.
   */
  const responder = async (texto: string, idsAntes: string[]): Promise<ResultadoEnvioMl> => {
    const id = idRef.current;
    if (!id) return { ok: false, erro: "Nenhuma conversa aberta.", incerto: false };
    const inicio = Date.now();
    setEnviandoIds((s) => comId(s, id, true));
    somarVoo(id, 1);
    let falhou = false;
    try {
      const { data, error } = await supabase.functions.invoke("ml-suporte", {
        body: { acao: "responder", conversa_id: id, texto, ids_antes: idsAntes.slice(0, 500) },
      });
      if (error) throw error;
      if (data?.erro) throw new Error(String(data.erro));
      // Saiu. A tentativa anterior com o MESMO texto está resolvida (foi
      // reenviada de propósito); a de texto diferente só se resolve pela
      // thread — que esta resposta também traz.
      const t = tentativasRef.current.get(id);
      if (t && (mesmoTextoMl(t.texto, texto) || !t.incerto)) mudarTentativa(id, null);
      else conferirTentativa(id, data as MlAbrirResposta, inicio);
      aplicar(id, data as MlAbrirResposta);
      return { ok: true };
    } catch (e) {
      falhou = true;
      const resultado = {
        ok: false as const,
        erro: await mensagemDeErroDaEdge(e, "Não foi possível enviar a mensagem."),
        incerto: await envioIncerto(e),
      };
      mudarTentativa(id, {
        conversaId: id,
        texto,
        idsAntes: new Set(idsAntes),
        incerto: resultado.incerto,
        emCurso: resultado.incerto && (await falhaTalvezEmCurso(e)),
        inicio,
        em: Date.now(),
        relidaSemAchar: false,
        saiu: false,
      });
      return resultado;
    } finally {
      somarVoo(id, -1);
      setEnviandoIds((s) => comId(s, id, false));
      if (falhou && idRef.current === id) {
        pendenteRef.current = null;
        void abrirRef.current?.(id, true, true);
      } else {
        conferirPendente(id);
      }
    }
  };

  return {
    dados,
    carregando,
    erro,
    enviando: !!conversaId && enviandoIds.has(conversaId),
    conferindo: !!conversaId && conferindoIds.has(conversaId),
    tentativa: conversaId ? tentativas.get(conversaId) ?? null : null,
    descartarTentativa,
    recarregar,
    responder,
  };
}
