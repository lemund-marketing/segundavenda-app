# App do Segunda Venda

O app Android (e, depois, iPhone) do Segunda Venda. É um projeto **separado do
site**: o site (`lemund-marketing/segundavenda`, app.segundavenda.com.br) é de
outra pessoa, e o app nunca mexe nele. Os dois só dividem o banco (Supabase), e
no banco o app só acrescenta coisas ([CONTRATO-BANCO.md](CONTRATO-BANCO.md)).

As telas vão **dentro do APK** (React + Vite + Tailwind, empacotado pelo
Capacitor 8). O app abre do disco do celular; só os dados vão pela rede, direto
para o Supabase. Não há endereço na internet, Worker na Cloudflare nem service
worker.

## Onde fica cada coisa

| Caminho | O que é |
|---|---|
| `src/app/` | **Código do app.** Telas (`telas/`), peças (`blocos/`), navegação, dados e o lado nativo (`nativo/`). Arquivo novo do app vai aqui. |
| `src/` fora de `src/app/` | **Cópias do site**, no mesmo caminho que têm lá (UI, contextos, cliente do Supabase, tipos do banco, tema). Cada uma está registrada no `ORIGEM.json`. Podem ter ajustes do app. |
| `ORIGEM.json` | De onde veio cada cópia: caminho no site, commit e versão do arquivo. É o que permite trazer correções do site depois. |
| `scripts/comparar-origem.mjs` | Compara as cópias com o site e junta as mudanças (ver abaixo). |
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

Copiar um arquivo novo do site: copie no mesmo caminho e registre no
`ORIGEM.json` (`origem`, `commit` do `test` e `blob` = `git rev-parse <commit>:<caminho>`).
O CI (`npm run checar`) recusa arquivo fora de `src/app/` sem registro.

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
- Telas que o app ainda não tem aparecem no Menu com o ícone de "abre fora" e
  abrem a página do site no navegador do celular.

## Comportamento nativo

Em `android/app/src/main/java/br/com/segundavenda/app/MainActivity.java`:

- **Voltar** primeiro fecha a gaveta, janela ou conversa aberta (a página
  responde por `window.svVoltar()`, em `src/app/nativo/useVoltarFecha.tsx`).
  Sem nada aberto, volta de tela. No Início e no login, manda o app para
  segundo plano (não fecha, não perde a sessão).
- **Sem internet ao abrir**: as telas abrem do mesmo jeito (estão no celular).
  Com sessão guardada, o app mostra "Sem internet" e continua sozinho quando a
  conexão volta, sem deslogar.
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
