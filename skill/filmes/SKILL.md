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

## Mostrar

Para cada filme, na ordem que o motor devolveu: título, ano e duração, e a
Evidência mais forte de cada Presente, assim:

```
**1. As Horas Lentas** (2021, 1h44)
- **Você:** <texto> (<fonte>, <data>) *(<forca>, <tipo>)*
```

O texto, a fonte, a data, a Força e o Tipo vêm do JSON do motor e são
copiados sem mudar uma palavra. Nunca invente uma linha de evidência. Se o
motor não deu Evidência para alguém, a linha diz "sem fato".

## Consultar

Perguntas sobre o que o sistema sabe vão pela ferramenta `consultar`, só com
SELECT.
