# App Android do Segunda Venda

O app é uma casca nativa (Capacitor 8) que abre **https://app.segundavenda.com.br**.
Mudança no site chega ao app sem gerar APK novo. Esta pasta só precisa mudar
quando o assunto é o lado nativo: ícone, nome, botão voltar, downloads,
permissões.

**Quando a mudança do site aparece no app:** o site fica guardado no celular
(service worker, o mesmo do navegador), e o app fica aberto em segundo plano
por dias. A versão nova entra quando o app abre do zero: feche-o pela tela de
apps recentes e abra de novo. Às vezes só na segunda vez (a primeira baixa a
versão nova, a segunda usa).

O APK é compilado pelo GitHub Actions (`.github/workflows/android-apk.yml`) a
cada push que mexe em `mobile/`.

## Dois apps

| | Teste | Oficial |
|---|---|---|
| Nome no celular | **SV Teste** | **Segunda Venda** |
| Pacote | `br.com.segundavenda.app.teste` | `br.com.segundavenda.app` |
| Chave | `android/app/teste.keystore`, no repositório de propósito | sua, nos Secrets do GitHub |
| Quando sai | todo build | só depois de criar a chave (abaixo) |
| Onde baixar | Release **apk-teste** (link fixo) e artefato da execução | artefato da execução |

Os dois instalam lado a lado. Cada build de teste atualiza o anterior por cima,
sem perder o login. O Release `apk-teste` é sempre o mesmo link: a cada build
só o arquivo é trocado.

## Instalar o APK de teste

1. No Chrome do celular, entre em github.com com uma conta que tenha acesso ao
   repositório e abra
   `https://github.com/lemund-marketing/segundavenda/releases/tag/apk-teste`.
2. Em **Assets**, toque em `SegundaVenda-teste.apk` e confirme o download.
3. Abra o arquivo baixado. Se o Android pedir, permita **Instalar apps
   desconhecidos** para o Chrome. Se o Play Protect avisar, escolha
   **Instalar mesmo assim** (o app não está na Play Store, por isso o aviso).

Sem GitHub no celular: baixe no computador e passe o arquivo pelo Drive,
WhatsApp ou cabo.

## O que funciona e o que ainda não funciona

Funciona como no site: login (a sessão fica salva), Omnichannel com atualização
em tempo real, CRM, pedidos, automações, envio de anexo, links de WhatsApp e
e-mail (abrem no app certo), pagamento (abre no navegador).

Ainda **não** funciona no app (use o computador):

- **Conectar o WhatsApp** (Embedded Signup da Meta): o Facebook bloqueia esse
  login dentro de app.
- **Exportar CSV/PDF** e **baixar mídia do chat**: o arquivo é gerado dentro da
  página, e o app ainda não tem como salvá-lo. Aparece o aviso "Este download
  ainda só funciona no computador".
- **Notificação do sistema** (aquela da barra do celular): o som de mensagem
  nova funciona com o app aberto; notificação de verdade exige push (Firebase),
  que é outra etapa.
- **Admin → Entrar como cliente**: abre no navegador, não no app.
- Links de e-mail (confirmar conta, trocar senha) abrem no navegador.

Comportamento nativo (em `android/app/src/main/java/br/com/segundavenda/app/MainActivity.java`):

- **Voltar** anda no histórico do site. No início (`/`), no login (`/auth`) ou
  na página de erro, manda o app para segundo plano (não fecha, não perde a
  sessão).
- **Sem internet ao abrir**: aparece a página `www/offline.html`, com o botão
  "Tentar de novo". Ela também tenta sozinha quando a internet volta.
- **Site fora do ar**: na primeira vez que o app abre, aparece a mesma página.
  Depois disso o app abre a cópia do site guardada no celular, e é o próprio
  site que mostra os erros de carregamento.
- Se o Android matar a página por falta de memória, o app recarrega o site em
  vez de fechar.

## Mudar algo aqui

```bash
cd mobile
npm ci
# edite capacitor.config.json, www/ ou android/
npx cap sync android
```

Commit e push. O workflow compila e publica o APK de teste novo. Para
inspecionar o app de teste pelo computador: celular no cabo, depuração USB
ligada, `chrome://inspect` no Chrome (o app de teste permite; o oficial não).

O ícone foi gerado a partir de `public/favicon-nova.svg` (fundo branco).

## Criar a chave oficial (quando for distribuir para clientes)

A chave é a identidade do app: **quem perder a chave não consegue mais publicar
atualização**, e cada cliente teria que desinstalar e instalar de novo. A partir
de 2027 o Android também vai exigir registrar o pacote junto com essa chave.

Na sua máquina (o `keytool` vem com qualquer Java):

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore segundavenda-oficial.jks \
  -alias sv-oficial -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Segunda Venda, O=Lemund, C=BR"
base64 -w0 segundavenda-oficial.jks > ks.b64      # no macOS: base64 -i segundavenda-oficial.jks -o ks.b64
```

No GitHub: **Settings → Secrets and variables → Actions → New repository
secret**, crie os 4:

| Secret | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | o conteúdo do `ks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | a senha que você digitou no keytool |
| `ANDROID_KEY_ALIAS` | `sv-oficial` |
| `ANDROID_KEY_PASSWORD` | a mesma senha (no formato PKCS12 as duas são iguais) |

(O alias é `sv-oficial`, e não `segundavenda`, de propósito: o GitHub esconde
o valor de todo Secret nos logs, e com `segundavenda` metade do log viraria
`***`.)

Guarde o `.jks` e a senha **fora do GitHub** (gerenciador de senhas, por
exemplo): os Secrets não podem ser lidos de volta. Apague o `ks.b64` depois.
Não coloque o `.jks` no repositório (o `.gitignore` já barra).

No próximo build sai também o `SegundaVenda.apk` oficial, como artefato da
execução (aba Actions → a execução → Artifacts). O passo "Compilar o APK
oficial" mostra a impressão digital (SHA-256) da chave; ela tem que ser igual
em todo build.
