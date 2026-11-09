-- =====================================================================
-- Notificação no celular de oportunidade de venda (app Android).
--
-- O QUE AVISA: só a oportunidade que a IA cria em
-- public.whatsapp_conversion_cases (detect-conversion-intent, status
-- 'detected'); a mesma que a aba "Oportunidades" do WhatsApp mostra. Uma
-- notificação por linha, na criação. A reanálise da IA faz UPDATE da mesma
-- linha (upsert por conversation_id) e não avisa de novo: a chave de
-- app_push_enviadas é o id do caso, e só entra caso criado há menos de 30 min.
--
-- COMO, SEM GATILHO NA TABELA DO SITE (CONTRATO-BANCO.md, regra 4): um job do
-- pg_cron por minuto (app_push_coletar) lê os casos novos pelo índice
-- idx_conv_cases_analyzed_at que já existe, põe na fila app_push_enviadas e,
-- se houver pendente, chama a edge app-push-enviar, que manda pelo Firebase
-- (FCM HTTP v1). A tabela do site não ganha gatilho nem índice.
--
-- URL E SEGREDO: os mesmos do site (avaliar-mensagem-recebida,
-- ml-suporte-sync): url_edge_functions() e cron_secret_utilizavel(), que o
-- site mantém. O mesmo arquivo serve ao teste e à produção. No teste o
-- cron_secret é curto e o coletor não chama a edge; para exercitá-la lá,
-- chamar à mão com o Bearer da service role.
--
-- NASCE DESLIGADO: app_push_estado.ligado = false e somente_lojas = '{}'
-- (nenhuma loja). Ligar é um UPDATE (fim do arquivo). Antes de ligar: deploy
-- da edge e o segredo FCM_SERVICE_ACCOUNT (LEIA-ME, "Notificações de
-- oportunidade").
--
-- O JOB É AGENDADO AQUI MESMO: cron.schedule com nome faz upsert (pg_cron 1.6),
-- então reaplicar o arquivo não duplica. Desligado, cada minuto é uma leitura
-- de uma linha e sai; deixar o agendamento comentado obrigaria um segundo
-- passo à mão que é fácil de esquecer, e o interruptor de verdade é o
-- app_push_estado.ligado.
--
-- QUEM RODA O QUÊ: o job roda como postgres (como os 35 jobs do site), a edge
-- como service_role; os dois têm BYPASSRLS, por isso as funções são SECURITY
-- INVOKER e só eles podem executá-las.
--
-- APLICAR: editor de SQL como postgres, primeiro no teste
-- (tbkgkifybhuaqlhywfby). NUNCA supabase db push / migration repair a partir
-- do repositório do app: o histórico de migrações é do site. Por isso este
-- arquivo também não escreve em supabase_migrations.schema_migrations: uma
-- versão que o repositório do site não tem faria o db push de lá reclamar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Aparelhos: um token do FCM por conta e celular, gravado pelo app.
-- Sem FK para profiles/auth.users: FK cria gatilho interno na tabela
-- referenciada, e a tabela é do site.
-- ---------------------------------------------------------------------
create table if not exists public.app_push_aparelhos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid(),
  token text not null check (char_length(token) between 1 and 4096),
  plataforma text not null default 'android' check (plataforma in ('android', 'ios')),
  visto_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (profile_id, token)
);

-- Regra do dono do token: o mesmo celular que troca de conta deixa a linha da
-- conta anterior; vale a de maior visto_em. Este índice serve a essa busca e à
-- limpeza de token inválido pela edge.
create index if not exists app_push_aparelhos_token_idx on public.app_push_aparelhos (token);

-- visto_em decide quem é o dono do token, então é o banco que carimba, não o
-- relógio do celular: um visto_em no futuro prenderia o token na conta antiga.
create or replace function public.app_push_aparelhos_carimbar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- clock_timestamp, não now(): duas contas gravando o mesmo token na mesma
  -- transação ainda ficam em ordem.
  new.visto_em := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.criado_em := old.criado_em;
  else
    new.criado_em := new.visto_em;
  end if;
  return new;
end;
$$;

drop trigger if exists app_push_aparelhos_carimbar on public.app_push_aparelhos;
create trigger app_push_aparelhos_carimbar
  before insert or update on public.app_push_aparelhos
  for each row execute function public.app_push_aparelhos_carimbar();

alter table public.app_push_aparelhos enable row level security;

drop policy if exists app_push_aparelhos_ler on public.app_push_aparelhos;
create policy app_push_aparelhos_ler on public.app_push_aparelhos
  for select to authenticated
  using (profile_id = auth.uid());

drop policy if exists app_push_aparelhos_inserir on public.app_push_aparelhos;
create policy app_push_aparelhos_inserir on public.app_push_aparelhos
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists app_push_aparelhos_atualizar on public.app_push_aparelhos;
create policy app_push_aparelhos_atualizar on public.app_push_aparelhos
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists app_push_aparelhos_apagar on public.app_push_aparelhos;
create policy app_push_aparelhos_apagar on public.app_push_aparelhos
  for delete to authenticated
  using (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- Estado do coletor: uma linha só.
-- somente_lojas: null = todas as lojas; '{}' = nenhuma (o valor de nascença,
-- para que ligar sem escolher o piloto não avise ninguém).
-- ---------------------------------------------------------------------
create table if not exists public.app_push_estado (
  id integer primary key default 1 check (id = 1),
  ligado boolean not null default false,
  somente_lojas uuid[] default '{}',
  cursor timestamptz,
  coletado_em timestamptz,
  ultimo_erro text,
  atualizado_em timestamptz not null default now()
);

insert into public.app_push_estado (id) values (1) on conflict (id) do nothing;

alter table public.app_push_estado enable row level security;

-- ---------------------------------------------------------------------
-- Fila e registro dos envios: só ids, nada do texto da conversa.
-- ---------------------------------------------------------------------
create table if not exists public.app_push_enviadas (
  case_id uuid primary key,
  conversation_id uuid not null,
  client_id uuid not null,
  seller_id uuid not null,
  intent_type text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviando', 'enviada', 'sem_aparelho', 'falhou', 'expirada')),
  tentativas integer not null default 0,
  motivo text,
  criado_em timestamptz not null default now(),
  processado_em timestamptz
);

alter table public.app_push_enviadas enable row level security;

-- ---------------------------------------------------------------------
-- Permissões das tabelas. O pg_default_acl deste projeto dá arwdDxtm a anon
-- e authenticated em toda tabela nova de public: tira tudo e devolve só o
-- necessário.
-- ---------------------------------------------------------------------
revoke all on public.app_push_aparelhos, public.app_push_estado, public.app_push_enviadas
  from public, anon, authenticated;
grant select, insert, update, delete on public.app_push_aparelhos to authenticated;
grant select, insert, update, delete on public.app_push_aparelhos, public.app_push_estado, public.app_push_enviadas
  to service_role;

-- ---------------------------------------------------------------------
-- Coletor (job do pg_cron, a cada minuto).
-- ---------------------------------------------------------------------
create or replace function public.app_push_coletar()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_estado public.app_push_estado%rowtype;
  v_agora timestamptz := clock_timestamp();
  v_desde timestamptz;
  v_novas integer := 0;
  v_segredo text;
begin
  -- Qualquer erro vira WARNING: o job não pode ficar falhando a cada minuto
  -- no cron.job_run_details por causa de um aviso de celular.
  begin
    select * into v_estado from public.app_push_estado where id = 1;
    if not found or not v_estado.ligado then
      return 0;
    end if;

    -- analyzed_at é o que tem índice (created_at não tem, e o app não cria
    -- índice em tabela do site). 2 min de folga cobrem o caso gravado com o
    -- relógio da edge e confirmado depois; nunca mais de 30 min para trás,
    -- para quem ligar depois de um tempo parado não receber o atrasado.
    v_desde := greatest(coalesce(v_estado.cursor, v_agora) - interval '2 minutes',
                        v_agora - interval '30 minutes');

    -- created_at recente separa a criação da reanálise: a reanálise mexe no
    -- analyzed_at de um caso antigo, que fica de fora.
    insert into public.app_push_enviadas (case_id, conversation_id, client_id, seller_id, intent_type)
    select w.id, w.conversation_id, w.client_id, w.seller_id, w.intent_type
      from public.whatsapp_conversion_cases w
      join public.conversations c on c.id = w.conversation_id
     where w.analyzed_at >= v_desde
       and w.created_at >= v_agora - interval '30 minutes'
       and w.status in ('detected', 'validated_case')
       and w.intent_type <> 'nenhum'
       and c.status = 'open'
       and (v_estado.somente_lojas is null or w.seller_id = any (v_estado.somente_lojas))
    on conflict (case_id) do nothing;
    get diagnostics v_novas = row_count;

    -- A edge morreu no meio (timeout, isolate derrubado): volta para a fila.
    update public.app_push_enviadas
       set status = case when tentativas < 3 then 'pendente' else 'falhou' end,
           motivo = 'travada_enviando'
     where status = 'enviando'
       and processado_em < v_agora - interval '3 minutes';

    -- Aviso de oportunidade com mais de meia hora já não ajuda: não manda.
    update public.app_push_enviadas
       set status = 'expirada', processado_em = v_agora
     where status = 'pendente'
       and criado_em < v_agora - interval '30 minutes';

    delete from public.app_push_enviadas
     where criado_em < v_agora - interval '7 days';

    update public.app_push_estado
       set cursor = v_agora, coletado_em = v_agora, ultimo_erro = null
     where id = 1;

    -- Só chama a edge com trabalho a fazer: sem isso seriam 1.440 chamadas por
    -- dia para nada (são ~19 oportunidades por dia no total).
    if exists (select 1 from public.app_push_enviadas
                where status = 'pendente' and tentativas < 3) then
      v_segredo := public.cron_secret_utilizavel();
      if v_segredo is not null then
        -- 120 s como os jobs do site: estourado o timeout, o pg_net derruba a
        -- conexão e a edge morre no meio, sem log.
        perform net.http_post(
          url := public.url_edge_functions() || '/app-push-enviar',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-service-secret', v_segredo),
          body := '{}'::jsonb,
          timeout_milliseconds := 120000
        );
      end if;
    end if;

    return v_novas;
  exception when others then
    raise warning 'app_push_coletar: % (%)', sqlerrm, sqlstate;
    begin
      update public.app_push_estado
         set ultimo_erro = left(sqlstate || ' ' || sqlerrm, 500), coletado_em = v_agora
       where id = 1;
    exception when others then
      null;
    end;
    return 0;
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- Reserva um lote para a edge enviar. SKIP LOCKED: duas chamadas da edge ao
-- mesmo tempo não mandam o mesmo aviso duas vezes.
-- ---------------------------------------------------------------------
create or replace function public.app_push_reservar(limite integer default 50)
returns setof public.app_push_enviadas
language sql
security invoker
set search_path = public
as $$
  with lote as (
    select e.case_id
      from public.app_push_enviadas e
     where e.status = 'pendente'
       and e.tentativas < 3
       and e.criado_em >= now() - interval '30 minutes'
     order by e.criado_em
     limit greatest(1, least(coalesce(app_push_reservar.limite, 50), 200))
       for update skip locked
  )
  update public.app_push_enviadas e
     set status = 'enviando',
         tentativas = e.tentativas + 1,
         processado_em = now(),
         motivo = null
    from lote
   where e.case_id = lote.case_id
  returning e.*;
$$;

-- ---------------------------------------------------------------------
-- Quem recebe: a mesma regra do site para ver o WhatsApp
-- (my_member_permissions + useAreaPermissions.canView): membro ativo da loja
-- que é dono ou tem a área 'omnichannel' com 'ver' ou 'editar'
-- (member_permissions.member_id = seller_members.id). E cada token vai para
-- uma conta só: a de maior visto_em entre todas as que têm aquele token.
-- ---------------------------------------------------------------------
create or replace function public.app_push_alvos(seller_ids uuid[])
returns table (seller_id uuid, nome_loja text, profile_id uuid, token text)
language sql
stable
security invoker
set search_path = public
as $$
  select sm.seller_id, s.name, a.profile_id, a.token
    from public.seller_members sm
    join public.sellers s on s.id = sm.seller_id
    join public.app_push_aparelhos a on a.profile_id = sm.profile_id
   where sm.seller_id = any (app_push_alvos.seller_ids)
     and sm.status = 'active'
     and (sm.role = 'owner'
          or exists (select 1
                       from public.member_permissions mp
                      where mp.member_id = sm.id
                        and mp.seller_id = sm.seller_id
                        and mp.area = 'omnichannel'
                        and mp.access_level in ('ver', 'editar')))
     and not exists (select 1
                       from public.app_push_aparelhos b
                      where b.token = a.token
                        and b.profile_id <> a.profile_id
                        and (b.visto_em > a.visto_em
                             or (b.visto_em = a.visto_em and b.profile_id > a.profile_id)));
$$;

-- ---------------------------------------------------------------------
-- Permissões das funções. O pg_default_acl dá EXECUTE a authenticated (e o
-- de supabase_admin também a anon) em função nova de public: tira de todos e
-- devolve só a quem roda o job e a edge.
-- ---------------------------------------------------------------------
revoke all on function public.app_push_coletar() from public, anon, authenticated;
revoke all on function public.app_push_reservar(integer) from public, anon, authenticated;
revoke all on function public.app_push_alvos(uuid[]) from public, anon, authenticated;
revoke all on function public.app_push_aparelhos_carimbar() from public, anon, authenticated;
grant execute on function public.app_push_coletar() to postgres, service_role;
grant execute on function public.app_push_reservar(integer) to postgres, service_role;
grant execute on function public.app_push_alvos(uuid[]) to postgres, service_role;

-- ---------------------------------------------------------------------
-- Job. Com nome, cron.schedule atualiza o que já existe.
-- ---------------------------------------------------------------------
select cron.schedule('app_push_coletar', '* * * * *', 'select public.app_push_coletar()');

-- =====================================================================
-- Ligar (piloto: só as lojas listadas)
--   update public.app_push_estado
--      set ligado = true, somente_lojas = array['<seller_id>']::uuid[], atualizado_em = now()
--    where id = 1;
-- Todas as lojas: somente_lojas = null.
--
-- Acompanhar
--   select ligado, somente_lojas, cursor, coletado_em, ultimo_erro from public.app_push_estado;
--   select status, motivo, count(*) from public.app_push_enviadas
--    where criado_em >= now() - interval '1 day' group by 1, 2;
--   -- pg_net devolve sucesso ao enfileirar; a resposta da edge fica aqui:
--   select r.status_code, left(r.content, 300) from net._http_response r
--    where r.created >= now() - interval '10 minutes' order by r.created desc limit 10;
--
-- Para desligar (o job continua e sai na primeira linha)
--   update public.app_push_estado set ligado = false, atualizado_em = now() where id = 1;
--   -- e, se quiser parar o job também:
--   select cron.alter_job((select jobid from cron.job where jobname = 'app_push_coletar'), active := false);
--
-- Para remover (nesta ordem: o job antes das funções que ele chama, as
-- funções antes das tabelas de que dependem pelo tipo)
--   select cron.unschedule('app_push_coletar')
--    where exists (select 1 from cron.job where jobname = 'app_push_coletar');
--   drop function if exists public.app_push_coletar();
--   drop function if exists public.app_push_reservar(integer);
--   drop function if exists public.app_push_alvos(uuid[]);
--   drop table if exists public.app_push_enviadas;
--   drop table if exists public.app_push_estado;
--   drop table if exists public.app_push_aparelhos;   -- leva junto o gatilho
--   drop function if exists public.app_push_aparelhos_carimbar();
--   -- e a edge: supabase functions delete app-push-enviar --project-ref <ref>
-- =====================================================================
