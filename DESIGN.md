---
name: filmes
description: Recomendação de filmes para quem vai assistir junto, com cada filme numa fita da locadora de bairro e o pedido da noite na etiqueta da prateleira.
colors:
  ground: '#eef1f4'
  surface: '#ffffff'
  surface-2: '#e3e7ec'
  ink: '#121417'
  ink-2: '#535963'
  rule: '#cfd5dd'
  case: '#17181b'
  case-ink: '#f7f7f2'
  case-ink-2: '#b9bec7'
  shelf-label: '#f7f7f2'
  on-sticker: '#121417'
  sticker-orange: '#ff7a1a'
  sticker-yellow: '#ffd23f'
  sticker-pink: '#ff5c9a'
  sticker-green: '#45c463'
  stamp: '#5a3db5'
  card-stock: '#d5e8fa'
  card-stock-ink: '#17324f'
  star: '#b07a00'
  focus: '#2c62c4'
  on-person: '#ffffff'
  person-1: '#2c62c4'
  person-2: '#1b7a50'
  person-3: '#a63d8d'
  person-4: '#8a5a2b'
  person-5: '#6650c4'
  person-6: '#0b7676'
  genre-blue: '#3a78e0'
  genre-violet: '#7a52d1'
  genre-yellow: '#f2c200'
  genre-green: '#36b35a'
  genre-orange: '#ff7a1a'
  genre-pink: '#ff5c9a'
  dark-ground: '#0d1220'
  dark-surface: '#161c2c'
  dark-surface-2: '#212a3e'
  dark-ink: '#f1f3f7'
  dark-ink-2: '#a5adbd'
  dark-rule: '#2a3348'
  dark-case: '#04060a'
  dark-stamp: '#b3a0ff'
  dark-card-stock: '#1b2b46'
  dark-card-stock-ink: '#dbe9ff'
  dark-star: '#ffd23f'
  dark-focus: '#6c9cf0'
  dark-on-person: '#121417'
  dark-person-1: '#6c9cf0'
  dark-person-2: '#4cbf8a'
  dark-person-3: '#e07ccb'
  dark-person-4: '#d0a06a'
  dark-person-5: '#a593f5'
  dark-person-6: '#3fc1c1'
typography:
  shelf-label:
    fontFamily: 'Rubik, system-ui, sans-serif'
    fontSize: '17px'
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: '0.01em'
  hand:
    fontFamily: 'Permanent Marker, Comic Sans MS, cursive'
    fontSize: '18px'
    fontWeight: 400
    lineHeight: 1.2
  price:
    fontFamily: 'Rubik, system-ui, sans-serif'
    fontSize: '18px'
    fontWeight: 800
    lineHeight: 1
  sticker:
    fontFamily: 'Rubik, system-ui, sans-serif'
    fontSize: '12px'
    fontWeight: 800
    lineHeight: 1
    letterSpacing: '0.06em'
  title:
    fontFamily: 'Rubik, system-ui, sans-serif'
    fontSize: '19px'
    fontWeight: 700
    lineHeight: 1.2
  counter-title:
    fontFamily: 'Rubik, system-ui, sans-serif'
    fontSize: '24px'
    fontWeight: 800
    lineHeight: 1.2
  step-title:
    fontFamily: 'Rubik, system-ui, sans-serif'
    fontSize: '17px'
    fontWeight: 700
    lineHeight: 1.25
  brand:
    fontFamily: 'Rubik, system-ui, sans-serif'
    fontSize: '18px'
    fontWeight: 800
    lineHeight: 1
    letterSpacing: '0.01em'
  button:
    fontFamily: 'Rubik, system-ui, sans-serif'
    fontSize: '15px'
    fontWeight: 800
    lineHeight: 1
    letterSpacing: '0.02em'
  control:
    fontFamily: 'Rubik, system-ui, sans-serif'
    fontSize: '14px'
    fontWeight: 500
    lineHeight: 1.2
  label:
    fontFamily: 'Rubik, system-ui, sans-serif'
    fontSize: '12px'
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: '0.06em'
  chip:
    fontFamily: 'Rubik, system-ui, sans-serif'
    fontSize: '12px'
    fontWeight: 500
    lineHeight: 1
  tab:
    fontFamily: 'Rubik, system-ui, sans-serif'
    fontSize: '11.5px'
    fontWeight: 500
    lineHeight: 1.2
  body:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '16px'
    fontWeight: 400
    lineHeight: 1.5
  synopsis:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.5
  evidence:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.4
  source:
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.4
  url:
    fontFamily: 'ui-monospace, SF Mono, Menlo, Consolas, monospace'
    fontSize: '14px'
    fontWeight: 500
    lineHeight: 1.3
rounded:
  plate: '2px'
  cover: '3px'
  note: '4px'
  tape-small: '5px'
  rail: '6px'
  case: '8px'
  field: '8px'
  nav-row: '10px'
  card: '12px'
  panel: '14px'
  pill: '999px'
  round: '50%'
spacing:
  2xs: '4px'
  xs: '6px'
  sm: '8px'
  md: '10px'
  lg: '12px'
  xl: '14px'
  2xl: '16px'
  3xl: '22px'
components:
  shelf-rail:
    backgroundColor: '{colors.case}'
    rounded: '{rounded.rail}'
    padding: '5px'
  shelf-label:
    backgroundColor: '{colors.shelf-label}'
    textColor: '{colors.on-sticker}'
    typography: '{typography.shelf-label}'
    rounded: '{rounded.plate}'
    padding: '7px 10px 6px'
  hand-note:
    backgroundColor: '{colors.sticker-yellow}'
    textColor: '{colors.on-sticker}'
    typography: '{typography.hand}'
    rounded: '{rounded.note}'
    padding: '5px 14px 4px'
  tape-case:
    backgroundColor: '{colors.case}'
    rounded: '{rounded.case}'
    padding: '5px 5px 0'
  cover:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.ink-2}'
    rounded: '{rounded.cover}'
  price-sticker:
    backgroundColor: '{colors.sticker-orange}'
    textColor: '{colors.on-sticker}'
    typography: '{typography.price}'
    rounded: '{rounded.round}'
    size: '34px'
  sticker-new:
    backgroundColor: '{colors.sticker-yellow}'
    textColor: '{colors.on-sticker}'
    typography: '{typography.sticker}'
    rounded: '{rounded.cover}'
    padding: '6px 8px 5px'
  sticker-swap:
    backgroundColor: '{colors.sticker-pink}'
    textColor: '{colors.on-sticker}'
    typography: '{typography.sticker}'
    rounded: '{rounded.cover}'
    padding: '7px 10px 6px'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.card}'
    padding: '16px 14px 14px'
  chip:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.ink}'
    typography: '{typography.chip}'
    rounded: '{rounded.pill}'
    padding: '5px 9px'
  option:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.control}'
    rounded: '{rounded.pill}'
    padding: '0 14px'
    height: '44px'
  option-on:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.ink}'
    typography: '{typography.control}'
    rounded: '{rounded.pill}'
    height: '44px'
  button-primary:
    backgroundColor: '{colors.sticker-orange}'
    textColor: '{colors.on-sticker}'
    typography: '{typography.button}'
    rounded: '{rounded.pill}'
    padding: '0 22px'
    height: '44px'
  button-big:
    backgroundColor: '{colors.sticker-orange}'
    textColor: '{colors.on-sticker}'
    typography: '{typography.button}'
    rounded: '{rounded.panel}'
    height: '60px'
  field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.field}'
    padding: '9px 12px'
    height: '44px'
  card-stock:
    backgroundColor: '{colors.card-stock}'
    textColor: '{colors.card-stock-ink}'
    rounded: '{rounded.field}'
    padding: '10px 12px'
  counter:
    backgroundColor: '{colors.case}'
    textColor: '{colors.case-ink}'
    typography: '{typography.counter-title}'
    rounded: '{rounded.panel}'
    padding: '16px 14px 14px'
  guide:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.step-title}'
    rounded: '{rounded.card}'
    padding: '14px'
  step-mark:
    textColor: '{colors.ink}'
    typography: '{typography.price}'
    rounded: '{rounded.round}'
    size: '28px'
  url-field:
    backgroundColor: '{colors.case}'
    textColor: '{colors.case-ink}'
    typography: '{typography.url}'
    rounded: '{rounded.field}'
    height: '48px'
  account-menu:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    typography: '{typography.control}'
    rounded: '{rounded.card}'
    padding: '6px'
    width: '240px'
  top-bar:
    backgroundColor: '{colors.case}'
    textColor: '{colors.case-ink}'
    typography: '{typography.brand}'
    padding: '12px 16px'
  tab-bar:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink-2}'
    typography: '{typography.tab}'
    height: '54px'
  avatar:
    textColor: '{colors.on-person}'
    rounded: '{rounded.round}'
    size: '24px'
---

<!-- Mundo escolhido pelo Dono no #142 entre os três protótipos do #141 (prototypes/locadora-de-bairro.prototype.html). O Cartaz e o shell já existem em frontend/, e os tokens do código (frontend/src/ui/tokens.css) seguem este arquivo; quando os dois divergirem, acerte um pelo outro. -->

# Design System: filmes

## Overview

**Creative North Star: "Locadora de bairro"**

O filmes é a locadora da esquina de quem usa. Cada filme é uma fita no estojo preto da prateleira, com o número num adesivo de preço laranja e o gênero num adesivo colorido. O pedido da noite está impresso na etiqueta da frente da prateleira ("VOCÊS DOIS · ATÉ 1H50 · ALGO LEVE"), e a fala do Dono vai escrita à mão, de pincel atômico, num papel amarelo colado ao lado. Trocar é um adesivo rosa batido na capa; "novo" é um adesivo amarelo no canto do estojo. Na home, o pedido se faz no balcão: o estojo preto com a etiqueta da prateleira ainda em branco. Depois da Sessão, contar como foi é "devolver a fita".

Por baixo dos objetos, o filmes é uma tela de trabalho clara: cards, listas, opções em pílula e campos que qualquer um sabe usar com uma mão, no sofá. Os objetos da locadora (estojo, etiqueta, adesivo, carimbo) ficam nas bordas da informação, nunca no lugar dela. A capa do filme continua sendo a imagem do produto.

O Dono escolheu este mundo no #142, vendo lado a lado os três protótipos do #141 (A · Letreiro de rua, B · Locadora de bairro, C · Catálogo da Mostra). Ele substitui o "Letreiro de rua" do #78, que tinha sido escolhido sem o Dono ver as alternativas. Os protótipos A e C, e o `prototypes/cartaz.prototype.html` do #78, ficam no repo como histórico: não são o sistema, e o detector do impeccable acusa neles cores e fontes que não estão aqui.

Recusa o cartaz de streaming (grade escura de capas com brilho), o formulário cinza e a nostalgia de enfeite (fita VHS rasgada, chiado, textura de papel envelhecido). A locadora aqui é cor chapada, adesivo e etiqueta, não filtro.

Celular primeiro. O Cartaz roda em dois lugares, com o mesmo componente React: dentro do Claude, como view do MCP Apps num WebView, e no app web.

**Key Characteristics:**

- Tela fria e clara de dia, azul-noite no escuro; os objetos da locadora (estojo preto, etiqueta clara, adesivos vivos) são os mesmos nos dois temas.
- Quatro adesivos com um papel cada: laranja é número e ação principal, amarelo é "novo" e a letra do Dono, rosa é Trocar, violeta é carimbo (o passo feito do guia).
- Rubik (500, 700, 800) é a letra dos objetos e dos controles; Permanent Marker é a mão do balconista, em frases curtas; a fonte do sistema fica com o texto que se lê (sinopse, Evidência, legenda).
- Uma cor por Presente, sempre com a inicial junto.
- Estados se colam no objeto (adesivo, carimbo), e nada some sem dizer por quê.
- Claro e escuro desde o primeiro componente.

## Colors

Neutros frios fazem a tela. Os adesivos e as cores dos Presentes têm um papel cada; nenhuma cor é enfeite.

### Primary

- **Laranja-preço** (sticker-orange): o adesivo de preço da locadora. É o número de posição do filme, o número do passo no guia, o botão principal da tela (Enviar, Pedir filme, Dar notas, Copiar), a nota escolhida na escala de 1 a 10, as Notas já dadas no contador e o disco atrás do ícone da aba atual. Texto sempre em on-sticker (#121417), nos dois temas: 8,4:1.

### Secondary

- **Amarelo-novo** (sticker-yellow): o adesivo "NOVO" de quem entrou ao regerar, o papel com a fala do Dono ao lado da etiqueta da prateleira e a cor de seleção de texto (a 53% de opacidade). Texto em on-sticker.
- **Rosa-troca** (sticker-pink): só o adesivo "TROCAR". Texto em on-sticker.
- **Violeta-carimbo** (stamp; dark-stamp no escuro): o passo feito do guia da home (marca, segmento do progresso e pontos do contador), o carimbo APOSTA no Cartaz e as notas do balconista em letra de mão ("Este passo se marca sozinho..."). No escuro vira lilás claro para ler sobre o cartão escuro.
- **Verde-etiqueta** (sticker-green): só os pontos que separam os itens na etiqueta da prateleira, junto com o laranja e o rosa, como as bolinhas coloridas de uma etiqueta de preço.

### Tertiary

- **Cores dos Presentes** (person-1 a person-6, e dark-person no escuro): uma por Presente, na ordem dos Presentes da Sessão, a mesma no ponto sob a capa, no avatar da Evidência e na legenda. Azul, verde, magenta, marrom, violeta e petróleo. Nenhuma é laranja nem rosa vivo, para um avatar não ser lido como adesivo de preço ou de troca. No claro a inicial vai em on-person branco (4,7:1 ou mais); no escuro, em dark-on-person (#121417, 6,5:1 ou mais).
- **Cores de gênero** (genre-*): o ponto de 9px dentro do chip de gênero, como a etiqueta colorida na lombada. O nome do gênero está sempre escrito ao lado; a cor é só lembrete. Mapa fixo dos gêneros do IMDb:
  - genre-blue: Drama, Biography, History, War
  - genre-violet: Mystery, Crime, Thriller, Horror, Sci-Fi, Fantasy, Film-Noir
  - genre-yellow: Comedy, Musical, Music
  - genre-green: Family, Animation
  - genre-orange: Adventure, Action, Western, Sport
  - genre-pink: Romance
  - ink-2 (sem cor própria): Documentary e qualquer outro

### Neutral

- **Chão** (ground / dark-ground): fundo da página. Cinza-azulado frio no claro, azul-noite no escuro.
- **Superfície** (surface / dark-surface): cards, passos do guia, caixa do acrescentar, campos, barra de abas.
- **Superfície 2** (surface-2 / dark-surface-2): chips, capa sem imagem, opção marcada, balão da mensagem do Dono.
- **Tinta** (ink / dark-ink): texto e contorno da opção marcada.
- **Tinta clara** (ink-2 / dark-ink-2): rótulos, fonte da Evidência, "sem fato", legenda, "Saiu da prateleira", contagens.
- **Fio** (rule / dark-rule): bordas de 1px de cards, contorno de 1,5px das opções e dos campos, divisórias tracejadas dentro do card.
- **Estojo** (case / dark-case): o preto do estojo da fita, do trilho da prateleira, da lombada na lista compacta, da barra do topo e do campo do endereço do conector. Quase preto nos dois temas: o estojo é um objeto, não muda de cor com o tema.
- **Tinta do estojo** (case-ink, case-ink-2): texto sobre o estojo; case-ink-2 para o secundário (versão do Cartaz no topo).
- **Etiqueta** (shelf-label): o papel claro da etiqueta da prateleira, igual nos dois temas, com texto em on-sticker.
- **Cartão** (card-stock / dark-card-stock, com card-stock-ink): o papel-cartão azul-claro da tela de entrar, da nota de Já vi e da caixa "Falta contar como foi". No escuro, azul profundo com texto azul-gelo.

### Named Rules

**The Four Stickers Rule.** Laranja, amarelo, rosa e violeta são adesivos e carimbos, e cada um tem só os papéis listados acima. Um quinto uso (um título laranja, um fundo amarelo de seção, um rosa de alerta) é proibido. Erro usa tinta com ícone de alerta e texto, sem cor de adesivo.

**The One Orange Button Rule.** Cada tela, ou cada modo da view do Claude, tem no máximo um botão laranja. As outras ações são opções em pílula (contorno) ou links sublinhados.

**The Sticker Ink Rule.** Texto sobre adesivo é sempre on-sticker (#121417), no claro e no escuro. Adesivo nunca leva texto branco.

**The One Color Per Person Rule.** Dentro de uma Sessão, cada Presente tem uma cor só, dada pela ordem dos Presentes. A cor nunca aparece sem a inicial ou o nome.

**The Same Objects Rule.** Estojo, etiqueta e adesivos têm a mesma cor no claro e no escuro. Só o chão, as superfícies, a tinta, o fio, o cartão e o carimbo trocam com o tema.

**The Flat Color Rule.** Cor chapada. Nenhum gradiente, nem na capa: os pontos dos Presentes ficam no estojo, sob a capa, e não precisam de faixa escura.

## Typography

**Display Font:** Rubik 500, 700 e 800 (fallback system-ui, sans-serif)
**Hand Font:** Permanent Marker 400 (fallback Comic Sans MS, cursive)
**Body Font:** fonte do sistema (system-ui, -apple-system, Segoe UI, Roboto, sans-serif)
**Mono:** ui-monospace, só no endereço do conector

As duas fontes vão auto-hospedadas no app, em woff2, só nos pesos usados (Rubik 500, 700, 800 com o subconjunto latino; Permanent Marker 400). Nada vem do Google Fonts em produção. Na view do MCP Apps elas não vão embutidas no recurso `ui://`: o CSP do MCP Apps nunca aceita fonte em `data:` (o `font-src` padrão é `'none'`; o declarado é `'self'` mais `resourceDomains`). A view carrega as duas da origem do app (`https://cinema.finalsend.com.br`), declarada em `resourceDomains` no `_meta.ui.csp` do recurso, junto da origem das capas. Se a fonte não chegar, cada papel cai no fallback e as regras abaixo continuam valendo. `font-display: swap` nas duas.

**Character:** a Rubik é a letra redonda e gorda de adesivo, etiqueta e placa de loja: legível em 12px, amigável sem ser infantil. A Permanent Marker é o pincel atômico do balconista: só o que alguém escreveria à mão num papel. A fonte do sistema deixa a leitura com cara de app do celular de quem usa.

### Hierarchy

- **Shelf label** (Rubik 800, 17px, 1.15, 0.01em, maiúsculas): o pedido na etiqueta da prateleira; 15px na versão compacta (Claude inline e topo da tela cheia).
- **Hand** (Permanent Marker 400, 18px, 1.2): a fala do Dono no papel amarelo (16px na versão compacta), o título do que saiu em "Saiu da prateleira" (15px), a data na ficha da última Sessão (16px), "Falta contar como foi" (19px), a nota do balconista (15px).
- **Price** (Rubik 800, 18px, 1): o número no adesivo de preço; 14px na lista compacta e na marca do passo do guia.
- **Sticker** (Rubik 800, 12px, 1, 0.06em, maiúsculas): "NOVO"; "TROCAR" em 15px.
- **Title** (Rubik 700, 19px, 1.2): título do filme em português; o original embaixo em 13px da fonte do sistema, tinta clara.
- **Counter title** (Rubik 800, 24px, 1.2): a pergunta do balcão da home, "O que vai ser hoje?", em case-ink.
- **Step title** (Rubik 700, 17px, 1.25): "Para começar", o título do guia; o título de cada passo em 15.5px.
- **Brand** (Rubik 800, 18px, 1): "filmes" e o nome da Sessão na barra do topo.
- **Button** (Rubik 800, 15px, 0.02em, maiúsculas): botão principal; 18px no botão grande da home.
- **Control** (Rubik 500, 14px): opções em pílula; 700 quando marcada. As linhas do menu do avatar.
- **Label** (Rubik 700, 12px, 0.06em, maiúsculas, tinta clara): "POR QUE CADA UM VAI GOSTAR", "JÁ VI", "ÚLTIMA SESSÃO". O complemento à direita ("Fato sobre 1 de 2") em 500, sem maiúsculas.
- **Chip** (Rubik 500, 12px, números tabulares): ano, duração, gêneros; o chip do IMDb em 700.
- **Tab** (Rubik 500, 11.5px): rótulo da aba; 700 na atual.
- **Body** (sistema 400, 16px, 1.5): texto de telas do app e campos (campo em 15px).
- **Synopsis** (sistema 400, 15px, 1.5): a sinopse do card, até 60ch.
- **Evidence** (sistema 400, 14px, 1.45): linhas de "Por que cada um vai gostar" e corpo dos passos (14.5px).
- **Source** (sistema 400, 12px, tinta clara): a Fonte embaixo de cada Evidência.
- **Meta** (sistema 400, 13px, 1.4): legenda, resumo do que foi marcado, contagens, ano e duração na lista compacta.
- **Url** (mono 500, 14px, 1.3): o endereço do conector, que quebra em qualquer ponto.

### Named Rules

**The Hand Is Short Rule.** A Permanent Marker só escreve o que o balconista escreveria num papel: no máximo uma frase, nunca um número que o Dono precise conferir (posição, nota, duração), nunca botão, rótulo, título de filme, campo, Evidência nem texto corrido.

**The Engine Speaks Plain Rule.** Tudo que sai do motor (Evidência, Fonte, "sem fato", sinopse) vai na fonte do sistema, sem maiúsculas forçadas e sem letra de mão. O mundo da locadora não fantasia o Fato.

**The Shelf Label Rule.** O pedido na etiqueta é uma linha de itens separados por pontos coloridos (laranja, verde, rosa, nessa ordem, repetindo), não placas. O texto inteiro vai no `aria-label` da etiqueta, com as palavras por extenso ("nota 7 ou mais no IMDb"); os pontos são `aria-hidden`.

## Layout

Uma coluna, celular primeiro, a partir de 360px. O conteúdo tem até 720px de largura, centrado, com 16px de respiro lateral. Entre blocos da página, 16px; dentro do card, 14px.

O card do filme é uma grade: o estojo com a capa à esquerda (112px no celular, 160px a partir de 560px), título, sinopse e chips à direita; "Por que cada um vai gostar" e os controles de marcar ocupam a largura toda embaixo, cada bloco aberto por uma divisória tracejada de 1px. A partir de 560px, "Por que" sobe para a coluna da direita, sob os chips.

Os adesivos saem para fora do estojo: o de preço fica 9px para cima e para a esquerda do canto, o "NOVO" 10px para fora da direita. O card reserva esse respiro no padding (16px em cima, 14px dos lados), e nenhum adesivo cobre o título.

### Dentro do Claude

No Claude, o Cartaz é uma view do MCP Apps: um só arquivo HTML com o JS e o CSS dentro, e só as fontes e as capas vindas de fora, das origens declaradas no CSP do recurso. O tema segue o `theme` do contexto do host (`light` ou `dark`) quando ele vier, e `prefers-color-scheme` quando não. Ele tem dois modos:

- **Card inline, compacto.** É o que aparece na conversa. No celular a conversa é dona da rolagem vertical: a altura do card inline tem teto, o que passa dele é cortado e não há rolagem interna. Por isso o card inline mostra, de cima para baixo, em fundo chão com fio de 1px e raio 14px:
  1. a etiqueta da prateleira compacta (15px) com o papel amarelo da fala do Dono (16px); o Claude já diz de que app é o card, então não há rótulo acima dela;
  2. a lista das 5 fitas, uma linha cada, de 6px de raio sobre superfície: lombada preta de 8px à esquerda, adesivo de preço de 26px, título em Rubik 700 15px (corta com reticências) e "2021 · 1h44" em meta à direita;
  3. sem nada marcado, uma ação na largura toda: "Marcar" (opção com ícone de expandir, que abre a tela cheia). Depois de marcar na tela cheia, o resumo do que foi marcado em meta ("1 Trocar e 1 Já vi") e duas ações lado a lado, metade cada: "Marcar" e "Enviar" (botão laranja). Não há Enviar para mandar nada.

  São 4 dados por filme (posição, título, ano, duração). Nada de capa, Evidência, chips nem adesivos de estado no inline: um filme marcado só aparece na tela cheia, e o resumo diz o que vai com o Enviar.

- **Tela cheia, para marcar vários filmes.** "Marcar" pede `fullscreen` ao host. No topo, fixa, sobre o chão com fio embaixo, só a etiqueta compacta. No meio, rolando, a legenda dos Presentes e da Força, os cards inteiros e a caixa do acrescentar. No pé, fixa, a barra de envio na largura toda, sobre superfície com fio em cima, dentro da área segura e acima da caixa de mensagem que o Claude sobrepõe. Não há painel lateral no celular: são só esses dois modos.

Em qualquer modo, alvos de toque de 44px ou mais, como no resto do filmes.

### App web

O topo é a barra do estojo: preta, 4px 16px, 56px de altura, com "filmes" (ou o nome da Sessão e, à direita em case-ink-2, "versão 2") e o avatar do Dono, que abre o menu dela. No celular, a navegação é uma barra de quatro abas fixa embaixo: Início, Sessões, Pessoas e Meu gosto. A partir de 900px, as mesmas abas sobem para a barra do topo, ao lado de "filmes", e a barra de baixo some. Operações não é aba: mora no menu do avatar, só para admin. Cada tela mora num lugar só: a home não repete as abas. As telas de Sessão abrem com a etiqueta da prateleira do pedido. Na view do MCP Apps não há topo nem abas: só o Cartaz.

## Elevation & Depth

Plano. Profundidade só por tom (chão, superfície, superfície 2), pelo preto do estojo e por fio de 1px. Nenhuma sombra com desfoque, nenhuma sombra deslocada. As únicas "sombras" são anéis de 2px, sem desfoque e sem deslocamento, na cor da superfície embaixo: em volta do adesivo de preço, para ele se destacar do estojo, e entre avatares sobrepostos.

### Named Rules

**The No Shadow Rule.** Cards, passos e painéis se separam do chão pelo tom e pelo fio, nunca por box-shadow com desfoque. Adesivo não flutua: ele está colado.

## Shapes

Raios pequenos onde o mundo é papel e plástico (etiqueta 2px, capa e adesivo 3px, papel da fala 4px, trilho 6px, estojo 8px), médios onde é app (campo e nota de Já vi 8px, item de navegação 10px, card, guia e menu do avatar 12px, balcão da home, card inline e botão grande 14px) e pílula nos controles de toque (opções, chips, botão principal). Avatares, pontos, adesivo de preço, marca do passo e carimbo são círculos.

Só adesivos e carimbos giram, e nunca mais de 12°: papel da fala -2°, adesivo de preço -8°, "NOVO" 9°, "TROCAR" -9°. Card, botão, campo e texto do motor nunca giram.

## Motion

Quase nada se mexe. Um só momento autoral: ao regerar, ou ao marcar Trocar, o adesivo é colado: entra de 1,15× para 1× com opacidade de 0 a 1 em 160ms, `cubic-bezier(0.16, 1, 0.3, 1)`, já na rotação final. O carimbo da carteirinha entra igual quando um passo fica feito. Desmarcar tira o adesivo sem animação. Em `prefers-reduced-motion`, nada anima.

## Components

### Etiqueta da prateleira (assinatura)

Trilho preto (estojo, 5px, raio 6px) e, dentro, a etiqueta clara (shelf-label, raio 2px, 7px 10px 6px): uma linha que quebra, com os itens do pedido separados por pontos de 8px: quem está ("VOCÊ", "VOCÊS DOIS", "VOCÊS TRÊS"), o tempo ("ATÉ 1H50"), os Climas, as Restrições, "IMDB 7+" e a Regra quando não é a padrão. Logo embaixo, à esquerda, o papel amarelo com a fala do Dono em letra de mão, girado -2°, sem aspas. Sem fala (pedido pelo formulário do app), o papel não aparece. Ao regerar, a etiqueta troca sem animação; o que mudou se lê em "Saiu da prateleira".

### Fita (estojo e capa)

- **Estojo:** preto, raio 8px, 5px de borda em cima e dos lados. Dentro, a capa.
- **Capa:** pôster do TMDB 2:3, raio 3px. Sem capa, o título em Rubik 700 13px, tinta clara, no centro sobre superfície 2.
- **Pontos dos Presentes:** embaixo da capa, ainda no estojo, um ponto de 12px por Presente, 6px entre eles, centrados: cheio quem tem Fato, vazado (anel de 2px) quem não tem. O `title` diz "Teo: sem fato".
- **Adesivo de preço:** círculo laranja de 34px, número da posição em Rubik 800 18px, girado -8°, 9px para fora do canto de cima à esquerda, com anel de 2px na cor da superfície.
- **Versão pequena** (ficha da última Sessão): estojo com 3px de borda e raio 5px, só a capa, sem pontos nem adesivos.

### Seção do Cartaz

Os cards ficam sob o título do Motivo deles, na ordem da Recomendação: um título por sequência de filmes vizinhos com o mesmo Motivo, 14px acima do primeiro card dela. O título é step-title (Rubik 700 17px) em tinta, com uma barra de 4px em tinta à esquerda e 8px de respiro; na Aposta, barra e texto em carimbo violeta. É texto de leitura, então não vai em maiúsculas nem em letra de mão. Quando o Motivo já teve uma seção acima, o título se repete com "de novo" depois, em meta tinta clara. Dentro de uma seção, o título do filme desce um nível (h3) e "Por que cada um vai gostar" também (h4). Sessão de antes do #183, sem Motivo gravado, mostra os cards sem seção. No card inline do Claude não há seção: ele continua com 4 dados por filme.

### Card do filme

- **Corner Style:** 12px.
- **Background:** superfície sobre o chão, fio de 1px.
- **Internal Padding:** 16px em cima, 14px nos lados e embaixo.
- **Corpo:** título, original embaixo, sinopse e chips.
- **Chips:** ano, duração e gêneros em superfície 2 (o gênero com o ponto da cor dele antes do nome); o chip do IMDb sem fundo, com contorno de 1,5px em fio, "7,4 IMDb · 28 mil votos".
- **Trocado:** só a arte da capa cai para 70% de opacidade, sob o adesivo TROCAR. Título, sinopse, "Por que" e controles ficam inteiros: texto esmaecido perde o contraste AA.

### Adesivos de estado

- **TROCAR:** rosa, Rubik 800 15px maiúsculo, girado -9°, colado no meio da capa (40% da altura). Desmarcar Trocar tira o adesivo.
- **NOVO:** amarelo, Rubik 800 12px maiúsculo, girado 9°, no canto de cima à direita do estojo, 10px para fora. Só em quem entrou ao regerar.
- **APOSTA:** carimbo violeta (stamp; dark-stamp no escuro) num retalho de superfície com contorno de 2px, Rubik 800 12px maiúsculo, girado -6°, no canto de baixo à esquerda da capa, 38px acima do pé do estojo e para fora como o adesivo de preço. Só na Aposta da Recomendação. É carimbo, não adesivo: o palpite do balconista. Fica longe do NOVO, porque a Aposta que entrou ao regerar leva os dois. O título do carimbo diz por quê ("pouca Evidência, mas quem tem gosto parecido deu nota alta").
- **JÁ VI:** quando todos os Presentes marcaram Já vi, um adesivo em superfície com contorno de 2px e texto em tinta, mesmo tamanho e rotação do TROCAR, no mesmo lugar. Já vi de só parte dos Presentes não cola adesivo: aparece nas opções marcadas e na nota de Já vi.
- **Saiu da prateleira:** acima do primeiro card, em meta tinta clara, "Saiu da prateleira:" e o título do que saiu em letra de mão 15px tinta, com o motivo entre parênteses ("Teo já viu"). Um por linha quando sai mais de um.

### Nota prevista

Abaixo dos chips, quando algum Presente tem Nota prevista: o rótulo "NOTA PREVISTA" em label, tinta clara, e uma pílula por Presente que tem uma, na ordem dos Presentes: contorno de 1,5px em fio, o avatar de 24px e o número em Rubik 700 12px tabular, com uma casa ("8,3"), na escala de 1 a 10 do Já vi. Quem não tem Nota prevista não aparece: nunca um palpite. O leitor de tela ouve "Bruno: 8,3 de 10". A nota é a que a versão gravou na Sessão; ela não muda depois.

### Por que cada um vai gostar

Rótulo em label, com "Fato sobre N de M" à direita. Uma linha por Evidência, grade de 34px, 28px e o resto: avatar de 24px (ou avatares sobrepostos com anel de 2px quando a Evidência é a mesma), a Força em três pontos, e o texto do motor com a Fonte embaixo. Quem não tem Fato fecha a lista com o avatar vazado e "Fulano: sem fato sobre este filme", em tinta clara.

### Legenda

Acima dos cards: um avatar com o nome por Presente, e as três Forças com a palavra ("forte", "moderada", "fraca"). Meta, tinta clara, quebra em linhas.

### Força

Três pontos de 7px em tinta: ●●● forte, ●●○ moderada, ●○○ fraca. Vazado é anel de 1,5px. O nível é o preenchimento, nunca a opacidade nem a cor. O `aria-label` diz "Força forte".

### Opções (Já vi, Trocar, Todos)

- **Style:** pílula, 44px de altura, 0 14px, contorno interno de 1,5px em fio, Rubik 500 14px, sobre superfície.
- **State:** marcada ganha contorno de 2px em tinta, fundo superfície 2, peso 700 e um ícone de ✓ de 16px antes do texto. `aria-pressed` acompanha.
- **Foco:** anel de 2px em focus (dark-focus no escuro), afastado 2px. Vale para todo controle.
- Os controles do card vêm em duas linhas: primeiro Trocar, as estrelas e o link "Comentar" (no celular o link pode descer); depois a linha de Já vi, que começa com o rótulo "JÁ VI" e tem uma opção por Presente ("Você", "Teo") e "Todos". O campo do comentário só aparece depois do toque em Comentar (já com o foco) ou quando já tem texto, no fim dos controles: o card não carrega campo vazio.
- Marcar Já vi de uma Pessoa abre, logo abaixo, a **nota de Já vi**: cartão azul (card-stock, raio 8px, 10px 12px) com o avatar e "Nota do Teo" em Rubik 700 14px, a escala de 1 a 10 e o campo "o que achou".

### Escala de nota (1 a 10)

Dez botões numa grade de 10 colunas, 3px entre eles, 44px de altura, raio 6px, superfície com número em Rubik 700 14px tabular. A nota escolhida vira um círculo laranja com o número em on-sticker. `role="group"` com `aria-label="Nota de 1 a 10"`; cada botão diz o número.

### Estrelas

Cinco estrelas de 24px, cada uma num alvo de 36×44px. Acesas em star e preenchidas; apagadas em tinta clara a 45%, só contorno. Ficam na linha do Trocar.

### Botão principal

Laranja-preço, Rubik 800 15px maiúsculo em on-sticker, pílula de 44px, 0 22px. No Cartaz é "Enviar", que manda as marcações para a conversa no Claude ou regera no app. Ele mora na barra de envio, com o resumo do que foi marcado ao lado. Sem nada marcado, o botão fica e, ao tocar, avisa "Nada marcado ainda".

O **botão grande** da home ("Pedir filme", com ícone de +) ocupa a largura toda, 60px de altura, raio 14px, Rubik 800 18px.

No Claude, o Enviar manda o texto por `ui/message`, e o Claude só age com o sim de quem usa. Até ela aceitar as mensagens do app, o Claude pede para ela permitir a mensagem ou põe o texto na caixa de mensagem para ela mandar: um toque a mais, que o desenho conta como parte do fluxo. O sucesso do envio pode chegar antes dessa decisão, então a view diz "Enviado para a conversa", nunca "Regerado". O envio sai só do toque no botão, sem nova tentativa nem timer, em texto de até 8.000 caracteres. As marcações vivem só na view: se o Claude recarregar a view, ela volta do HTML, e o que precisa sobreviver fica no servidor.

### Acrescentar

Caixa em superfície, fio de 1px, raio 12px, 14px de padding, depois do último card. Rótulo "Acrescentar" em Rubik 700 14px com a dica em sistema 14px tinta clara ("contexto da noite ou gosto: “chegou a Ana”, “nada de terror”"), textarea de 2 linhas, os chips de Clima, "Copiar pro chat" (opção) e, no app, a nota de que as marcações ficam neste navegador. O Enviar não mora aqui: fica na barra de envio.

### Barra de envio

O resumo do que foi marcado e o Enviar ficam numa barra que gruda no pé da tela enquanto o Cartaz está nela, a um polegar de qualquer filme (#221). Superfície, fio de 1px, 8px 12px, o resumo em meta tinta clara à esquerda (em frase: "1 Trocar, 1 Já vi e estrelas em 1 filme"; vazio sem nada marcado) e o Enviar à direita; a linha de status ("Copiado. Cole no chat.", "Nada marcado ainda.") embaixo. No app, a barra encosta na barra de abas do celular (68px acima do pé) e, a partir de 900px, no pé da janela, com raio de 14px só em cima e fio em cima e dos lados. Na tela cheia do Claude ela é o pé fixo, na largura toda. No Claude sem tela cheia, a view tem a altura do conteúdo e a barra fica no fim. Sem resposta (Sessão com Feedback), não há barra.

### Campos

Superfície, contorno de 1,5px em fio, raio 8px, 44px de altura mínima, 9px 12px, sistema 15px. Rótulo em Rubik 700 14px com a dica em sistema 14px tinta clara ao lado ou embaixo. Placeholder em tinta clara (4,5:1 ou mais).

### Link

Para "Pular", "Retomar" e ações menores: sem fundo, sistema 14px tinta clara, sublinhado com 3px de afastamento, alvo de 44px de altura.

### Barra do topo e abas (app web)

- **Topo:** estojo preto, 56px, 4px 16px, brand em Rubik 800 18px case-ink; à direita o avatar do Dono com anel de 2px em estojo, num botão de 44px.
- **Abas:** quatro, na ordem: **Início** (casa), **Sessões** (fita), **Pessoas** (duas pessoas) e **Meu gosto** (coração). Sessões fica atual em `/sessoes/...`, inclusive no Feedback (`/sessoes/<id>/contar`); Pessoas em `/pessoas/...`; Meu gosto em `/meu-gosto/...` (Notas, import, export, fila). A página da própria Pessoa do Dono é Meu gosto: `/pessoas/<ela>` redireciona para lá.
- **Abas (celular):** fixas embaixo, superfície com fio de 1px em cima, 14px de respiro para a área segura. Uma coluna por aba, 54px, ícone de 20px sobre o rótulo em tab, tinta clara. A atual fica em tinta, peso 700, com um disco laranja de 30px atrás do ícone, a 85% de opacidade. `aria-current="page"`.
- **Abas (900px ou mais):** no topo, à direita de "filmes", texto em case-ink-2; a atual em case-ink com o mesmo disco laranja atrás do ícone.
- **Menu do avatar:** um `popover` nativo (abre sem JavaScript; um toque fora ou Esc fecha), preso 60px abaixo do topo, alinhado à direita da coluna de 1040px. Superfície, fio de 1px, raio 12px, 6px de padding, 240px. Em cima, o nome do Dono em Rubik 700 15px; embaixo, linhas de 44px em control com ícone de 20px e raio 6px, superfície 2 no hover: **Operações** (ferramentas, só admin; com o push falhando, "envio falhando" e o ícone de alerta em meta à direita) e **Sair** (porta com seta, POST para `/auth/logout`). O botão do avatar tem `aria-label` "Sua conta: Bruno", e o menu, "Conta".
- **Aviso de push falhando** (só admin): faixa no topo da página, em superfície 2 com texto em tinta e ícone de alerta, com o link "Ver Operações".

### Home: o balcão, a última Sessão e o guia

Uma coluna, de cima para baixo, com 16px entre os blocos. Não há lista de telas: as abas levam a todas.

1. **O balcão** (sempre). Um `section` no preto do estojo, raio 14px, 16px 14px 14px, texto em case-ink. Em cima, o h1 da página, "O que vai ser hoje?", em counter title. Embaixo, a etiqueta da prateleira em branco: "QUEM ESTÁ · QUANTO TEMPO · O QUE A NOITE PEDE", os três itens que o pedido preenche, com os pontos de sempre e `aria-label` "O pedido: quem está, quanto tempo vocês têm e o que a noite pede.". Depois, em meta case-ink-2, "Saem 5 filmes, cada um com o motivo de cada Presente gostar." e, por fim, o **botão grande** "Pedir filme", o único laranja da tela.
2. **Ficha da última Sessão** (quando houver uma com o Dono). Superfície com fio de 1px, raio 12px. Cabeçalho separado do resto por um fio tracejado de 1px (o canhoto), com "ÚLTIMA SESSÃO" em Rubik 800 13px maiúsculo tinta clara e, à direita, "Sexta, 21 nov · Você e Teo" em letra de mão 16px; o cabeçalho leva à Sessão. Embaixo, o pedido em evidence tinta clara, quando houver, e os filmes como lombadas: linhas de 38px em superfície 2, raio 6px, com a lombada preta de 8px à esquerda, o adesivo de preço compacto (26px) com a posição e o título em Rubik 700 15px, cortado com reticências; uma coluna no celular, duas a partir de 560px. Com Feedback pendente, a caixa **devolver** em card-stock (raio 8px, 12px): "Falta contar como foi" em letra de mão 19px, "Viram algum? Conte qual e o que cada um achou." em evidence e a opção "Contar como foi", que leva a `/sessoes/<id>/contar`. Sem pendência, uma linha em meta: "vimos Maré Baixa" ou "não vimos nada".
3. **Guia "Para começar"** (só enquanto falta algum passo; pulado não conta como falta). Um `section` em superfície, fio de 1px, raio 12px, 14px. Em cima, "Para começar" em step title e o progresso: três segmentos de 6px, um por passo, violeta (stamp) quando feito, só contornado tracejado em tinta clara quando pulado, superfície 2 quando falta; à direita, "1 de 3 feitos" em Rubik 700 13px tinta clara, tabular. O `role="progressbar"` diz o mesmo. Depois, uma lista dos três passos, sempre os três, na ordem (**Meu gosto**, feito com 10 Notas ou um import; **Importar do Letterboxd ou do Trakt**; **Conector no Claude**, feito sozinho quando `oauth_grants` tem um grant para o e-mail do Dono), separados por fio tracejado. Cada passo tem a marca de 28px à esquerda e, ao lado, o título em 15.5px com o estado:
   - **Falta fazer:** número em tinta num anel de 1,5px em tinta. Só o primeiro que falta diz o que pede (sistema 14.5px tinta clara) e mostra o conteúdo: em Meu gosto, o contador de 10 pontos de 14px (violeta os dados, anel de 1,5px em fio os que faltam) e "4 de 10"; no Conector, o endereço no preto do estojo (raio 8px, mono 14px em case-ink), os 3 passos de como adicionar o conector personalizado e a nota do balconista em letra de mão violeta 15px, "Este passo se marca sozinho quando o Claude entrar com o seu e-mail.". Todo passo que falta tem a ação em opção ("Dar notas", "Importar", "Copiar endereço") e "Pular" em link, que posta para `/inicio/pular`.
   - **Feito:** check violeta num anel de 2px em stamp; ao lado do título, em meta tinta clara, "feito" ("feito, 12 notas" em Meu gosto).
   - **Pulado:** o número num anel tracejado em tinta clara; ao lado do título, "pulado"; embaixo, "Retomar" em link abre o que o passo pede e a ação.

O guia nunca bloqueia: "Pedir filme" fica sempre em cima. Quando nenhum passo falta, o guia some da home inteira; não há carteirinha nem selo.

### Avatares

Círculo de 24px na cor do Presente, inicial em Rubik 700 11px em on-person. Vazado: fundo transparente, anel de 2px na cor e inicial na cor. Sobrepostos: -7px de margem e anel de 2px na cor da superfície.

## Browser surfaces

- Seleção de texto em sticker-yellow a 53%, texto em tinta.
- Foco: anel de 2px em focus, afastado 2px, em todo controle.
- Caret dos campos em tinta.
- Rolagem da tela cheia: barra fina em fio sobre fundo transparente.
- Números de ano, duração, nota e contagem em algarismos tabulares.

## Do's and Don'ts

### Do:

- **Do** abrir o Cartaz e as telas de Sessão com a etiqueta da prateleira do pedido, e a fala do Dono no papel amarelo quando houver.
- **Do** pôr cada filme num estojo preto, com o número no adesivo de preço laranja.
- **Do** colar o estado no objeto: TROCAR rosa, NOVO amarelo, JÁ VI de todos; e dizer em "Saiu da prateleira" o que saiu e por quê.
- **Do** manter estojo, etiqueta e adesivos iguais no claro e no escuro, com texto #121417 nos adesivos.
- **Do** dar a cada Presente a mesma cor no ponto, no avatar e na legenda, sempre com a inicial.
- **Do** mostrar a Força pelo preenchimento dos três pontos, com `aria-label`.
- **Do** escrever o nome do gênero no chip; a cor do ponto só lembra.
- **Do** manter um só botão laranja por tela ou modo.
- **Do** manter alvos de toque de 44px ou mais.
- **Do** conferir cada componente no claro e no escuro, a 360px e a 390px.
- **Do** servir Rubik e Permanent Marker da origem do app, declarada no CSP do recurso do MCP Apps; nunca em `data:` nem do Google Fonts.
- **Do** manter o card inline do Claude compacto (Marcar e, com algo marcado, o resumo e o Enviar; 4 dados por filme) e marcar vários filmes na tela cheia.
- **Do** deixar o Enviar na barra de envio, que gruda no pé, e não no fim da página.

### Don't:

- **Don't** usar laranja, amarelo, rosa ou violeta fora dos papéis deles.
- **Don't** pôr texto branco sobre adesivo.
- **Don't** usar a Permanent Marker em botão, rótulo, título de filme, campo, número a conferir, Evidência ou texto corrido.
- **Don't** fazer grade escura de capas com brilho, como streaming.
- **Don't** fantasiar a locadora com textura, ruído, fita rasgada, chiado ou papel envelhecido.
- **Don't** usar sombra com desfoque, sombra deslocada ou gradiente.
- **Don't** girar card, botão, campo ou texto do motor, nem adesivo mais de 12°.
- **Don't** mostrar Força, Presente, gênero ou estado só por cor.
- **Don't** esconder um filme marcado: ele fica, com o adesivo, até regerar.
- **Don't** escrever ou resumir uma linha de Evidência na interface; o texto é do motor.
- **Don't** repetir na home as telas que as abas já levam.
