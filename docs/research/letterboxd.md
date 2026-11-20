# Do CSV do Letterboxd aos IDs TMDB e IMDb

Pesquisa do ticket #4, feita em 2026-11-20.

## Resposta curta

O Wikidata resolve quase tudo sem tocar no Letterboxd. Monto o slug a partir do nome do filme, procuro esse slug na propriedade P6127 e confiro o ano. Numa amostra real de 355 filmes, isso achou 345 (97%), e todos os 345 tinham TMDB e IMDb no mesmo item. O que sobra (3%) são minisséries, especiais de stand-up e vídeos obscuros. A busca do TMDB por título e ano entra para esses, e o resto vai para uma fila de confirmação manual.

Raspar a página do filme, que é o que o letterboxd-csv-imdb-tmdb-mapper faz, é proibido pelos termos de uso do Letterboxd. Resolver em lote o link curto `boxd.it` também é acesso automatizado e cai na mesma cláusula. A v1 não deve fazer nenhum dos dois.

## O formato do export

O Letterboxd não documenta as colunas. O artigo de suporte diz só que a opção fica em Settings, gera um ZIP de CSVs com a conta inteira (inclusive conteúdo apagado e reviews de filmes apagados) e só funciona em navegador de desktop ([suporte do Letterboxd, atualizado em 2026-11-16](https://support.letterboxd.com/hc/en-us/articles/15179196880911-Can-I-get-a-copy-of-my-account-data)).

Para as colunas usei dois exports reais publicados no GitHub: o de [extratone/bilge](https://github.com/extratone/bilge/tree/3696d149a8c9bb905d877b67d9347b1a2f90ba65/curation/letterboxd) (commit de 2022-04) e o de [ttybitnik/diego](https://github.com/ttybitnik/diego/tree/cae45a0d50b3056330701b19e24e68017d5061cf/examples/silo) (commit de 2024-02). Os cabeçalhos são iguais nos dois:

| Arquivo | Colunas |
|---|---|
| `watched.csv` | `Date,Name,Year,Letterboxd URI` |
| `ratings.csv` | `Date,Name,Year,Letterboxd URI,Rating` |
| `diary.csv` | `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date` |
| `reviews.csv` | `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date` |
| `watchlist.csv` | `Date,Name,Year,Letterboxd URI` |

O ZIP do bilge também tem `profile.csv`, `comments.csv`, a pasta `lists/` e a pasta `deleted/`. Nenhum arquivo traz ID externo. `Rating` vai de 0,5 a 5. `reviews.csv` tem texto com HTML (`<b>KIEFO LOL</b>`) e vírgulas entre aspas, então precisa de um parser CSV de verdade. O README do mapper diz que o parser dele não dá conta desse arquivo ([README](https://github.com/Tetrax-10/letterboxd-csv-imdb-tmdb-mapper/blob/f0c6e005804af2048001ddd9799e5eb9d5be9ea0/README.md), seção "Known Issues").

O `Letterboxd URI` é sempre um link curto `https://boxd.it/<código>`, nunca o slug. E ele não aponta para o mesmo lugar em todos os arquivos. Em `watched.csv`, `ratings.csv` e `watchlist.csv` ele aponta para o filme. Em `diary.csv` e `reviews.csv` aponta para a entrada do diário. No export do bilge, Summer with Monika aparece como `boxd.it/JZC` no watched e como `boxd.it/msMnh` no diary. Conferi os dois redirecionamentos com uma requisição manual cada:

- `boxd.it/JZC` redireciona (302) para `letterboxd.com/film/summer-with-monika/`
- `boxd.it/msMnh` redireciona (302) para `letterboxd.com/davidblue/film/summer-with-monika/`

O mapper documenta a mesma coisa: o diary não tem link direto para o filme, então ele processa o watched primeiro e cruza o diary por nome e ano ([README](https://github.com/Tetrax-10/letterboxd-csv-imdb-tmdb-mapper/blob/f0c6e005804af2048001ddd9799e5eb9d5be9ea0/README.md), seção "Process diary.csv"; chave de cache `Name|:|Year|:|código` em [scraper.js, linha 159](https://github.com/Tetrax-10/letterboxd-csv-imdb-tmdb-mapper/blob/f0c6e005804af2048001ddd9799e5eb9d5be9ea0/scripts/scraper.js#L159)). Para o nosso caso basta isto: a chave do filme é `(Name, Year)`, e o URI só serve de chave dentro do watched, do ratings e da watchlist.

## Os caminhos

### 1. Wikidata P6127 (Letterboxd film ID)

O valor da P6127 é o slug da URL do filme, por exemplo `the-dark-knight`, com o formatador `https://letterboxd.com/film/$1/`. O regex aceita também a forma `film:<número>`. A página da propriedade marca a estabilidade como "sometimes changes" e registra que o Letterboxd tinha 949.033 filmes em 2024-07-16 ([Property:P6127](https://www.wikidata.org/wiki/Property:P6127)).

Contagens no WDQS (`query.wikidata.org`) em 2026-11-20:

| Consulta | Itens |
|---|---|
| com P6127 | 273.298 |
| com P6127 e P4947 (TMDB filme) | 268.697 |
| com P6127 e P345 (IMDb) | 268.426 |
| com P6127, P4947 e P345 | 263.919 |
| com P4947 | 291.280 |
| com P4947, sem P6127 | 22.583 |
| itens com mais de um valor de P6127 | 170 |

O WDQS estava limitando a 1 consulta por minuto ("Aggressively rate-limiting to 1 req / min - this rule was created during active wdqs outage"). Por isso rodei as outras consultas no [QLever](https://qlever.dev/wikidata), que indexa o mesmo Wikidata e deu 273.296 para a primeira contagem, dois a menos que o WDQS:

| Consulta (QLever) | Itens |
|---|---|
| com P6127, sem P4947 e sem P345 | 94 |
| com P6127, sem P4947, com P4983 (TMDB série) | 3.655 |
| valores de P6127 no formato `film:N` | 1.473 |
| slugs usados em mais de um item | 84 |

Duas leituras. Quando o item tem P6127, ele quase sempre tem também os outros dois IDs (96,6% têm os três). E a P6127 cobre 273 mil dos 949 mil filmes do Letterboxd, uns 29% do catálogo. Ou seja, a cauda longa fica de fora, mas o que as pessoas assistem está quase todo lá, como mostra a amostra abaixo.

A consulta, para refazer:

```sparql
SELECT (COUNT(DISTINCT ?f) AS ?n) WHERE {
  ?f wdt:P6127 ?lb ; wdt:P4947 ?t ; wdt:P345 ?i .
}
```

### 2. Slug presumido a partir do nome

O export não traz o slug, mas o slug é quase sempre o título em minúsculas com hífens. Quando dois filmes têm o mesmo título, um deles leva o ano no fim (`drive` é o de 1997, `drive-2011` é o de Refn). Gero os dois candidatos, `slug(Name)` e `slug(Name)-Year`, procuro na P6127 e aceito o item cuja data de publicação (P577) cai em `Year ± 1`. O `slug()` que usei: normaliza para ASCII (NFKD), põe em minúsculas, apaga apóstrofos e troca cada sequência de caracteres não alfanuméricos por um hífen. `Hit & Run` vira `hit-run`, e o Wikidata tem `hit-run-2012`.

Medi isso no `watched.csv` do bilge, 355 filmes vistos entre 2017 e 2022, quase todos comerciais:

| Caminho | Achados | Com TMDB e IMDb |
|---|---|---|
| slug presumido na P6127, com checagem de ano | 345 (97,2%) | 345 |
| rótulo `en` ou `mul` igual ao nome, com ano ± 1 | 327 (92,1%) | 327 |

Só um caso ficou com dois itens depois da checagem de ano: The Girl with the Dragon Tattoo (2011) bateu com `the-girl-with-the-dragon-tattoo-2011`, o certo, e também com a versão sueca, que estreou em 2009 mas tem no Wikidata datas de estreia em outros países até 2012. Comparar o ano com a P577 mais antiga do item, e não com qualquer uma, elimina esse empate. Se ainda sobrar empate, vence o candidato com sufixo igual a `Year`.

O casamento por rótulo perde para o slug por dois motivos. O Wikidata passou a guardar o rótulo de muitos itens grandes só na língua `mul`. Pulp Fiction (Q104123) não tem rótulo `en`, e a primeira versão da minha consulta, só com `en`, achou 234 em vez de 327. E os rótulos do Wikidata nem sempre são os títulos do Letterboxd ("Star Wars: Episode V – The Empire Strikes Back" contra "The Empire Strikes Back").

O que o slug presumido não achou (10 de 355): duas minisséries (The Queen's Gambit, The Comey Rule), dois especiais de stand-up, dois vídeos de carro, um documentário da web, um filme de fã, The Legend of Drunken Master (o Letterboxd usa outro slug) e Lupe (o slug `lupe` existe, mas é de outro ano, e a checagem de ano o rejeitou, como devia).

Limite da medida: não confirmei, para cada um dos 345, que o slug presumido é o slug real do filme no Letterboxd. Isso exigiria acessar o Letterboxd 345 vezes. A checagem de ano é o que protege contra pegar um homônimo. A amostra é de uma pessoa só, de gosto comercial. Quem assiste muito cinema de festival ou filme antigo vai ter cobertura menor.

### 3. letterboxd-csv-imdb-tmdb-mapper

O mapper ([Tetrax-10/letterboxd-csv-imdb-tmdb-mapper](https://github.com/Tetrax-10/letterboxd-csv-imdb-tmdb-mapper), MIT, último commit em 2025-04-11) baixa a página de cada filme a partir do `boxd.it`, com User-Agent de Chrome, e lê os botões "TMDB" e "IMDb" da página ([scraper.js, linhas 83 a 104](https://github.com/Tetrax-10/letterboxd-csv-imdb-tmdb-mapper/blob/f0c6e005804af2048001ddd9799e5eb9d5be9ea0/scripts/scraper.js#L83-L104)). A cobertura deve ser perto de 100%, porque toda página de filme do Letterboxd tem link para o TMDB (o rodapé do site diz "Film data from TMDB", [FAQ](https://letterboxd.com/about/faq/)). Mas é raspagem, e os termos proíbem (ver abaixo). Não usar.

### 4. Busca do TMDB por título e ano

`GET /3/search/movie` aceita `query`, `year`, `primary_release_year`, `language`, `region`, `include_adult` e `page`, e procura em "original, translated and alternative titles" ([referência](https://developer.themoviedb.org/reference/search-movie)). A referência não explica a diferença entre `year` e `primary_release_year`. Depois de escolher o resultado, `GET /3/movie/{id}/external_ids` devolve `imdb_id` e `wikidata_id` ([referência](https://developer.themoviedb.org/reference/movie-external-ids)), e `GET /3/find/{id}` resolve o caminho inverso a partir de `imdb_id` ou `wikidata_id` ([referência](https://developer.themoviedb.org/reference/find-by-id)).

Não medi a cobertura deste caminho porque não há chave do TMDB neste ambiente. Ele vale para a sobra do Wikidata: busca com `primary_release_year = Year`, aceita só se houver um resultado com título igual (ignorando caixa e pontuação), e se não houver, tenta `Year ± 1`. Com mais de um candidato, vai para a fila manual. Para minisséries a busca de filme não serve, e elas estão fora do escopo de qualquer jeito.

### 5. O slug real, via `boxd.it` ou página do filme

Os termos de uso do Letterboxd (atualizados em outubro de 2026) dizem, na cláusula 6.11: "you must not employ any robot, spider, scraper, deep-link, or other automated data gathering or extraction tool, program, or algorithm to access, acquire, copy, or monitor any portion of the Service". A 6.8 proíbe exportar conteúdo do serviço "except your own Posted Content" e criar um índice de "any significant portion of the Service content" sem autorização por escrito ([Terms of Use](https://letterboxd.com/legal/terms-of-use/)).

Raspar a página do filme viola a 6.11. Seguir o redirecionamento do `boxd.it` em lote também é acesso automatizado e, pela letra da cláusula, também viola, mesmo sem ler o HTML. As duas requisições que fiz foram manuais, uma por arquivo, só para ver o formato. Construir uma tabela slug→TMDB raspando o site violaria ainda a 6.8.

A API oficial existiria para isso, mas a página `letterboxd.com/api-beta/` devolveu 403 e não consegui ler as condições de acesso.

## O que fazer com a sobra

Na amostra a sobra foi 3%. Para cada filme não resolvido, a CLI grava o par `(Name, Year)` numa fila. O dono resolve de três jeitos: cola o link do TMDB ou do IMDb, marca "não é filme" (minissérie, especial) ou marca "ignorar". A resolução manual vira fato do Tipo "declarado", com o dono como fonte. Os filmes que ficarem sem ID entram no perfil como gosto sem ligação ao grafo, e o motor não usa esses filmes.

Se o dono colar também o link do filme no Letterboxd, dá para adicionar a P6127 ao item no Wikidata, e o caminho 1 passa a achar esse filme para qualquer pessoa.

## Cadeia de resolução recomendada para a v1

Para cada linha de `watched.csv`, `ratings.csv` e `watchlist.csv`, com chave `(Name, Year)`:

1. Gerar `slug(Name)` e `slug(Name)-Year`, procurar na P6127 e aceitar o item cuja P577 mais antiga cai em `Year ± 1`. Desempatar pelo sufixo igual a `Year`. Ler P4947 e P345 do item. Confiança alta.
2. Se não achar, procurar por rótulo ou alias `en`/`mul` igual a `Name`, com P577 em `Year ± 1` e tipo filme. Confiança média.
3. Se não achar, buscar no TMDB com `primary_release_year`. Aceitar só resultado único com título igual. Pegar o IMDb em `external_ids`. Confiança média.
4. O resto vai para a fila manual descrita acima.

`diary.csv` e `reviews.csv` se ligam ao filme por `(Name, Year)`, usando o que o watched já resolveu. Nada na cadeia acessa o Letterboxd.

Para consultas em lote, usar uma consulta com `VALUES` de centenas de slugs de uma vez, ou o dump do Wikidata. O WDQS estava em 1 consulta por minuto neste dia. O QLever respondeu as 355 linhas numa consulta só.
