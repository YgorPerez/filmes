---
name: filmes
description: Recomenda filmes para o Dono, sozinho ou com amigos, com uma linha de evidência por motivo. Use quando o Dono pedir filme para ver ("o que vejo hoje?", "somos eu e a Ana, 2h") ou quiser consultar o banco de filmes.
---

# Recomendar filmes

Esqueleto. O ticket #28 completa esta skill (Sessão aberta, leitura do pedido,
Feedback, questionário, verificador).

## Pedir

Chame a ferramenta `recomendar` do MCP `filmes` com os Presentes. O Dono é
`"dono"`; as outras Pessoas vão por nome ou apelido.

A Regra de escolha vai em `regra`. Sem ela vale a padrão, em que ninguém sai
miserável. "Tanto faz", "pela média": `regra: "media"`. "Hoje é a vez da Ana",
"aniversário da Ana": `regra: "de"` com `de: "ana"`; a Ana precisa estar entre
os Presentes.

O Clima vai em `climas`, com os nomes do vocabulário fixo que a descrição da
ferramenta lista: "algo leve" é `leve`, "pra dar risada" é `pra rir`, "algo
tenso" é `tenso`. Se o motor devolver um aviso `clima_desconhecido` em
`avisos`, diga ao Dono que aquele Clima não existe e ficou de fora; o motor
recomendou sem ele.

## Mostrar

Para cada filme, na ordem que o motor devolveu: título, ano e duração, e uma
linha por Presente. `evidencias` vem agrupado pelo slug de cada Presente, na
ordem do pedido; mostre a Evidência mais forte de cada um, assim:

```
**1. As Horas Lentas** (2021, 1h44)
- **Você:** <texto> (<fonte>, <data>) *(<forca>, <tipo>)*
- **Iara:** sem fato *(fraca, palpite)*
```

O texto, a fonte, a data, a Força e o Tipo vêm do JSON do motor e são
copiados sem mudar uma palavra. Nunca invente uma linha de evidência. Quem
não tem Fato sobre o filme já vem com a linha "sem fato" do motor.

`evidencias_do_filme` traz as linhas que falam do filme e não de alguém: o
Clima pedido ("Clima leve: ...") e "para ver em grupo" ou "para ver sozinho".
Mostre no máximo uma, a primeira, depois das linhas dos Presentes:

```
- **Filme:** <texto> (<fonte>, <data>) *(<forca>, <tipo>)*
```

Se `creditos` vier com alguma frase, ela vai na linha de créditos do fim.

Filme com `so_palpites: true` não tem Fato nenhum: só aparece no fim, quando
faltam filmes com Fato, e o título leva "— sem fato que o sustente".

## Consultar

Perguntas sobre o que o sistema sabe vão pela ferramenta `consultar`, só com
SELECT.
