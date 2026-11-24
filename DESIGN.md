---
name: filmes
description: Recomendação de filmes para quem vai assistir junto, com o pedido da noite num letreiro de cinema de rua.
colors:
  ground: '#f3f3f0'
  surface: '#ffffff'
  surface-2: '#e9e9e4'
  ink: '#141414'
  ink-2: '#5c5c58'
  rule: '#d9d9d3'
  marquee-red: '#c8102e'
  on-red: '#ffffff'
  marquee-panel: '#fbfaf5'
  bulb: '#f2b632'
  star: '#b07a00'
  person-1: '#2c62c4'
  person-2: '#1b7a50'
  person-3: '#a63d8d'
  person-4: '#b9580f'
  person-5: '#6650c4'
  person-6: '#0b7676'
  dark-ground: '#0f0f11'
  dark-surface: '#1a1a1d'
  dark-surface-2: '#26262a'
  dark-ink: '#f2f2ee'
  dark-ink-2: '#a3a39d'
  dark-rule: '#2e2e33'
  dark-marquee-red: '#d23347'
  dark-marquee-red-text: '#ec6273'
  dark-marquee-panel: '#f4f1e6'
  dark-star: '#f2b632'
  dark-person-1: '#6c9cf0'
  dark-person-2: '#4cbf8a'
  dark-person-3: '#e07ccb'
  dark-person-4: '#f0954a'
  dark-person-5: '#a593f5'
  dark-person-6: '#3fc1c1'
typography:
  letter:
    fontFamily: 'Antonio, Arial Narrow, sans-serif'
    fontSize: '22px'
    fontWeight: 700
    lineHeight: 1
    letterSpacing: '0.02em'
  position:
    fontFamily: 'Antonio, Arial Narrow, sans-serif'
    fontSize: '26px'
    fontWeight: 700
    lineHeight: 1
  title:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '19px'
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.5
  synopsis:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '15.5px'
    fontWeight: 400
    lineHeight: 1.5
  evidence:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '12px'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '0.05em'
  meta:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.4
rounded:
  panel: '4px'
  stamp: '3px'
  poster: '6px'
  field: '8px'
  card: '10px'
  pill: '999px'
  round: '50%'
spacing:
  xs: '6px'
  sm: '8px'
  md: '14px'
  lg: '16px'
  xl: '20px'
components:
  marquee:
    backgroundColor: '{colors.marquee-panel}'
    textColor: '{colors.ink}'
    typography: '{typography.letter}'
    rounded: '{rounded.panel}'
    padding: '10px 12px 9px'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '14px'
  poster:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.ink-2}'
    rounded: '{rounded.poster}'
    width: '104px'
  chip:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.ink}'
    rounded: '{rounded.pill}'
    padding: '3px 9px'
  toggle:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.pill}'
    padding: '0 14px'
    height: '44px'
  toggle-on:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.ink}'
    rounded: '{rounded.pill}'
    height: '44px'
  button-primary:
    backgroundColor: '{colors.marquee-red}'
    textColor: '{colors.on-red}'
    rounded: '{rounded.pill}'
    padding: '0 22px'
    height: '44px'
  field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.field}'
    padding: '9px 12px'
    height: '44px'
  badge-new:
    backgroundColor: '{colors.bulb}'
    textColor: '{colors.ink}'
    rounded: '{rounded.pill}'
    padding: '4px 8px'
  stamp:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.marquee-red}'
    typography: '{typography.letter}'
    rounded: '{rounded.stamp}'
    padding: '5px 8px 4px'
  avatar:
    textColor: '{colors.on-red}'
    rounded: '{rounded.round}'
    size: '24px'
---

<!-- SEED: mundo escolhido no #78 sem a escolha do Dono (rodada sem resposta) e conferido só no protótipo prototypes/cartaz.prototype.html. Rode /impeccable document de novo quando o componente Cartaz existir em frontend/, para trocar o seed pelos tokens do código. -->

# Design System: filmes

## Overview

**Creative North Star: "Letreiro de rua"**

O pedido da noite aparece como o letreiro de um cinema de rua: painel aceso, letras pretas condensadas em placas, moldura vermelha. É a primeira coisa da tela, e é onde o Dono confere que o pedido foi entendido ("VOCÊS DOIS · ATÉ 1H40 · ALGO LEVE"). Abaixo do letreiro, o filmes é uma tela de trabalho limpa: cards, listas, toggles e campos que qualquer um sabe usar. A capa do filme é a única imagem forte; nada compete com ela.

O mundo parte do Cartaz de hoje (`filmes/cartaz/cartaz.css`), que já tinha a estrutura certa e nenhuma identidade: ele herdava as cores do T3 Code. Ficam o card com capa à esquerda, os pontos por Presente sobre a capa, os avatares com inicial, a Força em três pontos e os chips de ano, duração e gêneros. Entram o letreiro, o vermelho-cinema, as cores fixas por Presente, a letra condensada nos números de posição e o carimbo de estado.

O letreiro de rua venceu por sorteio entre sete mundos do cinema de casa brasileiro (locadora de bairro, ingresso, programação do jornal, catálogo da Mostra, ficha da Cinemateca, letreiro de rua, saco de pipoca). Recusa o cartaz de streaming (grade escura de capas com brilho) e o formulário cinza. Quatro disciplinas vieram dos desafiantes do sorteio: o carimbo de estado (da carteira de passagens), a Força por preenchimento e não por opacidade (da notação de dança), cor chapada sem gradiente fora da capa (do mapa de zoológico) e um destaque raro (do canon monocromático).

Celular primeiro. O Cartaz roda em dois lugares, com o mesmo componente: dentro do Claude, como view do MCP Apps num WebView, e no app web.

**Key Characteristics:**

- Tela neutra, sem tom quente nem frio; o vermelho-cinema é raro e quer dizer "letreiro" ou "ação principal".
- Letreiro de painel aceso no topo do Cartaz e das telas de Sessão. Ele fica aceso também no tema escuro, como um letreiro na rua à noite.
- Letra condensada (Antonio 700) só no letreiro, no número de posição e no carimbo. O resto é a fonte do sistema.
- Uma cor por Presente, sempre com a inicial junto.
- Estados se imprimem no card (carimbo, selo, faixa), e nada some sem dizer por quê.
- Claro e escuro desde o primeiro componente.

## Colors

Neutros fazem quase tudo. O vermelho-cinema, a lâmpada âmbar e as cores dos Presentes têm um papel cada.

### Primary

- **Vermelho-cinema** (marquee-red; no escuro, dark-marquee-red para fundo e dark-marquee-red-text para texto): a moldura do letreiro, o número de posição, o carimbo "Trocar" e o botão principal (Enviar no Cartaz, Pedir no app). Branco por cima no claro e no escuro.

### Secondary

- **Lâmpada âmbar** (bulb): só o selo "novo" de quem entrou ao regerar, com texto em tinta. Estrelas usam star (âmbar escurecido no claro, para 3:1 sobre branco; o próprio bulb no escuro).

### Tertiary

- **Cores dos Presentes** (person-1 a person-6, e as dark-person no escuro): uma por Presente, na ordem dos Presentes da Sessão, a mesma no ponto da capa e no avatar da Evidência. Azul, verde, magenta, laranja, violeta e petróleo; nenhuma é vermelha, para não brigar com o letreiro. No claro a inicial vai em branco (4,7:1 ou mais), no escuro em tinta (6,7:1 ou mais).

### Neutral

- **Chão** (ground / dark-ground): fundo da página. Neutro de propósito: creme lê como blog, e azulado lê como painel de sistema.
- **Superfície** (surface / dark-surface): cards, a caixa do Enviar, campos.
- **Superfície 2** (surface-2 / dark-surface-2): chips, a capa sem imagem, o toggle marcado.
- **Tinta** (ink / dark-ink): texto e o contorno do toggle marcado.
- **Tinta clara** (ink-2 / dark-ink-2): rótulos, fonte da Evidência, "sem fato", legenda, "Saiu".
- **Fio** (rule / dark-rule): bordas de 1px de cards e campos e as divisórias dentro do card.
- **Painel do letreiro** (marquee-panel / dark-marquee-panel): o fundo aceso do letreiro, sempre claro, com letras em ink.

### Named Rules

**The Rare Red Rule.** O vermelho-cinema aparece em quatro lugares e só neles: moldura do letreiro, número de posição, carimbo Trocar e o botão principal da tela. Erro e perigo usam o mesmo vermelho com ícone e texto, nunca um quinto uso decorativo.

**The One Color Per Person Rule.** Dentro de uma Sessão, cada Presente tem uma cor só, dada pela ordem dos Presentes. A cor nunca aparece sem a inicial ou o nome.

**The Lit Panel Rule.** O letreiro é claro nos dois temas. No escuro, ele é a única área clara da tela.

**The Flat Color Rule.** Cor chapada. O único gradiente é a faixa escura no pé da capa, para os pontos lerem sobre qualquer pôster.

## Typography

**Display Font:** Antonio 700 (fallback Arial Narrow, sans-serif), só para letreiro, número de posição e carimbo
**Body Font:** fonte do sistema (system-ui, -apple-system, Segoe UI, Roboto, sans-serif)

A Antonio vai auto-hospedada no app. Na view do MCP Apps ela não vai embutida no recurso `ui://`: o CSP do MCP Apps nunca aceita fonte em `data:` (o `font-src` padrão é `'none'`; o declarado é `'self'` mais `resourceDomains`). A view carrega a Antonio da origem do app (`https://cinema.finalsend.com.br`), declarada em `resourceDomains` no `_meta.ui.csp` do recurso, junto da origem das capas. Se a fonte não chegar, o letreiro cai no fallback (Arial Narrow, depois a fonte sans do host), e as regras abaixo continuam valendo.

**Character:** a Antonio é a letra de placa de letreiro: condensada, reta, maiúscula. A fonte do sistema deixa o resto com cara de app do celular de quem usa, que é o que uma tela de trabalho pede.

### Hierarchy

- **Letter** (700, 22px, 1, 0.02em, maiúsculas): as placas do letreiro, uma palavra por placa.
- **Position** (700, 26px, 1): o número do filme na lista, em vermelho-cinema, junto do título.
- **Title** (700, 19px, 1.25): título do filme em português; o original ao lado em itálico 13px, tinta clara.
- **Body** (400, 16px, 1.5): texto de telas do app e campos.
- **Synopsis** (400, 15.5px, 1.5): a sinopse do card, até 60ch.
- **Evidence** (400, 14px, 1.45): linhas de "Por que cada um vai gostar"; a fonte embaixo em 12px, tinta clara.
- **Label** (600, 12px, 0.05em, maiúsculas): "POR QUE CADA UM VAI GOSTAR", "JÁ VI".
- **Meta** (400, 13px, 1.4): legenda, "Saiu:", resumo do que foi marcado.

### Named Rules

**The Sign Letters Only Rule.** A Antonio não entra em botão, rótulo, título de filme nem texto corrido. Fora do letreiro, do número e do carimbo, é fonte do sistema.

**The Words In Plates Rule.** No letreiro, cada palavra fica na sua placa (fundo de tinta a 4,5%, raio de 2px), como as letras trocáveis de um painel. O texto inteiro vai no `aria-label` do letreiro; as placas ficam `aria-hidden`.

## Layout

Uma coluna, celular primeiro, a partir de 360px. O Cartaz tem até 720px de largura com 16px de respiro lateral. Entre blocos, 14px.

O card é uma grade: capa à esquerda (104px no celular, 160px a partir de 560px), título, sinopse e chips à direita; "Por que cada um vai gostar" e os controles de marcar ocupam a largura toda embaixo, cada um com uma divisória de 1px. A partir de 560px, "Por que" sobe para a coluna da direita, sob os chips, como no Cartaz de hoje.

### Dentro do Claude

No Claude, o Cartaz é uma view do MCP Apps: um só arquivo HTML com o JS e o CSS dentro, e só a fonte e as capas vindas de fora, das origens declaradas no CSP do recurso. Ele tem dois modos:

- **Card inline, compacto.** É o que aparece na conversa. No celular a conversa é dona da rolagem vertical: a altura do card inline tem teto, o que passa dele é cortado e não há rolagem interna. Por isso o card inline mostra só o letreiro, a lista dos filmes em uma linha cada (posição, título, ano e duração) e no máximo duas ações: "Marcar" (abre a tela cheia) e Enviar. Cabem 4 ou 5 dados por filme, nunca a Evidência inteira.
- **Tela cheia, para marcar vários filmes.** "Marcar" pede `fullscreen` (`ui/request-display-mode`). Ali vai o Cartaz inteiro, com os cards, a Evidência e os controles, e a rolagem é da view. O Enviar fica dentro da área segura, acima da caixa de mensagem que o Claude sobrepõe no pé da tela. Não há painel lateral no celular: são só esses dois modos.

Em qualquer modo, alvos de toque de 44pt ou mais, como no resto do filmes.

No app web, a navegação é uma barra de abas embaixo no celular (Sessões, Pessoas, Importar e, para admin, Operações) e uma barra no topo a partir de 900px. As telas de Sessão abrem com o letreiro do pedido. Na view do MCP Apps não há navegação: só o Cartaz.

## Elevation & Depth

Plano. Profundidade só por tom (chão, superfície, superfície 2) e fio de 1px. Nenhuma sombra com desfoque. A única "sombra" é o anel escuro de 2px em volta dos pontos sobre a capa, para lerem sobre qualquer pôster.

### Named Rules

**The No Shadow Rule.** Cards e painéis se separam do chão pelo tom e pelo fio, nunca por box-shadow.

## Shapes

Raios pequenos e retos onde o mundo é placa (letreiro 4px, carimbo 3px, placas 2px), médios onde é app (card 10px, campo 8px, capa 6px) e pílula nos controles de toque (toggles, chips, botão). Avatares e pontos são círculos. O carimbo é a única peça girada (-4°).

## Components

### Letreiro (assinatura)

Painel em marquee-panel, moldura de 3px em vermelho-cinema, raio 4px. Uma ou duas linhas de placas em Antonio: quem está ("VOCÊ", "VOCÊS DOIS"), o tempo, os Climas, as Restrições, "IMDB 7+" e a Regra quando não é a padrão. Embaixo, a fala do Dono entre aspas, em itálico 14px. Ao regerar, só as placas que mudaram trocam, cada uma girando no eixo horizontal em 180ms; em prefers-reduced-motion, trocam sem animação.

### Card do filme

- **Corner Style:** 10px.
- **Background:** superfície sobre o chão, fio de 1px.
- **Internal Padding:** 14px no celular, 16px a partir de 560px.
- **Capa:** pôster do TMDB 2:3, raio 6px. Sem capa, o título em tinta clara no centro sobre superfície 2. No pé, a faixa escura com um ponto de 12px por Presente: cheio quem tem Fato, vazado quem não tem. A nota do IMDb não vai sobre a capa: fica no chip do IMDb.
- **Cabeçalho:** número de posição em Antonio vermelho, título, original, selo "novo" quando entrou ao regerar.
- **Chips:** ano, duração, gêneros em superfície 2; o chip do IMDb com contorno de 1px e a nota.

### Por que cada um vai gostar

Rótulo em label com "Fato sobre N de M" à direita. Uma linha por Evidência: avatar de 24px (ou avatares sobrepostos quando a Evidência é a mesma), a Força em três pontos e o texto do motor com a fonte embaixo. Quem não tem Fato fecha a lista com o avatar vazado e "Fulano: sem fato sobre este filme", em tinta clara.

### Força

Três pontos em tinta: ●●● forte, ●●○ moderada, ●○○ fraca. O nível é o preenchimento, nunca a opacidade nem a cor. O `aria-label` diz "Força forte".

### Toggles (Já vi, Trocar, Todos)

- **Style:** pílula, 44px de altura, contorno de 1px em fio, texto 14px.
- **State:** marcado ganha contorno de 2px em tinta, fundo superfície 2, peso 600 e um ✓ antes. Foco por teclado: contorno de 2px da cor de foco, afastado 2px.
- Marcar Já vi de uma Pessoa abre, logo abaixo, a nota de 1 a 10 e "o que achou" daquela Pessoa.

### Estrelas

Cinco estrelas de 24px em linha de 44px. Acesas em star, apagadas em tinta clara a 45%.

### Carimbo

Quando o Dono marca Trocar, a capa recebe um carimbo "TROCAR" em Antonio, contorno de 2px e texto em vermelho-cinema sobre superfície, girado -4°. O resto do card fica a 72% de opacidade; a capa sem imagem não esmaece. Já vi de todos os Presentes carimba "JÁ VI" em tinta. Desmarcar tira o carimbo. "Saiu: 2 Sessão Maldita (Teo já viu)" no topo diz o que saiu ao regerar.

### Selo "novo"

Pílula âmbar com "NOVO" em tinta, 11px 700, ao lado do título de quem entrou ao regerar.

### Botão principal

Vermelho-cinema, texto branco 700 15px, pílula de 44px. No Cartaz é "Enviar", que manda as marcações para a conversa no Claude ou regera no app; acima dele, em meta, o resumo do que foi marcado ("1 Trocar marcado"). Sem nada marcado, o botão fica e, ao tocar, avisa "Nada marcado ainda".

No Claude, o Enviar manda o texto por `ui/message`, e o Claude só age com o sim de quem usa. Até ela aceitar as mensagens do app, o Claude pede para ela permitir a mensagem ou põe o texto na caixa de mensagem para ela mandar: um toque a mais, que o desenho conta como parte do fluxo. O sucesso do envio pode chegar antes dessa decisão, então a view diz "Enviado para a conversa", nunca "Regerado". O envio sai só do toque no botão, sem nova tentativa nem timer, em texto de até 8.000 caracteres. As marcações vivem só na view: se o Claude recarregar a view, ela volta do HTML, e o que precisa sobreviver fica no servidor.

### Campos

Superfície, fio de 1px, raio 8px, 44px de altura mínima, texto 15px. Rótulo em 14px 600 com a dica em tinta clara ao lado.

### Navegação (app web)

Barra de abas embaixo no celular, com ícone e palavra; aba atual em tinta com traço de 2px em vermelho-cinema em cima. A partir de 900px, barra no topo com o nome e as mesmas abas. Operações só aparece para admin. O aviso de push falhando para o filmes-dados é uma faixa no topo, em superfície 2 com texto em tinta e ícone de alerta, só para admin.

## Do's and Don'ts

### Do:

- **Do** abrir o Cartaz e as telas de Sessão com o letreiro do pedido.
- **Do** manter o letreiro claro nos dois temas.
- **Do** dar a cada Presente a mesma cor no ponto e no avatar, sempre com a inicial.
- **Do** mostrar a Força pelo preenchimento dos três pontos, com `aria-label`.
- **Do** carimbar o estado no card (Trocar, Já vi) e dizer em "Saiu" o que saiu e por quê.
- **Do** manter alvos de toque de 44px ou mais.
- **Do** conferir cada componente no claro e no escuro, a 360px e a 390px.
- **Do** servir a Antonio da origem do app, declarada no CSP do recurso do MCP Apps; nunca em `data:`.
- **Do** manter o card inline do Claude compacto (até duas ações, 4 ou 5 dados por filme) e marcar vários filmes na tela cheia.

### Don't:

- **Don't** usar o vermelho-cinema fora dos quatro lugares dele.
- **Don't** usar a Antonio em botão, rótulo, título de filme ou texto corrido.
- **Don't** fazer grade escura de capas com brilho, como streaming.
- **Don't** usar fundo creme ou azulado; o chão é neutro.
- **Don't** usar sombra com desfoque nem gradiente fora da faixa da capa.
- **Don't** mostrar Força, Presente ou estado só por cor.
- **Don't** esconder um filme marcado: ele fica, carimbado, até regerar.
- **Don't** escrever ou resumir uma linha de Evidência na interface; o texto é do motor.
