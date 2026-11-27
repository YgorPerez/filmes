# Product

<!-- impeccable:product-schema 1 -->

<!-- Escrito no #78 sem entrevista: as respostas vêm das decisões do mapa #72 (grilling de 2026-11-24 com o Dono). Emendado no #142 com as decisões do mapa #140 (grilling de 2026-11-25) e a direção visual que o Dono escolheu. O que os mapas não decidem está marcado "a decidir". -->

## Platform

web

## Stack

Decidida no mapa #72: a mesma do pesquisa-relacionamentos. Workspace pnpm neste repositório, com Vite+ (Oxfmt, Oxlint, Vitest), TypeScript 7, TanStack Start (React 19, Router, Query, Nitro), Base UI, shadcn, Tailwind 4, Storybook, Playwright, fallow e react-doctor. O motor vira `packages/engine`, em TypeScript com Effect; `frontend/` serve o app web, o MCP por HTTP, o OAuth e o Cartaz. Roda num contêiner Docker atrás do Nginx na VPS, em `cinema.finalsend.com.br`, publicado a cada push na branch padrão.

## Users

Duas pessoas usam a interface, as duas como Dono das próprias Sessões:

- **Ygor**, que criou o filmes e é o único `admin` (consultar o banco, avaliar pesos).
- **Outra Dona da casa**, que entra pelo celular.

As duas pedem filme para uma noite concreta: sozinhas, em casal, com amigos ou com criança, quase sempre no celular, no sofá, pouco antes de ver. Querem uma lista curta em que confiem e, para cada filme, o motivo de cada pessoa da sala gostar.

As outras Pessoas (quem assiste junto) não entram no app. Elas aparecem como Presentes, com gosto, Vetos e Notas, e o Dono fala por elas.

## Product Purpose

O filmes recomenda filmes para quem vai assistir junto e mostra, para cada Presente, o Fato que sustenta o motivo. O Dono diz quem está, quanto tempo tem e o que a noite pede; recebe uma Recomendação de 5 filmes; marca no Cartaz o que já viu, o que quer trocar e o que achou; e, depois da Sessão, conta o que viram e como foi, o que alimenta o gosto e a Satisfação.

Deu certo quando a escolha sai em poucos minutos e ninguém da sala sente que foi ignorado.

## Positioning

Cada linha de "Por que cada um vai gostar" aponta para um Fato guardado, com Fonte, data, Força e Tipo. Quando não há Fato sobre um Presente, a linha diz "sem fato" em vez de inventar. O motor junta o gosto de todos os Presentes, respeita os Vetos de cada um e favorece quem saiu menos satisfeito das últimas Sessões. Streaming e apps de recomendação não sabem quem está na sala nem dizem de onde vem a sugestão.

## Operating Context

- Dois caminhos para a mesma coisa:
  - **Claude**: o Dono conversa com o Claude no app (conta grátis, um conector personalizado, que funciona no celular). O filmes é esse conector, por MCP sobre HTTP. O Cartaz aparece dentro da conversa como view do MCP Apps, num WebView, no tema claro ou escuro do app. O Dono marca vários filmes e toca em Enviar; a resposta vai para a conversa e o Claude regera.
  - **App web**: formulário estruturado para o pedido da Sessão, sem chamada a LLM. A home abre no pedido ("Pedir filme"), mostra a última Sessão com o Feedback pendente e, enquanto falta algum passo, o guia de 3 passos (Meu gosto, Importar do Letterboxd ou Trakt, Conector no Claude), cada um feito, pendente ou pulado; o pulado fica no frontmatter da Pessoa do Dono, em qualquer aparelho. As abas são Início, Sessões, Pessoas e Meu gosto (a página da Pessoa do Dono, com Notas, import e export); Operações fica no menu do avatar. Quem não tem histórico dá Notas numa tela própria, com os filmes de mais votos no IMDb. Telas de Sessões (pedido, Cartaz, regerar, Feedback), Pessoas (gosto, Vetos, Ajustes, perguntas abertas), import do Letterboxd e do Trakt com a fila de resolução, export, e Operações (consulta SQL, avaliar) só para quem é `admin`.
- O Cartaz é um componente React só, usado nos dois caminhos.
- Login com Google; só entra quem tem o e-mail numa Pessoa que é Dono.
- Pessoas e Sessões são Markdown no repo privado filmes-dados. Cada gravação é um commit em nome de quem está logado. Push que falha fica na fila, e o admin vê um aviso quando falha de novo e de novo.
- Vocabulário em `GLOSSARY.md`. Os termos dele (Sessão, Presentes, Veto, Clima, Restrição, Evidência, Força, Já visto, Trocar, Regerar) são os da interface.

## Capabilities and Constraints

- A Recomendação tem 5 filmes. Por filme: capa e título em português do TMDB, título original, sinopse, ano, duração, gêneros, nota e votos do IMDb, um ponto por Presente (cheio com Fato, vazado sem), e a Evidência mais forte de cada Presente com a Força em três degraus (forte, moderada, fraca).
- No Cartaz, por filme: Já vi por Presente (com nota de 1 a 10 e o que achou), Trocar, estrelas de 1 a 5 e comentário; no fim, o acrescentar. Regerar mantém o que não caiu no mesmo número, marca os que entram com "novo" e diz o que saiu e por quê.
- Todo texto de Evidência sai do motor. A interface nunca escreve nem reescreve uma linha de Evidência.
- Sem capa (TMDB sem resposta), o filme sai com o título no lugar da capa.
- Gosto permanente só é gravado depois de um sim do Dono. Contexto da noite regera direto.
- O guia da home nunca bloqueia: dá para pedir filme desde o primeiro login.
- Operações (`consult`, `evaluate`) só para `admin: true`.
- Fora do escopo: cadastro aberto, outras línguas, rede social, streaming, notificações.
- Atribuição das fontes: o mínimo que os termos de cada uma pedem, numa página de Créditos (`/creditos`) aberta a qualquer um e ligada do rodapé de toda página. Nada nos cards. Decisão do Dono, mapa #279 (#292).
- A decidir: o nome que aparece na tela (o repo se chama `filmes`; o domínio é `cinema.finalsend.com.br`).

## Brand Commitments

- Voz: PT-BR coloquial, direta, de quem conhece o gosto de cada um, como o balconista da locadora do bairro. Usa os termos do GLOSSARY. Nada de "IA", "algoritmo" ou entusiasmo de app de streaming.
- "Sem fato" é dito com todas as letras. Falta de dado nunca vira "não gosta".
- A Força nunca aparece só como cor: vai com o marcador e a palavra para o leitor de tela.
- Cada Presente tem uma cor só dentro de uma Sessão, a mesma no ponto da capa e no avatar da Evidência.

## Evidence on Hand

- O Cartaz de hoje, em HTML para o T3 Code: `filmes/cartaz/__init__.py`, `cartaz.css` e `cartaz.js`. Ele segue as variáveis de tema do T3 (claro e escuro) e não tem identidade própria.
- Capas, títulos em português e sinopses vêm do TMDB; nota e votos, do IMDb. A fixture (`tests/fixture/`) tem filmes, Pessoas e respostas gravadas fictícios, bons para Storybook e testes.
- Três protótipos de direção visual do #141 em `prototypes/` (Letreiro de rua, Locadora de bairro, Catálogo da Mostra), cada um com o Cartaz (web, Claude inline e tela cheia) e a home nos 3 estados do guia. O Dono escolheu a **Locadora de bairro** no #142; ela é o mundo de `DESIGN.md`, e os outros dois ficam como histórico.
- Não há logo, marca, depoimentos nem métricas de uso. Nada disso pode ser inventado.

## Product Principles

1. Toda razão tem Fato por trás, ou diz que não tem.
2. A noite é de todos os Presentes: a tela mostra cada um, inclusive quem fica de fora.
3. Decidir no sofá, com uma mão: lista curta, toque grande, nada de formulário longo no Cartaz.
4. Ninguém grava gosto por engano: o que é só desta noite regera, o que é para sempre pede um sim.
5. A capa do filme é a imagem do produto; o resto da tela não compete com ela.

## Accessibility & Inclusion

- WCAG 2.2 AA nos dois temas, claro e escuro, porque o WebView do Claude segue o tema do celular.
- Celular primeiro, a partir de 360px de largura. Alvos de toque de 44px no Cartaz e no app.
- Força, Já visto e "sem fato" nunca só por cor. A cor de cada Presente vem sempre com a inicial.
- Funciona sem arrastar e com teclado.
