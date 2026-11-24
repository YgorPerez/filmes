---
version: 1
slug: "prototypes-cartaz-prototype-html"
primary_target: "prototypes/cartaz.prototype.html"
related_targets: []
---

# Cartaz

Modo: Operate. O Dono decide o filme da noite no celular, dentro do Claude (view do MCP Apps, tema claro ou escuro do app) ou no app web. Primeira superfície do mundo "Letreiro de rua"; o app web herda o mundo.

Tarefa: ler a Recomendação (5 filmes), ver por que cada Presente vai gostar, marcar Já vi, Trocar, estrelas e comentário, acrescentar e Enviar. Estados que importam: Trocado, Já vi de um Presente, "novo" depois de regerar, "Saiu", sem capa, sem fato.

## Direction contract

THESIS: o pedido da noite aparece como o letreiro de um cinema de rua, e o resto é uma tela de trabalho limpa. Recusa o cartaz de streaming (grade de capas escura com brilho) e o formulário cinza.
OWN-WORLD: painel aceso quase branco com letras pretas condensadas em placas (Antonio 700), moldura vermelho-cinema, lâmpada âmbar só no "novo" e nas estrelas; telas em neutro sem tom, uma cor por Presente. Estados carimbados: Trocar é um carimbo vermelho sobre a capa, nada some.
STORY: o Dono confere no letreiro que o pedido foi entendido, lê de cima para baixo os 5 filmes, marca com o polegar e toca em Enviar.
FIRST VIEWPORT: no celular (390px), letreiro de 2 linhas no topo, legenda dos Presentes, e o card 1 com capa de 104px à esquerda e número em letra de letreiro vermelho junto do título; Enviar fica no fim da lista.
FORM: Letreiro de cinema de rua, 6º da lista ordenada (locadora de bairro, ingresso, programação do jornal, catálogo da Mostra, ficha da Cinemateca, letreiro de rua, saco de pipoca). seed:79304b91493db6b8. Raises: carimbo de estado (da carteira de passagens, competitivo), Força por preenchimento e não por opacidade (da labanotation, recusado), cor chapada sem gradiente fora da capa (do mapa do zoológico, recusado), uma cor de destaque rara (do canon monocromático, recusado).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Em aberto

- Direção escolhida sem o Dono ver a mão (rodada sem resposta, #78). Alternativas: locadora de bairro (escolha do impeccable), ingresso carimbado (desafiante competitivo).
- O tema do host no MCP Apps (variáveis que o Claude passa ou só prefers-color-scheme) depende do #75.
