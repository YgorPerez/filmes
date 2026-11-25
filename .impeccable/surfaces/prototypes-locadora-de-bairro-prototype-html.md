---
version: 1
slug: 'prototypes-locadora-de-bairro-prototype-html'
primary_target: 'prototypes/locadora-de-bairro.prototype.html'
related_targets: []
---

# Cartaz e Início

Modo: Operate. O Dono decide o filme da noite no celular, dentro do Claude (view do MCP Apps, tema claro ou escuro do host) ou no app web, e configura o filmes pela home. Primeiras superfícies do mundo "Locadora de bairro", que o Dono escolheu no #142 entre os três protótipos do #141; o resto do app web herda o mundo (#145 a #149).

Tarefas: no Cartaz, ler a Recomendação (5 filmes), ver por que cada Presente vai gostar, marcar Já vi, Trocar, estrelas e comentário, acrescentar e Enviar; no Claude, ver a lista compacta na conversa e abrir a tela cheia para marcar. Na home, seguir o guia de 3 passos (Meu gosto, Importar, Conector no Claude) sem que ele bloqueie o pedido; depois, pedir filme e contar como foi a última Sessão. Estados que importam: Trocado, Já vi de um Presente e de todos, "novo" depois de regerar, "Saiu da prateleira", sem capa, sem fato; passo pendente, aberto, pulado e feito.

## Direction contract

THESIS: cada filme é uma fita da locadora de bairro, e o pedido da noite está impresso na etiqueta da prateleira; o resto é uma tela de trabalho clara. Recusa o cartaz de streaming (grade escura de capas com brilho), o formulário cinza e a nostalgia de enfeite (VHS rasgada, chiado, papel velho).
OWN-WORLD: estojo preto em volta de cada capa, etiqueta clara em Rubik 800 maiúscula num trilho preto, fala do Dono em Permanent Marker num papel amarelo; adesivos chapados com texto #121417: laranja para número e ação principal, amarelo para "novo", rosa para Trocar; carimbo violeta e cartão azul-claro na carteirinha. Chão frio claro de dia, azul-noite no escuro; estojo, etiqueta e adesivos iguais nos dois temas. Uma cor por Presente, sempre com a inicial.
STORY: o Dono confere na etiqueta que o pedido foi entendido, lê de cima para baixo as 5 fitas, cola os adesivos com o polegar e toca em Enviar. Na primeira visita, vê na carteirinha quantos carimbos faltam e resolve o primeiro passo, ou pede filme assim mesmo.
FIRST VIEWPORT: Cartaz no celular (390px): barra preta do topo, etiqueta da prateleira com o papel amarelo, legenda dos Presentes, "Saiu da prateleira" e o card 1 com o estojo de 112px à esquerda e o adesivo de preço laranja no canto; Enviar no fim. Home de quem chegou: barra preta, carteirinha com o nome à mão e três casas vazias, o passo 1 aberto com "Dar notas" laranja e as abas embaixo.
FORM: Locadora de bairro, 1º da lista ordenada do #78 (locadora de bairro, ingresso, programação do jornal, catálogo da Mostra, ficha da Cinemateca, letreiro de rua, saco de pipoca), a escolha do próprio impeccable no #78, prototipada no #141 e escolhida pelo Dono no #142. Sem seed: escolha do Dono, não do sorteio. Raises que ficam: Força por preenchimento e não por opacidade, cor chapada sem gradiente, carimbo de estado (agora adesivo e carimbo da carteirinha).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Em aberto

- O protótipo é descartável: o Cartaz e a home de verdade nascem em `frontend/` nos tickets #145 e #146, seguindo `DESIGN.md`. Quando existirem, este brief passa a apontar para eles e `DESIGN.md` é regerado do código.
- `prototypes/cartaz.prototype.html` (#78), `letreiro-de-rua.prototype.html` e `catalogo-da-mostra.prototype.html` (#141) são histórico de direções recusadas.
