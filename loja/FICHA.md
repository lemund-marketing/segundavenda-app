# Ficha da Google Play: app Segunda Venda

Textos e respostas para publicar o app `br.com.segundavenda.app` na Google
Play. Cada bloco entre cercas está pronto para colar. A contagem de
caracteres conta tudo, inclusive espaços e quebras de linha, que é como a Play
Console conta.

Conferido no código (9/11/2026): `android/app/src/main/AndroidManifest.xml`,
`src/app/nativo/push.ts`, `src/integrations/supabase/client.ts`,
`src/contexts/AuthContext.tsx`, `src/app/telas/WhatsApp.tsx`,
`src/app/telas/Pedidos.tsx`, `src/components/clients/EditClientDialog.tsx`,
`android/app/build.gradle`, `LEIA-ME.md` e `CONTRATO-BANCO.md`.

---

## 1) Nome do app (máx. 30)

Recomendado:

```text
Segunda Venda
```
Caracteres: 13

Alternativas, se quiser deixar claro para quem é já no nome:

```text
Segunda Venda para Lojistas
```
Caracteres: 27

```text
Segunda Venda: Pós-venda
```
Caracteres: 24

A recomendação é ficar com **Segunda Venda**: é o mesmo nome que aparece no
celular (`appName` no `capacitor.config.json`), e a Play desconfia de nome com
palavra-chave colada. As alternativas são aceitas pela política, mas não
ajudam muito: quem procura o app é quem já é cliente e já conhece a marca.

---

## 2) Descrição curta (máx. 80)

```text
Pedidos, clientes, WhatsApp e oportunidades de recompra da sua loja no celular.
```
Caracteres: 79

Outra opção:

```text
Acompanhe o pós-venda da sua loja e responda aos clientes no WhatsApp.
```
Caracteres: 70

---

## 3) Descrição completa (máx. 4000)

```text
O Segunda Venda é o app para lojistas que já usam a plataforma Segunda Venda de pós-venda e recompra pelo WhatsApp. Com ele você acompanha a sua loja pelo celular: pedidos, clientes, conversas, funil de vendas e resultado das automações.

Importante: o app é só para quem já tem conta na Segunda Venda. Não há cadastro pelo app. A conta e a loja são criadas pela equipe Segunda Venda no painel web.

O QUE DÁ PARA FAZER NO APP

• Início: resumo da loja com faturamento, pedidos recentes, funil de clientes, marketplaces e regiões.
• Pedidos: lista e busca de pedidos, com status do pedido, marketplace, estado e atalho para chamar o cliente no WhatsApp.
• Clientes: base de clientes da loja com filtros, aniversariantes do dia, clientes de uma compra só e indicadores de crescimento.
• Marketplaces: desempenho de cada canal de venda, com clientes, produtos e regiões de cada um.
• WhatsApp: atenda os clientes da loja, envie mensagens, modelos aprovados, respostas rápidas e anexos, e veja a ficha de cada cliente ao lado da conversa.
• Oportunidades: a aba que mostra as conversas em que a análise automática da Segunda Venda identificou intenção de compra.
• CRM: funil em colunas para mover clientes de fase, criar e renomear fases e disparar uma automação para um cliente.
• Automações: veja os fluxos da loja, ligue ou pause cada um e acompanhe os disparos.
• Performance: entregas, leituras e respostas das mensagens de WhatsApp, e-mail e SMS, com o detalhe de cada modelo.
• Análise RFV: clientes separados por recência, frequência e valor de compra.
• Produtos: ranking de produtos e categorias, com edição de nome, SKU e categoria.
• Regiões: vendas por estado.
• Minha Conta: dados cadastrais e membros da equipe, com as permissões de cada um.

Quem tem mais de uma loja na conta troca de loja pelo próprio app. Cada membro da equipe vê só as áreas que o dono da loja liberou.

NOTIFICAÇÕES DE OPORTUNIDADE

Quando uma conversa de WhatsApp é marcada como oportunidade de venda, o app pode avisar no celular do dono e dos membros que acompanham o WhatsApp da loja. Tocar na notificação abre a conversa certa, mesmo com o app fechado. A notificação mostra só o primeiro nome do cliente, sem telefone nem conteúdo da conversa. Você pode desligar o canal "Oportunidades de venda" nas configurações do Android a qualquer momento. Ao sair da conta, o aparelho para de receber as notificações dela.

O QUE CONTINUA NO PAINEL WEB

Conectar o número de WhatsApp, configurar e-mail e SMS, criar e editar automações, adicionar membros e exportar pedidos são feitos no painel web da Segunda Venda. O app abre essas páginas no navegador do celular quando você toca nelas.

PARA QUEM É

Para lojistas de e-commerce e marketplace que são clientes da Segunda Venda e já têm acesso ao painel. Não é um app de compras para o consumidor final.

COMO ENTRAR

1. Instale o app.
2. Entre com o mesmo e-mail e a mesma senha do painel web da Segunda Venda.
3. Se esqueceu a senha, toque em "Esqueci minha senha" na tela de entrada.

Ainda não é cliente? Conheça a Segunda Venda em segundavenda.com.br.

Dúvidas ou suporte: suporte@segundavenda.com.br
```
Caracteres: 3137

O rótulo "Esqueci minha senha" é o mesmo da tela de Entrar
(`src/app/telas/Entrar.tsx`).

Sobre as notificações: hoje o envio está só no piloto (LEIA-ME,
"Notificações de oportunidade (servidor)": `app_push_estado.somente_lojas`
começa vazio e o piloto tem uma loja). Quase todo lojista que instalar agora
não vai receber aviso. Por isso os três lugares que falam de notificação usam
forma cuidadosa, e todos mudam juntos quando o envio for ligado para todas as
lojas:

- descrição completa (acima): "o app pode avisar" → pode virar "o app avisa";
- notas da versão (item 5): "o app já está pronto para avisar..." → pode virar
  "Notificações de oportunidade de venda que abrem direto na conversa";
- print `imagens/03-notificacao.png`: legenda "Aviso no celular quando surge
  uma oportunidade", sem prometer um aviso para cada oportunidade. Se preferir
  não mostrar a notificação antes do envio geral, publique a ficha sem esse
  print (os outros sete bastam) e acrescente-o depois.

---

## 4) Categoria, tags, contato e site

| Campo | Valor |
|---|---|
| Tipo | App (não jogo) |
| Gratuito ou pago | Gratuito (depois de publicado como gratuito não dá para virar pago) |
| Categoria | **Empresa** (Business). Segunda opção: Produtividade |
| Tags (Play Console, "Gerenciar tags"; escolher até 5 da lista que a Console oferece) | CRM; Vendas; Gestão de negócios; Atendimento ao cliente; Comércio eletrônico (usar os nomes mais próximos que aparecerem na lista) |
| E-mail de contato (obrigatório, público) | suporte@segundavenda.com.br |
| Telefone | deixar em branco (opcional e fica público) |
| Site | https://segundavenda.com.br |
| Política de privacidade | https://segundavenda.com.br/privacidade/ (depois de acrescentar o parágrafo do item 8) |
| Nome do desenvolvedor | o da conta de organização (LEMUND MARKETING LTDA, ou o nome comercial "Segunda Venda" se a conta permitir) |

---

## 5) Notas da versão (máx. 500), primeira publicação

```text
Primeira versão do app Segunda Venda para lojistas.

• Início, Pedidos, Clientes, Marketplaces, CRM, Análise RFV, Produtos e Regiões no celular.
• WhatsApp com atendimento, modelos, respostas rápidas, anexos e ficha do cliente.
• Automações: veja, ligue ou pause os fluxos da loja.
• Performance das mensagens de WhatsApp, e-mail e SMS.
• O app já está pronto para avisar de oportunidades de venda; o envio está sendo liberado aos poucos.

Entre com o mesmo e-mail e senha do painel web.
```
Caracteres: 487

O campo de notas da Play usa a marcação `<pt-BR> ... </pt-BR>` quando a
versão tem mais de um idioma. Com um idioma só, cole o texto puro.

---

## 6) Segurança dos dados (Data safety)

### Base: o que o código faz

| O que | Onde no código | Sai do aparelho? |
|---|---|---|
| E-mail e senha no login (Supabase Auth, HTTPS) | `AuthContext.tsx` | Sim |
| Login que falhou: registro de segurança com o motivo e as 3 primeiras letras do e-mail (RPC `log_security_event`) | `AuthContext.tsx` | Sim |
| Sessão de login guardada no aparelho (`localStorage` do WebView; `allowBackup="false"`) | `client.ts`, `AndroidManifest.xml` | Não (fica no aparelho) |
| Dados cadastrais da conta: nome, empresa, CNPJ, WhatsApp, editáveis em Minha Conta | `CONTRATO-BANCO.md` (`profiles`) | Sim, quando a pessoa salva |
| Dados dos clientes da loja (nome, telefone, e-mail, pedidos, conversas): vêm do servidor; a pessoa pode editar a ficha do cliente: nome, WhatsApp, e-mail, data de nascimento e endereço (rua, complemento, cidade, UF, CEP) | `CONTRATO-BANCO.md` (`clients`, `orders`, `messages`); `EditClientDialog.tsx` (schema e `update` em `clients`) | Sim, quando a pessoa edita ou envia |
| Mensagens de WhatsApp escritas pela pessoa para os clientes da loja | edge `send-whatsapp-cloud` | Sim |
| Anexos escolhidos pela pessoa na conversa (imagem, vídeo, áudio, PDF, Word, Excel), pelo seletor de arquivos do sistema, sem permissão de armazenamento | `WhatsApp.tsx` (`accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"`), bucket `chat-media` | Sim |
| Token de notificação do Firebase (FCM), por conta e aparelho, tabela `app_push_aparelhos` (`profile_id, token, plataforma, visto_em`); apagado ao sair da conta | `push.ts` | Sim |
| Downloads (CSV, mídia da conversa) salvos em Downloads pelo MediaStore | `ArquivosPlugin.java` | Não (vai para o aparelho) |
| Analytics, Crashlytics, anúncios, ID de publicidade, localização, contatos, câmera, microfone | nenhuma dependência nem permissão (`build.gradle` só traz `firebase-messaging` pelo plugin de push) | Não existe no app |

Permissões do `AndroidManifest.xml` do app: `INTERNET`, `ACCESS_NETWORK_STATE`,
`POST_NOTIFICATIONS`. O `firebase-messaging` acrescenta no manifesto final as
dele (`WAKE_LOCK`, `com.google.android.c2dm.permission.RECEIVE`). Depois de
enviar o AAB, conferir em **Explorador de pacotes de apps → Permissões** que
não apareceu `com.google.android.gms.permission.AD_ID`; se aparecer, a
resposta sobre ID de publicidade muda.

Prestadores de serviço: Supabase (banco e login) e Google Firebase (entrega
das notificações) processam os dados em nome da Segunda Venda. Pela definição
da Play, envio a prestador de serviço que processa em nome do desenvolvedor
**não é compartilhamento**.

### Perguntas gerais do formulário

| Pergunta | Resposta |
|---|---|
| O app coleta ou compartilha algum dos tipos de dados do usuário exigidos? | **Sim** |
| Todos os dados coletados são criptografados em trânsito? | **Sim** (HTTPS/TLS para Supabase e Firebase; `allowMixedContent: false`) |
| Quais métodos de criação de conta o app aceita? | **Meu app não permite que os usuários criem uma conta** (o app só faz login; as contas são criadas pela equipe Segunda Venda ou pelo dono da loja no painel web; não há `signUp` no app). Com essa resposta a Console normalmente não pede o link de exclusão de conta |
| Os usuários podem pedir a exclusão dos dados? | **Sim**: por e-mail ao suporte, como explica a política de privacidade (seção do app e página de exclusão, abaixo) |
| Revisão de segurança independente (MASA) | Não |
| Compromisso com a Política de Famílias | Não se aplica (público 18+) |

### Tipos de dados, item por item

Legenda: **Coletado** = sai do aparelho para o servidor da Segunda Venda.
**Compartilhado** = enviado a terceiro que não é prestador de serviço (em
todos os itens: **Não**). **Processamento temporário** = em todos os itens:
**Não** (os dados ficam guardados no servidor).

| Categoria da Play | Tipo | Coletado | Compartilhado | Obrigatório ou opcional | Finalidades |
|---|---|---|---|---|---|
| Informações pessoais | **Endereço de e-mail** | Sim | Não | Obrigatório (login) | Funcionalidade do app; Gerenciamento de conta; Prevenção de fraudes, segurança e compliance (registro de login que falhou) |
| Informações pessoais | **Nome** | Sim | Não | Opcional (Minha Conta; ficha do cliente da loja) | Funcionalidade do app; Gerenciamento de conta |
| Informações pessoais | **Número de telefone** | Sim | Não | Opcional (WhatsApp em Minha Conta; telefone do cliente na ficha) | Funcionalidade do app; Gerenciamento de conta |
| Informações pessoais | **Endereço** (endereço do cliente da loja na ficha: rua, complemento, cidade, UF, CEP) | Sim | Não | Opcional | Funcionalidade do app |
| Informações pessoais | **Outras informações** (nome da empresa e CNPJ em Minha Conta; data de nascimento do cliente da loja na ficha) | Sim | Não | Opcional | Funcionalidade do app; Gerenciamento de conta |
| Mensagens | **Outras mensagens no app** (mensagens de WhatsApp que a pessoa envia aos clientes da loja) | Sim | Não | Opcional | Funcionalidade do app |
| Fotos e vídeos | **Fotos**; **Vídeos** (anexos da conversa) | Sim | Não | Opcional | Funcionalidade do app |
| Arquivos de áudio | **Outros arquivos de áudio** (anexo de áudio) | Sim | Não | Opcional | Funcionalidade do app |
| Arquivos e documentos | **Arquivos e documentos** (PDF, Word, Excel anexados) | Sim | Não | Opcional | Funcionalidade do app |
| IDs do dispositivo ou outros IDs | **IDs do dispositivo ou outros IDs** (token de notificação do Firebase) | Sim | Não | Opcional (só existe se a pessoa permitir as notificações) | Funcionalidade do app (entregar a notificação de oportunidade) |

Não marcar (o app não coleta): Local, Informações financeiras, Saúde e
condicionamento físico, Contatos, Agenda, Atividade no app (interações,
histórico de pesquisa no app, apps instalados), Navegação na Web, Informações
e desempenho do app (registros de falhas, diagnósticos), ID de publicidade,
Gravações de voz ou som, Raça e etnia, Crenças, Orientação sexual.

Observação sobre os dados dos clientes da loja: nomes, telefones, pedidos e
conversas dos consumidores vêm do servidor e só são mostrados. Mostrar dado
que já está no servidor não conta como coleta pelo app; por isso as linhas
acima cobrem o que a pessoa **digita ou envia** pelo app (editar a ficha,
mandar mensagem ou anexo), que vai para o servidor. O CPF aparece na ficha,
mas não é editável no app, por isso não entra.

### Exclusão de conta

Linha escolhida: o app **não cria contas**. A conta do dono é criada pela
equipe Segunda Venda, e a de cada membro, pelo dono no painel web (em Minha
Conta, "Adicionar Membro" só abre o painel no navegador; o app não tem
cadastro). Por isso, no formulário, a resposta é "Meu app não permite que os
usuários criem uma conta", e o link de exclusão **não** vai na Play Console:
ele fica na política de privacidade (item 8), que já aponta para a página
abaixo. Se um dia o app ganhar cadastro próprio, a resposta muda para "Nome de
usuário e senha" e o link passa a ser obrigatório no formulário.

Mesmo sem obrigação, vale ter a página, seguindo o que a Play pede quando o
link é exigido. Ela precisa (Central de Ajuda da Play, "Understanding Google Play's app
account deletion requirements",
https://support.google.com/googleplay/android-developer/answer/13327111):

- abrir sem erro e citar o nome do app ou do desenvolvedor como está na Play;
- mostrar o caminho de exclusão com destaque (pode ser e-mail ao suporte ou
  formulário);
- dizer quais dados são apagados, quais ficam guardados e por quanto tempo;
- não exigir abrir o app nem reinstalá-lo.

**Proposta:** criar a página `https://segundavenda.com.br/excluir-conta/`
(ou uma seção com âncora na política, `https://segundavenda.com.br/privacidade/#excluir-conta`;
a Play aceita, desde que a seção apareça com destaque). Precisa criar: hoje a
política não tem essa seção. Texto sugerido para a página:

```text
Excluir conta e dados: Segunda Venda

Para pedir a exclusão da sua conta da Segunda Venda (painel web e app Segunda Venda para Android) e dos dados ligados a ela, envie um e-mail para suporte@segundavenda.com.br com o assunto "Excluir conta", a partir do e-mail cadastrado na conta, informando o nome da loja.

O que é apagado: os dados de login e de cadastro da conta (nome, e-mail, telefone, empresa, CNPJ), os acessos de membros da equipe e os registros de aparelhos usados para notificações do app.

Se você é o dono da loja, a exclusão também remove os vínculos da loja com clientes, pedidos e conversas, e as automações da loja, exceto o que a lei obriga a guardar.

O que pode ficar guardado: registros exigidos por lei, como os registros de acesso (Marco Civil da Internet, art. 15: 6 meses) e documentos fiscais e de cobrança pelo prazo legal.

Prazo: confirmamos o pedido em até 2 dias úteis e concluímos a exclusão em até 15 dias.

Para apenas deixar de receber notificações no celular, basta sair da conta no app ou desligar o canal "Oportunidades de venda" nas configurações do Android.
```
Caracteres: 1099

Antes de publicar, confirmar com quem cuida do banco:

- o que é de fato apagado na exclusão do dono. A tabela `clients` é
  compartilhada entre as lojas que atendem a mesma pessoa (comentário em
  `src/components/clients/EditClientDialog.tsx`), então apagar "os clientes"
  de uma conta pode afetar outra loja; por isso o texto fala em "vínculos da
  loja". Se o que se apaga for outra coisa, ajustar a frase;
- os prazos (2 dias úteis para confirmar, 15 dias para concluir) e o que a lei
  obriga a guardar. São sugestões; a empresa precisa conseguir cumprir.

---

## 7) Classificação de conteúdo, público-alvo, acesso ao app e anúncios

### Classificação de conteúdo (questionário IARC)

| Pergunta | Resposta |
|---|---|
| E-mail para contato da classificação | suporte@segundavenda.com.br |
| Categoria do app | **Todos os outros tipos de app** (não é jogo, rede social nem app de notícias; se a Console oferecer "Utilitário, produtividade, comunicação ou outro", escolher esse) |
| Violência, sangue, medo | Não |
| Sexualidade, nudez | Não |
| Linguagem imprópria | Não |
| Drogas, álcool, tabaco | Não |
| Jogos de azar (simulados ou com dinheiro) | Não |
| Humor grosseiro / conteúdo ofensivo | Não |
| Os usuários podem interagir ou trocar conteúdo com outras pessoas pelo app? | **Sim** (o lojista troca mensagens de WhatsApp com os clientes da loja). Isso gera o aviso "Usuários interagem", que é o correto |
| O app compartilha a localização do usuário com outras pessoas? | Não |
| O app permite compras de produtos digitais? | Não |
| O app dá acesso irrestrito à internet (navegador)? | Não (links externos abrem no navegador do celular, fora do app) |
| Conteúdo gerado por usuários / moderação | O conteúdo trocado é a conversa privada entre a loja e o cliente dela, não é publicado para outros usuários |

Resultado esperado: classificação livre ou 12 anos, conforme o IARC, com o
aviso "Usuários interagem".

### Público-alvo e conteúdo

| Pergunta | Resposta |
|---|---|
| Faixas etárias do público-alvo | **18 anos ou mais** (só essa) |
| O app atrai crianças sem querer? | Não (app de gestão para empresas, sem personagens, jogos ou linguagem infantil) |
| Ficha da loja voltada para crianças? | Não |

### Acesso ao app (conta de teste para o revisor)

Escolher **"Todas ou algumas funcionalidades são restritas"** e informar uma
conta. O revisor do Google não pode entrar com conta de loja real, e nenhum
dado real de consumidor pode aparecer para ele. Antes de enviar, é preciso:

1. Criar, pelo painel web, uma loja de demonstração (por exemplo "Loja
   Demonstração") com dados fictícios: clientes com nomes e telefones
   inventados (telefones de faixa fictícia, que não pertençam a ninguém),
   pedidos, algumas conversas de WhatsApp, fases no CRM, uma ou duas
   automações e pelo menos uma oportunidade na aba Oportunidades.
2. Criar a conta do revisor como **dona** dessa loja (e-mail próprio, por
   exemplo `revisao-play@segundavenda.com.br`, com senha forte que não expire).
3. Não ligar um número de WhatsApp real a essa loja: assim o envio não chega a
   ninguém. Avisar isso nas instruções.
4. Se as notificações já estiverem ligadas no servidor, incluir essa loja na
   lista do piloto (`app_push_estado.somente_lojas`) para o revisor poder ver
   uma chegar; senão, dizer nas instruções que a notificação depende de uma
   nova oportunidade.
5. Manter a conta ativa enquanto o app estiver publicado: a Play revisa de
   novo a cada atualização.

Texto para o campo de instruções (até 500 caracteres; colar e-mail e senha
nos campos próprios):

```text
App só para lojistas clientes da Segunda Venda; não há cadastro pelo app. Use a conta de teste, dona da loja fictícia "Loja Demonstração". Todos os dados são fictícios. Telas no menu de baixo e em Menu: Início, Pedidos, Clientes, WhatsApp (aba Oportunidades), CRM, Automações, Performance. A loja não tem número de WhatsApp real ligado: enviar mensagem não chega a ninguém. A permissão de notificação é pedida logo após o login.
```
Caracteres: 428

### Anúncios

| Pergunta | Resposta |
|---|---|
| O app contém anúncios? | **Não** |
| O app usa o ID de publicidade? | **Não** (sem SDK de anúncios ou analytics; conferir a permissão `AD_ID` no explorador de pacotes, item 6) |

### Outras declarações da seção "Conteúdo do app"

| Declaração | Resposta |
|---|---|
| Apps de notícias | Não é app de notícias |
| Apps governamentais | Não |
| Recursos financeiros | O app não oferece recursos financeiros |
| Apps de saúde | O app não tem recursos de saúde |
| Política de privacidade | https://segundavenda.com.br/privacidade/ |
| Serviço em primeiro plano, intent em tela cheia, acesso a fotos e vídeos, acessibilidade | Não usa (não aparecem as perguntas) |

---

## 8) Parágrafo para a política de privacidade do site

Para a pessoa do site acrescentar em https://segundavenda.com.br/privacidade/,
como uma seção própria (com âncora `#app` e, se for o caso, `#excluir-conta`):

```text
Aplicativo Segunda Venda para Android

O aplicativo Segunda Venda (br.com.segundavenda.app), publicado pela LEMUND MARKETING LTDA (CNPJ 28.895.940/0001-05), é de uso exclusivo de lojistas clientes da plataforma e de membros da equipe que eles autorizarem. O aplicativo acessa os mesmos dados do painel web, com o mesmo login, e segue esta política. Pelo aplicativo tratamos: o e-mail e a senha de acesso; os dados cadastrais e dos clientes da loja que o usuário consulta, edita ou envia (incluindo mensagens e anexos enviados pelo WhatsApp); e, se o usuário permitir notificações, um identificador de notificação do aparelho, gerado pelo Firebase Cloud Messaging (Google), guardado junto da conta do usuário. Esse identificador serve só para avisar sobre oportunidades de venda identificadas nas conversas da loja; a notificação mostra apenas o primeiro nome do cliente. O identificador é apagado quando o usuário sai da conta no aplicativo, e deixa de valer quando o aplicativo é desinstalado. O aplicativo não usa publicidade, não usa identificador de publicidade, não coleta localização nem contatos do aparelho, e não usa ferramentas de análise de uso. O Google (Firebase) atua apenas como prestador de serviço na entrega das notificações. Os dados trafegam criptografados (HTTPS). Para pedir a exclusão da conta e dos dados, envie um e-mail para suporte@segundavenda.com.br com o assunto "Excluir conta", a partir do e-mail cadastrado; os detalhes estão em segundavenda.com.br/excluir-conta/. Para só deixar de receber notificações, saia da conta no aplicativo ou desligue as notificações nas configurações do Android.
```
Caracteres: 1623

---

## 9) Checklist da Play Console, na ordem em que se preenche

### Teste fechado de 12 testadores por 14 dias: vale para esta conta?

A regra (pelo menos 12 testadores inscritos sem parar por 14 dias num teste
fechado antes de pedir acesso à produção) está na página oficial do Google
"App testing requirements for new personal developer accounts"
(https://support.google.com/googleplay/android-developer/answer/14151465). O
texto oficial fala só de **contas pessoais** criadas depois de 13/11/2023 e
não cita contas de organização. Vários guias de terceiros de 2026 afirmam que
contas de organização ficam fora da regra, por exemplo:

- https://ontest.app/blog/google-play-12-testers-14-days-requirement-explained
- https://www.choicely.com/blog/google-play-12-tester-rule
- https://dev.to/tizoc_araujo_3cd9fb67191f/google-play-personal-account-vs-organization-account-does-the-12-tester-rule-apply-to-you-242n

Conclusão: com a conta de **organização** da LEMUND MARKETING LTDA, o teste
fechado de 12/14 não deve ser exigido. Confirmar no Painel da Play Console:
se ele mostrar a tarefa "Executar um teste fechado" / "Solicitar acesso à
produção", a regra vale para a conta e é preciso cumprir. Se a conta tiver
sido aberta como **pessoal**, a regra vale (12 testadores, 14 dias seguidos,
depois o pedido de acesso, que o Google responde em até cerca de 7 dias).

Mesmo sem exigência, fazer um teste interno antes, com a equipe.

### Ordem

1. **Conta de desenvolvedor** (organização): D-U-N-S da LEMUND MARKETING
   LTDA, verificação de identidade e do site, e-mail e telefone de contato da
   conta (não ficam públicos). Taxa única de US$ 25.
2. **Criar app**: nome "Segunda Venda", idioma padrão Português (Brasil), App,
   Gratuito, aceitar as declarações (políticas e leis de exportação dos EUA).
3. **Antes**, no site: publicar o parágrafo do item 8 na política de
   privacidade e a página de exclusão de conta (item 6). A política precisa
   abrir quando o formulário for enviado, e o link da exclusão citado nela
   também.
4. **Antes**, no painel web: criar a loja de demonstração e a conta do
   revisor (item 7).
5. Painel → **Configurar o app** → "Conteúdo do app", nesta ordem:
   1. Política de privacidade (URL).
   2. Acesso ao app (conta e instruções do item 7).
   3. Anúncios: Não.
   4. Classificação de conteúdo (questionário IARC, item 7).
   5. Público-alvo: 18+.
   6. Apps de notícias: Não.
   7. Segurança dos dados (item 6); criação de conta: "não permite".
   8. Apps governamentais: Não.
   9. Recursos financeiros: nenhum.
   10. Apps de saúde: nenhum.
   11. ID de publicidade: Não usa.
6. **Configurações da loja**: categoria Empresa, tags, e-mail, site (item 4).
7. **Ficha principal da loja**: nome, descrição curta e completa (itens 1 a
   3); ícone 512 x 512 PNG; gráfico de recursos 1024 x 500; pelo menos 2
   capturas de celular (recomendado 4 a 8, 9:16, só com a loja de
   demonstração e dados fictícios); capturas de tablet são opcionais.
8. **Assinatura do app**: o primeiro AAB enviado ativa o Play App Signing; a
   chave do GitHub (`play-store`) vira a chave de envio (LEIA-ME, "Criar a
   chave oficial").
9. **Teste interno**: criar versão, enviar o AAB `SegundaVenda-oficial`,
   notas da versão (item 5), lista de testadores da equipe. Instalar pela Play,
   entrar, conferir notificação e telas. Conferir as permissões no explorador
   de pacotes (sem `AD_ID`).
10. **Teste fechado** (só se o Painel exigir; ver acima): 12+ testadores
    inscritos por 14 dias seguidos; depois "Solicitar acesso à produção".
11. **Produção**: países (Brasil), promover a versão testada, notas da versão,
    "Enviar para revisão". Opcional: ligar a **Publicação gerenciada** para
    escolher o momento de publicar depois da aprovação.
12. **Depois de aprovado**: acompanhar Android vitals e as avaliações; manter
    a conta do revisor ativa para as próximas versões.

Requisitos técnicos já atendidos pelo projeto: `targetSdkVersion 36`,
`minSdkVersion 24`, formato AAB, `versionCode` sempre crescente
(`android/app/build.gradle`).
