# Pessoas e gosto

Use `pessoa` com `acao: "criar"` para cadastrar nome e apelidos. Use
`acao: "ver"` para mostrar o que se sabe da Pessoa. A idade da criança
mais nova só entra no pedido da Sessão.

## Questionário

Dê as seis perguntas ao Dono para ele repassar à Pessoa e colar as respostas.

1. Quais filmes você ama? O que gosta neles?
2. Quais filmes você odeia? O que te incomodou?
3. Que gêneros ou tipos de filme você costuma procurar?
4. Tem diretor, atriz ou ator que faz você querer ver um filme?
5. Que tipo de filme você costuma evitar, mas toparia ver em certas ocasiões?
6. Que tipo de filme você nunca aceita ver?

Quando chegarem as respostas, use `consultar` para resolver títulos
(`filmes`) e entidades (`entidades`) no Catálogo. Se o título for
ambíguo, peça ano ou outro detalhe antes de gravar.

- Use `pessoa` com `acao: "declarar"` e `fonte: "questionário"` para o que a Pessoa disse de si. Passe o trecho literal em `texto`. Filme que ela ama ou odeia vai com o ID e `reacao: "ama"` ou `"odeia"`. O motor gera a Nota declarada de 5 ou 1.
- Marque como `especifico` um filme, diretor, ator ou subgênero identificado. Use `generico` para gostos amplos, como "gosto de comédia" ou "evito filmes lentos". Use o ID do alvo quando existir e a reação correspondente. Texto sem alvo fica registrado para consulta.
- Para "nunca vejo X", use `acao: "vetar"` com o texto e o ID do filme ou da entidade. Se não achar um alvo no Catálogo, informe a pendência ao Dono.
- Para uma impressão que veio do próprio Dono sobre outra Pessoa, use `acao: "relatar"`. Preserve a fala e passe alvo e reação quando ela os identificar.

Ao terminar, diga o que entrou e quais alvos ainda precisam de identificação.

## Imports

Chame `importar` com a Pessoa e o caminho do ZIP do Letterboxd ou do
export do Trakt, no campo do formato correspondente. Se a Pessoa só deu o
usuário do Letterboxd, pergunte se ela concorda que o RSS público dela seja
baixado e, com o sim, passe o usuário em `letterboxd_rss`. O RSS traz só as
cerca de 50 entradas recentes do diário, com nota e data; o ZIP completo
importado depois soma o resto sem repetir Fatos. Mostre o relatório
de resolução e as pendências. Para os itens da fila, chame `fila_import`
com `acao: "ver"`. Mostre as opções e use `confirmar` com o ID do
filme ou `descartar` com a razão (`razao`) depois que o Dono decidir.
