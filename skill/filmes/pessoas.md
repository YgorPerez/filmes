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

## Ajuste

Quando o Dono disser que um elo pesa pouco ou muito para alguém ("pro
Lorenzo ator não importa", "a Duda vê tudo do diretor que ela gosta"), use
`pessoa` com `acao: "ajustar"`, o `elo` (`diretor`, `roteiro`, `elenco`,
`serie` ou `genero`) e o `nivel`. "Não importa" é `nada`, que tira as
Evidências desse elo. "Importa pouco" é `pouco`, que vale metade e desce a
Força um nível. "Importa muito" é `muito`. `normal` desfaz. O Ajuste não
apaga o que a Pessoa disse de um ator ou diretor nomeado: "gosta de Jake
Gyllenhaal" continua valendo. Confirme com o Dono o elo e o nível antes de
gravar.

## Já visto

"Já vi", "Lorenzo viu, nota 8" e "esse todo mundo já viu" viram `pessoa`
com `acao: "visto"`, a Pessoa e o ID do filme (ache com `consultar`).
"Todo mundo" é uma chamada por Presente. Se a Pessoa disse a nota, passe
em `nota`: "8/10" quando ela falou de 0 a 10, "4,5" quando falou em
estrelas. Sem nota, grava só o Já visto. A nota grava uma Nota, que pesa
no gosto da Pessoa como as do Letterboxd. Para tirar da próxima
Recomendação o que alguém já viu, passe `sem_ja_visto` a `recomendar`.

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

Se o relatório avisar que o TMDB não respondeu, os itens que ele não
chegou a ver ficam na fila. Antes de levar esses itens ao Dono, chame
`fila_import` com `acao: "reprocessar"` (e `pessoa`, para só os dela).

## Exportar para o MovieLens

O MovieLens só importa o CSV de avaliações do IMDb. Quando o Dono pedir as
Notas de alguém nesse formato, chame `exportar` com a Pessoa, `formato: "imdb"`
e um caminho em `exports/` do repo de dados (ex.: `~/filmes-dados/exports/lorenzo-imdb-ratings.csv`),
nunca no repo de código. Vai a Nota mais recente de cada filme, de 1 a 10.
A Pessoa sobe o arquivo em movielens.org, Import or Export Data; o MovieLens
pula filme que não conhece e não sobrescreve nota que ela já deu lá.

## Desfazer um registro

Quando o Dono corrigir algo já gravado ("não era esse filme", "ela não
disse isso"), não edite o arquivo da Pessoa. Chame `pessoa` com
`acao: "ver"`, ache o item e chame `acao: "remover"` com a Pessoa e um
só campo entre `declarado`, `relato`, `veto` e `visto`, com o `fato_id`
do item. O alvo (tt..., Q...) também serve quando só um item daquele tipo
tem esse alvo. Depois registre o certo, se houver.

Declarado com `fato_id` que começa por `feedback:` é o Comentário de um
Presente no Feedback de uma Sessão. `remover` tira o Comentário do arquivo
da Sessão; a Nota ou o Relato que ele acompanhava fica.

Declarado com `fato_id` que começa por `letterboxd:` veio de um import, e
`remover` recusa. Para tirar um import inteiro (um RSS que o ZIP vai substituir, um
export da Pessoa errada), chame `importar` com `remover` e o `arquivo`
que `ver` mostra em `imports`. Saem o registro, a cópia guardada e os
Fatos que só esse import trazia.
