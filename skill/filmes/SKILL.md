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

Filme com `so_palpites: true` não tem Fato nenhum: só aparece no fim, quando
faltam filmes com Fato, e o título leva "— sem fato que o sustente".

## Pessoas

A ferramenta `pessoa` cadastra e mostra Pessoas e grava o gosto delas no repo
de dados. O que se grava vale já na próxima Recomendação.

- O que a própria Pessoa disse ("adoro a Sofia Rangel", resposta de
  questionário, review dela) é `declarar`. O que o Dono conta dela ("o Leo
  odeia filme lento") é `relatar`. "Nunca vê terror" é `vetar`.
- Passe o alvo pelo ID do Catálogo (`filme` tt..., `entidade` Q... de diretor,
  ator ou gênero), achado com `consultar`, e a `reacao`. Filme que a Pessoa ama
  ou odeia vira Nota 5 ou 1.
- Guarde o `texto` como a Pessoa ou o Dono disse. Ele aparece na linha de
  Evidência entre aspas.
- A leitura do pedido cita os Vetos que agiram, que vêm em `vetos` no JSON de
  `recomendar`.

## Consultar

Perguntas sobre o que o sistema sabe vão pela ferramenta `consultar`, só com
SELECT.
