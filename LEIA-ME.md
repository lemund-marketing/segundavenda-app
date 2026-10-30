# App do Segunda Venda

O app Android (e, depois, iPhone) do Segunda Venda. É um projeto **separado do
site**: o site (`lemund-marketing/segundavenda`, app.segundavenda.com.br) é de
outra pessoa, e o app nunca mexe nele. Os dois só dividem o banco (Supabase), e
no banco o app só acrescenta coisas ([CONTRATO-BANCO.md](CONTRATO-BANCO.md)).

As telas vão **dentro do APK** (React + Vite + Tailwind, empacotado pelo
Capacitor 8). O app abre do disco do celular; só os dados vão pela rede, direto
para o Supabase. Não há endereço na internet, Worker na Cloudflare nem service
worker.

## Telas

| Tela | Rota | De onde veio no site |
|---|---|---|
| Entrar (só login) | `/entrar` | `src/pages/Auth.tsx` |
| Início | `/` | `src/components/Dashboard.tsx` (o DashboardMobile do redesenho) |
| Pedidos | `/pedidos` | `src/pages/Pedidos.tsx` |
| Clientes | `/clientes` | `src/pages/Clientes.tsx` + `ClientesScreen` |
| Marketplaces | `/lojas`, `/lojas/:marketplace` | `src/pages/Lojas.tsx`, `src/pages/LojaDetail.tsx` |
| WhatsApp | `/omnichannel` (aceita `?client_id=`) | `src/pages/Omnichannel.tsx` |
| CRM | `/crm` | `src/pages/CRM.tsx` |
| Automações | `/workflows` (`?fluxo=<id>` abre o fluxo, só para ver) | `src/pages/Workflows.tsx` |
| Performance | `/workflow-stats`, `/workflow-stats/template/:nome`, `/workflow-stats/email-template/:id`, `/workflow-stats/sms-template/:nome` | `src/pages/WorkflowStats.tsx` e as três páginas de detalhe de modelo |
| Análise RFV | `/rfv` | `src/pages/RFV.tsx` |
| Produtos | `/produtos` | `src/pages/Produtos.tsx` |
| Regiões | `/regioes` | `src/pages/Regioes.tsx` |
| Minha Conta (sem plano) | `/account` | `src/pages/Account.tsx` |
| Menu | `/menu` | o menu do site |

Cada tela é o desenho de **celular** do redesenho (o ramo `isMobile` das
páginas do site), sem o de computador. Uma tela nova entra em
`src/app/App.tsx` (rota, com a guarda de área `ComArea`) e em `TELAS_DO_APP`
(`src/app/navegacao/itensMenu.ts`), que a barra de baixo e o Menu usam.

Ficam no site, abertos no navegador do celular, só o que não pode ou não
funciona dentro do app:

- plano, pagamento e Afiliados (regra da Play, abaixo);
- conectar o número de WhatsApp e as configurações de e-mail e SMS (abas de
  Minha Conta): o login da Meta não funciona dentro de app;
- criar e editar automações: no app o fluxo abre só para ver, ligar ou pausar,
  como no desenho de celular;
- "Adicionar Membro" e exportar pedidos.

Login, Início e Menu vão no pacote inicial; as outras telas ficam em arquivos
próprios, lidos do celular na primeira vez e adiantados um por um logo depois
da abertura, na ordem da barra de baixo.

## Onde fica cada coisa

| Caminho | O que é |
|---|---|
| `src/app/` | **Código do app.** Telas (`telas/`), peças (`blocos/`), navegação, dados e o lado nativo (`nativo/`). Arquivo novo do app vai aqui. |
| `src/` fora de `src/app/` | **Cópias do site**, no mesmo caminho que têm lá (UI, contextos, hooks de dados, componentes das telas, cliente do Supabase, tipos do banco, tema), e as peças novas do redesenho que elas importam. Tudo registrado no `ORIGEM.json`. Ajuste do app numa cópia é marcado com `// app:`. |
| `ORIGEM.json` | De onde veio cada cópia: caminho no site, commit e versão do arquivo. É o que permite trazer correções do site depois. |
| `scripts/comparar-origem.mjs` | Compara as cópias com o site e junta as mudanças (ver abaixo). |
| `scripts/copiar-do-site.mjs` | Copia um arquivo do site para o app e registra no `ORIGEM.json`. |
| `CONTRATO-BANCO.md` | Tudo o que o app lê e grava no banco, e as regras para acrescentar. |
| `android/` | Projeto Android nativo (Capacitor). `MainActivity.java` tem o botão Voltar. |
| `capacitor.config.json` | Pacote `br.com.segundavenda.app`, telas em `dist/`. |
| `.github/workflows/app.yml` | Confere e compila a cada push; gera o APK de teste e o app oficial. |
| `.github/workflows/deriva.yml` | Toda segunda, compara com o site e abre a issue "Mudanças no site para portar". |

## Rodar no computador

```bash
npm ci
npm run dev          # http://localhost:8081, no navegador (use o modo celular do DevTools)
npm run checar       # cópias registradas no ORIGEM.json
npm run tsc && npm run lint && npm run build
```

O app usa o banco de **produção** (`.env`, com o endereço e a chave publicável,
que são públicos). Entre com uma conta de verdade.

Para gerar o APK localmente é preciso o Android Studio (SDK). Normalmente não
precisa: o GitHub compila.

## Cópias do site: como as correções de lá chegam aqui

O site continua mudando. O que ele muda **no banco** (funções, regras, RLS,
WhatsApp, e-mails) chega ao app sozinho, porque o banco é o mesmo. O que ele
muda **nas telas** (rótulos, filtros, contas feitas no navegador) só chega
quando a gente traz:

1. Toda segunda o workflow `deriva.yml` abre/atualiza a issue **Mudanças no site
   para portar**, com a lista.
2. Com um clone do site ao lado, rode:
   ```bash
   node scripts/comparar-origem.mjs --site ../segundavenda --juntar
   ```
   - **Cópias** (fora de `src/app/`): o script junta em 3 vias o que o site mudou
     com os ajustes do app e atualiza o `ORIGEM.json`. Conflito fica listado
     para juntar à mão.
   - **Derivados** (telas do app escritas a partir de uma tela do site): o
     script mostra o `git diff` da origem; a regra é portada à mão.
3. Teste, abra o PR e instale o APK de teste antes de juntar na `main`.

A produção do site sai do computador de quem cuida dele, sem marca no git. A
comparação usa a branch `test`; antes de publicar no app uma regra trazida de
lá, confira se ela já está no ar no site.

Copiar um arquivo novo do site:
`node scripts/copiar-do-site.mjs --site ../segundavenda caminho...` (copia do
`test` e registra). Tela do app escrita a partir de uma do site:
`--derivado src/app/telas/X.tsx <origem...>`. O CI (`npm run checar`) recusa
arquivo fora de `src/app/` sem registro.

As cópias trazem o desenho de celular e o de computador. No app, o
`useIsMobile()` responde sempre "celular" e o Tailwind não tem os tamanhos de
computador (`md:` para cima nunca vale), então elas desenham só o de celular,
também com o aparelho deitado e no tablet.

As bibliotecas estão na **mesma versão que o site roda** (por exemplo
`@supabase/supabase-js` 2.56.1), para as cópias se comportarem igual. Ao
atualizar uma biblioteca no site, atualize aqui também.

## Dois apps

| | Teste | Oficial |
|---|---|---|
| Nome no celular | **SV Teste** | **Segunda Venda** |
| Pacote | `br.com.segundavenda.app.teste` | `br.com.segundavenda.app` |
| Chave | `android/app/teste.keystore`, no repositório de propósito | sua, no Environment `play-store` do GitHub |
| Quando sai | todo push, de qualquer branch | só na `main`, depois de criar a chave (abaixo) |
| Formato | APK (instala direto) | AAB (o que a Google Play aceita) e APK |
| Onde baixar | Release **apk-teste** (link fixo) e artefato da execução | artefato `SegundaVenda-oficial` da execução |

Os dois instalam lado a lado. Cada build de teste atualiza o anterior por cima.
O APK de teste usa a mesma chave e o mesmo pacote do app de teste antigo (a
casca que abria o site): instalar este **substitui** aquele, e é preciso
entrar na conta de novo uma vez.

## Instalar o APK de teste

1. No Chrome do celular, entre em github.com com uma conta que tenha acesso ao
   repositório e abra
   `https://github.com/lemund-marketing/segundavenda-app/releases/tag/apk-teste`.
2. Em **Assets**, toque em `SegundaVenda-teste.apk` e confirme o download.
3. Abra o arquivo baixado. Se o Android pedir, permita **Instalar apps
   desconhecidos** para o Chrome. Se o Play Protect avisar, escolha
   **Instalar mesmo assim** (o app não está na Play Store, por isso o aviso).

Para inspecionar o app de teste pelo computador: celular no cabo, depuração USB
ligada, `chrome://inspect` no Chrome (o de teste permite; o oficial não).

## Regras do app (Google Play)

- **Só login.** Sem cadastro: app que cria conta tem de oferecer exclusão de
  conta dentro dele. A conta é criada pelo site, e o membro novo da loja
  também (em Minha Conta, "Adicionar Membro" abre o site).
- **Sem compra nem troca de plano**, nem link para a página de plano: a Play
  não aceita levar para pagamento fora dela. Por isso Minha Conta não tem as
  abas Plano e Número virtual, e Afiliados fica fora do Menu até ter tela
  própria sem plano.
- **Sem Meta Pixel** ou outro rastreador de anúncio.
- O que fica no site (Afiliados no Menu, as abas de WhatsApp, e-mail e SMS de
  Minha Conta) aparece com o ícone de "abre fora" e abre a página do site no
  navegador do celular.

## Comportamento nativo

Em `android/app/src/main/java/br/com/segundavenda/app/MainActivity.java`:

- **Voltar** primeiro fecha o que estiver aberto: gaveta, janela, lista de
  opções, calendário ou menu (a página responde por `window.svVoltar()`, em
  `src/app/nativo/useVoltarFecha.tsx`; os componentes Sheet, Dialog,
  AlertDialog, Select, Popover e DropdownMenu já entram nessa pilha).
  Também sai da seleção do CRM e da aba Itens de Produtos, e no WhatsApp volta
  da ficha para a conversa e da conversa para a lista. Sem nada aberto, volta
  de tela. No Início e no login, manda o app para segundo plano (não fecha, não
  perde a sessão).
- **Sem internet**: as telas abrem do mesmo jeito (estão no celular). Ao abrir
  com sessão guardada, o app mostra "Sem internet" e continua sozinho quando a
  conexão volta, sem deslogar. Dentro das telas, os números esperam a conexão
  com o aviso "Sem internet" em vez de aparecerem zerados.
- **Sem internet** depende da permissão `ACCESS_NETWORK_STATE` no
  AndroidManifest (normal, não pergunta nada): sem ela o WebView não acompanha
  a rede e `navigator.onLine` fica sempre `true`.
- **Downloads**: arquivo com endereço (o CSV de clientes) abre no navegador.
  Arquivo gerado na própria tela (CSV de produto, de categoria, das colunas e
  da seleção do CRM, dos destinatários em Performance) e baixar mídia de uma
  conversa do WhatsApp ainda não são salvos: aparece o aviso "Este download
  ainda não funciona no app". Exportar pedidos abre o site.
- **Mensagem nova no WhatsApp** com o app aberto toca o som do site; não há
  notificação do sistema (o WebView não tem a API de notificação; push pede
  trabalho nativo).
- Se o Android matar a página por falta de memória, o app recria a tela em vez
  de fechar.
- Link para outro endereço (o site, um arquivo) abre no navegador do celular.
- **Sair da conta** desconecta só este aparelho; o site continua logado no
  navegador.

## Criar a chave oficial (quando for para a Play)

A chave é a identidade do app. Na Google Play, com o **Play App Signing**
(obrigatório para app novo), ela vira a **chave de envio**: o Google guarda a
chave final que assina o app nos celulares, e se a chave de envio se perder, a
Play Console deixa trocar por outra.

Na sua máquina (o `keytool` vem com qualquer Java):

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore segundavenda-oficial.jks \
  -alias sv-oficial -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Segunda Venda, O=Lemund, C=BR"
base64 -w0 segundavenda-oficial.jks > ks.b64      # no macOS: base64 -i segundavenda-oficial.jks -o ks.b64
```

No GitHub deste repositório, a chave fica num **Environment** (não nos Secrets
comuns, que qualquer branch consegue ler):

1. **Settings → Environments → New environment**, nome `play-store`.
2. Em **Deployment branches and tags**, escolha **Selected branches and tags**
   e adicione só a regra `main`.
3. Em **Environment secrets → Add environment secret**, crie os 4:

| Secret | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | o conteúdo do `ks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | a senha que você digitou no keytool |
| `ANDROID_KEY_ALIAS` | `sv-oficial` |
| `ANDROID_KEY_PASSWORD` | a mesma senha (no formato PKCS12 as duas são iguais) |

(O alias é `sv-oficial`, e não `segundavenda`, de propósito: o GitHub esconde
o valor de todo Secret nos logs, e com `segundavenda` metade do log viraria
`***`.)

Guarde o `.jks` e a senha **fora do GitHub** (gerenciador de senhas): os
Secrets não podem ser lidos de volta. Apague o `ks.b64` depois. O `.gitignore`
já barra o `.jks`.

Se a chave já foi criada para o repositório do site, use **a mesma** aqui (o
`.jks` e a senha que você guardou): o app oficial sai só deste repositório.

## Token de leitura do site (para a comparação semanal)

O `deriva.yml` precisa ler o repositório do site. Crie um token que **só lê**:

1. github.com → **Settings → Developer settings → Fine-grained tokens →
   Generate new token**.
2. **Resource owner**: `lemund-marketing`. **Repository access**: *Only select
   repositories* → `lemund-marketing/segundavenda`.
3. **Permissions → Repository permissions → Contents: Read-only** (e nada mais).
4. Em `segundavenda-app` → **Settings → Secrets and variables → Actions → New
   repository secret**: nome `SITE_LEITURA_TOKEN`, valor = o token.

Se a organização exigir aprovação de token, um dono da organização aprova em
**Settings → Personal access tokens → Pending requests**.
