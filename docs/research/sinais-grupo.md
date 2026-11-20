# Sinais de "bom em grupo ou sozinho" nas reviews

Pesquisa do ticket #3, feita em 2026-11-20. Pergunta: de onde dá para extrair, de forma legal e reproduzível, sinais de que um filme funciona melhor em grupo ou sozinho, e como cada sinal vira uma linha de evidência.

## Resposta curta

Nenhuma fonte pública diz "veja com amigos" em volume útil. Quando alguém escreve isso explicitamente, é raro: no MovieLens inteiro, a tag "date movie" aparece em 18 filmes e "watch with kids" em 5. O que existe em volume são sinais indiretos (feel-good, quotable, "so bad it's good", lento, meditativo), e o salto de "meditativo" para "melhor sozinho" é uma inferência do projeto, não do público. A evidência tem que mostrar o fato (a tag e a contagem) e deixar a inferência visível.

Para a v1 eu usaria três coisas: as tags do MovieLens (contagens do `tags.csv` e escores do tag genome), as tags e reviews do export do Letterboxd de quem está na sessão, e o histórico de sessões do próprio projeto. Ficam fora da v1 as reviews do TMDB (poucas, e os termos vetam uso ligado a IA), os comentários do Trakt (os termos proíbem copiar o conteúdo) e o site do IMDb (scraping proibido). O corpus de 2,6 milhões de reviews do IMDb que vem no Tag Genome 2021 é o único texto de review que dá para minerar legalmente; vale um teste depois da v1.

## Fontes, uma a uma

### MovieLens: tags livres (`tags.csv`)

- **Acesso.** Download direto do `ml-latest.zip`. O README diz que o dataset tem 2.328.315 aplicações de tag em 86.537 filmes, de 330.975 usuários, gerado em 2023-07-20 ([README do ml-latest](https://files.grouplens.org/datasets/movielens/ml-latest-README.html)). Cada linha é `userId,movieId,tag,timestamp`, e o `links.csv` liga `movieId` a `imdbId` e `tmdbId` (mesmo README).
- **Licença.** Uso para pesquisa, sem fins comerciais sem permissão da GroupLens, sem sugerir endosso da Universidade de Minnesota; redistribuição só sob as mesmas condições (mesmo README). O texto fala em "any research purposes". Um recomendador pessoal entre amigos não é pesquisa no sentido estrito; ver "Névoa" abaixo.
- **Reprodutibilidade.** O README avisa que o `ml-latest` "é um dataset de desenvolvimento" e "pode mudar com o tempo". Para reconstruir o SQLite igual, o projeto precisa fixar o arquivo (hash do zip ou a data de geração).
- **Volume do sinal.** Contei no `tags.csv` (baixado em 2026-11-20), em minúsculas:

| Tag | Aplicações | Filmes | Usuários | Exemplo com mais aplicações |
|---|---:|---:|---:|---|
| slow | 2.484 | 766 | 1.038 | 2001: A Space Odyssey (107) |
| feel-good | 1.547 | 230 | 890 | Amélie (204) |
| slow paced | 1.199 | 352 | 659 | No Country for Old Men (69) |
| feel good movie | 800 | 77 | 569 | Intouchables (108) |
| meditative | 522 | 93 | 289 | 2001: A Space Odyssey (65) |
| so bad it's good | 496 | 183 | 268 | The Room (71) |
| guilty pleasure | 166 | 62 | 118 | 10 Things I Hate About You (32) |
| contemplative | 130 | 30 | 113 | Ex Machina (79) |
| mst3k | 107 | 82 | 27 | Mystery Science Theater 3000: The Movie (6) |
| family friendly | 79 | 34 | 59 | Luca (16) |
| date movie | 33 | 18 | 21 | 50 First Dates (13) |
| drinking game | 15 | 13 | 5 | Top Gun (2) |
| watch with kids | 8 | 5 | 7 | Earth to Echo (4) |
| with friends | 1 | 1 | 1 | (uma aplicação só) |

- **Armadilha.** Muita tag descreve o enredo, não a sessão. "party" tem 886 aplicações, mas os primeiros filmes são Superbad, Project X e Booksmart: filmes *sobre* festas. "group psychology" é 12 Angry Men; "friends" é Good Will Hunting. Também há tags de diário pessoal, como "seen 2022 with family" (72 aplicações de 2 usuários), que dizem com quem a pessoa viu, não se o filme funciona assim. O mapeamento de tags para "grupo/sozinho" tem que ser uma lista fechada, escrita à mão, não uma busca por palavra.

### MovieLens: tag genome

- **O que é.** Uma matriz densa: cada filme do genome tem um escore de relevância para cada tag. O README do `ml-latest` diz que o genome foi calculado "por um algoritmo de aprendizado de máquina sobre conteúdo dos usuários, incluindo tags, notas e reviews em texto" ([README do ml-latest](https://files.grouplens.org/datasets/movielens/ml-latest-README.html)). No `ml-latest` atual, o `genome-tags.csv` tem 1.128 tags (contei). O Tag Genome 2021 tem 1.084 tags, 9.734 filmes e 10,5 milhões de escores ([página do Tag Genome 2021](https://grouplens.org/datasets/movielens/tag-genome-2021/)).
- **Como foi feito.** Vig et al. (2012) coletaram metadados, reviews do IMDb, notas, tags do MovieLens e um questionário em que usuários diziam, de 1 a 5, o quanto uma tag se aplica a um filme; uma regressão prevê o escore. Kotkov et al. (2021) refizeram com uma rede neural, o TagDL ([README do Tag Genome 2021](https://files.grouplens.org/datasets/tag-genome-2021/genome_2021_readme.txt)). Uma das features é a frequência da tag no texto das reviews do IMDb do filme (`log_IMDB`, mesmo README). Ou seja, o genome já é, em parte, um sinal extraído de reviews.
- **Tags úteis no genome** (todas existem no `genome-tags.csv` atual). Lado "grupo": `fun movie`, `funny`, `hilarious`, `highly quotable`, `quotable`, `so bad it's good`, `so bad it's funny`, `cult classic`, `campy`, `cheesy`, `silly fun`, `dumb but funny`, `fast paced`, `feel-good`, `feel good movie`, `kids and family`, `good romantic comedies`. Lado "sozinho": `slow`, `slow paced`, `meditative`, `atmospheric`, `thought-provoking`, `depressing`, `disturbing`, `hard to watch`, `bleak`. O genome não tem nenhuma tag do tipo "watch with friends".
- **Licença.** O Tag Genome 2021 é CC BY-NC 3.0 (mesmo README). O genome dentro do `ml-latest` segue a licença do `ml-latest`.
- **Limite.** Só cobre filmes com dados suficientes (9.734 no 2021). Filme recente ou obscuro fica sem escore. O escore é previsão de modelo, então a força dele é menor que a de uma contagem de tags.
- **Não verifiquei.** Não consegui baixar o `genome-scores.csv` (o DNS de files.grouplens.org falhou várias vezes no dia). Os exemplos abaixo que usam escore do genome são modelo, não dado real.

### Tag Genome 2021: reviews do IMDb em texto

- **O que tem.** O `raw/reviews.json` traz 2.624.608 reviews coletadas do IMDb, de 52.081 filmes, com só dois campos: `item_id` e `txt` ([README do Tag Genome 2021](https://files.grouplens.org/datasets/tag-genome-2021/genome_2021_readme.txt)). Não tem data nem autor da review.
- **Acesso e licença.** Zip de 1,8 GB, CC BY-NC 3.0 ([página do dataset](https://grouplens.org/datasets/movielens/tag-genome-2021/)). É o único corpus de review que achei com licença que permite baixar e processar o texto.
- **Sinal.** Busca por frases explícitas ("watch with friends", "watch it alone", "date night", "drinking game", "with the family"). Não medi a taxa de acerto; antes de entrar no motor, alguém precisa rodar a busca e ler uma amostra.
- **Data da evidência.** Como a review não tem data, a linha de evidência usa a data do dataset (dezembro de 2021, segundo a página).

### TMDB: reviews

- **Acesso.** `GET /3/movie/{movie_id}/reviews`, paginado, com `language` (padrão `en-US`). Cada review traz `author`, `author_details.rating`, `content`, `created_at`, `updated_at` e `url` ([referência da API](https://developer.themoviedb.org/reference/movie-reviews)).
- **Volume.** Pouco. Superbad, um filme de grupo por excelência, tem 3 reviews em inglês e nenhuma em português na página do TMDB, e nenhuma das três fala de ver com amigos ([reviews de Superbad](https://www.themoviedb.org/movie/8363-superbad/reviews?language=en-US), consultado em 2026-11-20). Uma amostra de um filme só não mede o catálogo, mas bate com o que se vê em geral.
- **Licença.** Os termos (atualizados em 2023-10-20) proíbem uso comercial, cache por mais de 6 meses, e, na seção 1.C, usar "the TMDB APIs or TMDB Content in connection with, including for training, a machine learning (ML) or artificial intelligence (AI) based Application". A seção 2.A ainda classifica como uso comercial o uso em "interactive query-response system (including large language model (LLM) ...)" ([termos da API do TMDB](https://www.themoviedb.org/api-terms-of-use)). Isto vale para todo o TMDB, não só para as reviews, e o projeto entrega o resultado pelo Claude. Ver "Névoa".
- **Veredito.** Fora da v1 para sinais de grupo. Pouco volume e risco de licença.

### Trakt: comentários, listas e notas

- **Comentários.** `GET /movies/{id}/comments/{sort}`, aceita ID do IMDb, paginado com 10 itens por padrão. Cada comentário traz `comment`, `spoiler`, `review` (comentários com 200 palavras ou mais viram review automaticamente), `created_at`, `likes` e `user_stats.rating` ([blueprint da API do Trakt](https://jsapi.apiary.io/apis/trakt.apib), seções "Comments" e "Movies > Comments"). Limite de 1.000 GETs a cada 5 minutos (mesma fonte, "Rate Limiting"). O próprio blueprint se declara obsoleto e aponta para developer.trakt.tv, que é uma página em JavaScript que não consegui ler; os campos podem ter mudado.
- **Listas.** `/search/list?query=` busca listas pelo nome, e `/movies/{id}/lists` mostra em que listas um filme está (mesmo blueprint, "Text Query" e "Movies > Lists"). Listas com nome tipo "movie night" ou "watch with friends" seriam um sinal explícito. Não testei: não tenho chave da API.
- **Notas privadas.** O Trakt aceita notas de até 500 caracteres presas a um item do histórico, visíveis só para o dono (mesmo blueprint, seção "Notes"). Se o dono escreve "com Ana e Leo" no histórico, isso é dado dele, não review.
- **Licença.** Os termos (atualizados em 2026-10-27) dão direito de uso "for your personal, non-commercial use" e dizem que os "Contents", incluindo "written comments" e "User Submissions", não podem ser copiados, reproduzidos ou usados em obra derivada sem permissão escrita do Trakt (seção 5) ([termos do Trakt](https://trakt.tv/terms)). Não achei termos próprios da API. Ler o histórico e as notas do próprio usuário é uso do serviço; guardar comentários de terceiros num banco é cópia.
- **Veredito.** Comentários de terceiros fora da v1. Notas e histórico do usuário entram junto com o import do Trakt, como nota própria.

### Letterboxd: export do usuário

- **Acesso.** Só o zip que o próprio usuário exporta. O importador oficial aceita as colunas `Rating`, `WatchedDate`, `Rewatch`, `Tags` e `Review` ([importação no Letterboxd](https://letterboxd.com/about/importing-data/)). Os cabeçalhos do export que encontrei em código de terceiros são `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date` para o `reviews.csv` (por exemplo, testes do repositório `mensola-app/api`, achados por busca de código no GitHub). Isto é fonte secundária; confirmar com um export real.
- **Sinal.** Tags que o usuário põe no diário ("with friends", "cinema", "date") e frases na review. É o sinal mais direto que existe, mas só fala da pessoa que exportou, e só se ela tem o hábito de marcar.
- **Licença.** É dado do próprio usuário, entregue por ele.
- **Tipo.** Na regra do projeto, isso não é `review`, é `nota própria` ou `nota de amigo`.

### IMDb

- **Datasets.** Os arquivos não comerciais (`title.basics`, `title.ratings` etc.) não têm reviews nem palavras-chave ([datasets do IMDb](https://data.imdb.com/non-commercial-datasets/)).
- **Site.** As condições de uso proíbem "data mining, robots, screen scraping, or similar data gathering and extraction tools" sem consentimento escrito ([condições do IMDb](https://www.imdb.com/conditions)).
- **Veredito.** Nada direto. As reviews do IMDb só entram pelo corpus do Tag Genome 2021.

### Datasets acadêmicos de contexto social

- **LDOS-CoMoDa.** É o único dataset de filmes que achei com a companhia anotada por avaliação: a variável `social` tem os valores Alone, My partner, Friends, Colleagues, Parents, Public e My family ([wiki RecSys](https://wiki.recsys.hosting.acm.org/wiki/LDOS_Comoda)). É pequeno: 1.665 avaliações de 961 filmes por 95 usuários ([Nefzi, 2018, tabela 4.1](https://arxiv.org/abs/1810.10038)). O acesso é por e-mail ao autor, sem licença publicada ([página do LDOS-CoMoDa](https://www.lucami.org/en/research/ldos-comoda-dataset/)). Não cobre o catálogo; serviria, no máximo, para checar se o mapeamento de tags acerta.
- **Método análogo.** Hariri, Mobasher, Burke e Zheng (2011) treinaram um classificador de contexto com reviews do TripAdvisor rotuladas por tipo de viagem (família, casal, sozinho, negócios, amigos) e usaram a saída como escore de adequação ao contexto ([ITWP 2011](https://ls13-www.cs.tu-dortmund.de/homepage/itwp2011/papers/ITWP-HMBZ.pdf)). Para filmes falta justamente o rótulo; o TripAdvisor pede o tipo de viagem na review, e nenhuma fonte de filmes pede a companhia.

## Como o sinal vira evidência

A linha de evidência registra o fato que a fonte afirma (a tag, a contagem, a data). A leitura "isso indica grupo" vem de uma tabela de mapeamento versionada no repositório; a explicação do LLM pode citar as duas, mas a linha de fato não deve dizer "bom em grupo" como se a fonte dissesse.

Exemplos com dados reais do `tags.csv`:

```
Evidência: 71 usuários do MovieLens marcaram The Room (2003) como "so bad it's good" (última em 2022-08-11) · Fonte: MovieLens ml-latest tags.csv, gerado em 2023-07-20 · Força: moderada · Tipo: review
Evidência: 204 usuários do MovieLens marcaram Amélie (2001) como "feel-good" (última em 2023-04-24) · Fonte: MovieLens ml-latest tags.csv, gerado em 2023-07-20 · Força: moderada · Tipo: review
Evidência: 65 usuários do MovieLens marcaram 2001: A Space Odyssey (1968) como "meditative" (última em 2023-06-14) · Fonte: MovieLens ml-latest tags.csv, gerado em 2023-07-20 · Força: moderada · Tipo: review
Evidência: 13 usuários do MovieLens marcaram 50 First Dates (2004) como "date movie" (última em 2023-06-25) · Fonte: MovieLens ml-latest tags.csv, gerado em 2023-07-20 · Força: moderada · Tipo: review
```

Modelos sem dado real (genome e Letterboxd):

```
Evidência: escore 0,<xx> da tag "highly quotable" para <filme> no tag genome · Fonte: MovieLens ml-latest genome-scores.csv, gerado em 2023-07-20 · Força: fraca · Tipo: review
Evidência: Ana marcou <filme> com a tag "with friends" no diário em <data> · Fonte: export Letterboxd de Ana, importado em <data> · Força: forte · Tipo: nota de amigo
Evidência: <n> reviews do IMDb de <filme> contêm "watch with friends" · Fonte: Tag Genome 2021 reviews.json, publicado em 2021-12 · Força: fraca · Tipo: review
```

As forças acima são sugestão. Quem decide é o ticket de critérios de Força. Duas observações para ele: uma contagem de tags com muitos usuários distintos vale mais que um escore previsto; e uma tag aplicada por 2 usuários não deve virar evidência sozinha (precisa de um piso).

## Recomendação para a v1

1. **Tags do MovieLens** (`tags.csv`, contagem por filme e por usuário distinto), com uma tabela de mapeamento escrita à mão: tag, eixo (grupo ou sozinho), peso. Começa com as tags da tabela acima. Fixar a versão do zip.
2. **Tag genome** do mesmo zip, para cobrir filmes que têm poucas tags livres, com força menor.
3. **Export do Letterboxd e notas do Trakt** de quem está na sessão: tags e texto de review, como `nota própria` ou `nota de amigo`.
4. **Histórico de sessões** do projeto. É o único sinal que mede o que interessa (este grupo gostou deste filme junto) e deve pesar mais que os outros quando existir.

Depois da v1, se o eixo grupo/sozinho estiver fraco: rodar a busca de frases no `reviews.json` do Tag Genome 2021 e medir quantos filmes ganham sinal.

Fora: reviews do TMDB, comentários de terceiros do Trakt, scraping do IMDb, LDOS-CoMoDa como fonte de produção.

## Névoa que a pesquisa levantou

- **A cláusula de IA do TMDB atinge o projeto inteiro.** Os termos proíbem usar conteúdo do TMDB "in connection with" uma aplicação baseada em IA, e o projeto responde pelo Claude. A decisão de partida lista o TMDB como fonte da v1. Precisa de decisão: aceitar o risco para uso pessoal, pedir permissão ao TMDB, ou trocar o TMDB por Wikidata e MovieLens onde der.
- **"Research purposes" do MovieLens.** A licença do `ml-latest` fala em uso para pesquisa. Um recomendador pessoal não comercial provavelmente fica dentro do espírito, mas não da letra. O Tag Genome 2021 é CC BY-NC 3.0, mais claro.
- **Cobertura.** O genome cobre cerca de 10 mil filmes. O plano B do catálogo e o tratamento de "sem dado" (filme recente sem sinal vira palpite?) precisam considerar isso.
