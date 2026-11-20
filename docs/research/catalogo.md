# Viabilidade do catálogo completo

Ticket: [#2](https://github.com/YgorPerez/filmes/issues/2). Pesquisa feita em 2026-11-20.

## Resposta curta

Volume e tempo não são o problema. Medi aqui: todos os 752 mil filmes do IMDb com notas e créditos, mais 3,3 milhões de arestas do Wikidata, cabem num SQLite de uns 830 MB e entram em cerca de 5 minutos, contando o download. O problema é a licença do TMDB. Os termos proíbem usar o conteúdo "em conexão com" uma aplicação baseada em IA e chamam de uso comercial qualquer chatbot de LLM. O projeto é exatamente isso.

Recomendo catálogo completo com Wikidata e IMDb, e o TMDB fora do caminho crítico até alguém decidir a questão da licença. O plano B (sob demanda + vizinhança no grafo) não se justifica por volume. Se for usado, que seja só para o TMDB.

## Quantos filmes cada fonte tem

| Fonte | Filmes | Como medi |
|---|---|---|
| TMDB | 1.278.958 IDs, dos quais 66.202 marcados `video:true` | Contei as linhas de `movie_ids_11_19_2026.json.gz` (export diário) |
| IMDb | 752.446 com `titleType=movie` e `isAdult=0`; 347.339 têm nota; 147.705 têm 100 votos ou mais; 49.551 têm 1.000 ou mais | Contei `title.basics.tsv.gz` e `title.ratings.tsv.gz` de 2026-11-20 |
| Wikidata | 358.545 itens com P31 = filme (Q11424) | SPARQL no WDQS; 291.393 itens têm ID do TMDB (P4947) e 280.229 filmes têm ID do IMDb (P345) |
| MovieLens 32M | 87.585 filmes, 32 milhões de notas, 200.948 usuários | [página do GroupLens](https://grouplens.org/datasets/movielens/) |

O número do TMDB é inflado. A popularidade cai rápido: só 45.343 filmes têm `popularity` ≥ 1 e 210.878 têm ≥ 0,5. O resto é cauda que ninguém do grupo vai assistir.

O Wikidata conta só instâncias diretas de Q11424. Subclasses (curta, animação etc.) ficaram de fora. Para recomendar, isso basta.

## O que cada fonte oferece sem API

**IMDb.** Sete TSVs gzip, atualizados todo dia ([datasets do IMDb](https://data.imdb.com/non-commercial-datasets/)). Os que importam: `title.basics` (231 MB), `title.ratings` (9 MB), `title.principals` (792 MB), `title.crew` (84 MB), `title.akas` (524 MB), `name.basics` (313 MB). Tamanhos tirados do `Content-Length` de `datasets.imdbws.com` em 2026-11-20. Baixar `principals` e `name.basics` levou 1m07s e 29s nesta máquina.

**Wikidata.** O dump completo é grande demais para o que precisamos. Em 2026-11-20, `latest-all.json.gz` tinha 157 GB e `latest-truthy.nt.gz` 72 GB ([índice de dumps](https://dumps.wikimedia.org/wikidatawiki/entities/), confirmado por `Content-Length`). Não há dump só de filmes. O caminho prático é SPARQL. Uma consulta só ao [QLever](https://qlever.dev/api/wikidata) devolveu em 71 segundos as 3.289.159 arestas dos 18 predicados que interessam (diretor, elenco, gênero, país, idioma, tema, baseado em, série, roteiro, música, fotografia, produção, estúdio, local da narrativa, prêmios, indicações, distribuidora, montagem). O WDQS oficial corta consultas em 60 segundos e limita cada cliente a 60 segundos de processamento por minuto ([manual do WDQS](https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual)). Ele dá conta de contagens e de lotes, não de uma exportação dessas numa consulta. O mesmo manual estima 12 dias para importar o dump inteiro num serviço próprio. Os dados são CC0 ([Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)).

Arestas por predicado (filmes Q11424, QLever, 2026-11-20): elenco P161 1.261.160; país P495 355.684; gênero P136 344.420; diretor P57 283.888; idioma P364 248.124; roteiro P58 165.922; música P86 102.643; produtor P162 100.146; fotografia P344 96.135; distribuidora P750 86.369; estúdio P272 66.268; local da narrativa P840 53.704; montagem P915 35.504; tema P921 31.559; indicações P1411 21.995; baseado em P144 15.750; prêmios P166 14.587; série P179 5.295.

Classificação ClassInd (P3216) existe em só 4.860 filmes. Para o veto de "tem criança na sala", isso é pouco.

**TMDB.** Só tem export diário de IDs. Os arquivos trazem `id`, `original_title`, `adult`, `video` e `popularity`, e a página diz que "não são, nem pretendem ser, exports completos" ([Daily ID exports](https://developer.themoviedb.org/docs/daily-id-exports)). Saem por volta das 8h UTC, ficam 3 meses no ar e hoje não pedem autenticação. Adultos vêm num arquivo separado. O de filmes tem 28 MB. Todo o resto (sinopse, créditos, palavras-chave, classificação por país) só sai pela API, um filme por chamada.

## Limites e tempo do TMDB pela API

O TMDB não publica um número fixo. A página de limites diz que o teto "fica na faixa de 40 requisições por segundo" e pode mudar a qualquer momento. O limite antigo de 40 a cada 10 segundos caiu em 16/12/2019 ([Rate limiting](https://developer.themoviedb.org/docs/rate-limiting)). `append_to_response` junta créditos, palavras-chave, IDs externos e datas de lançamento numa só chamada ([Append to response](https://developer.themoviedb.org/docs/append-to-response)). Essa página não diz se os anexos contam em dobro no limite.

Com uma chamada por filme:

| Recorte | Chamadas | A 40 req/s | A 20 req/s |
|---|---|---|---|
| Todos os IDs | 1.278.958 | 8,9 h | 17,8 h |
| `popularity` ≥ 0,5 | 210.878 | 1,5 h | 2,9 h |
| `popularity` ≥ 1 | 45.343 | 19 min | 38 min |

Atualização: o endpoint de mudanças aceita janelas de até 14 dias e devolve 100 IDs por página ([Changes](https://developer.themoviedb.org/reference/changes-movie-list)). Não medi quantos filmes mudam por dia porque não tenho chave da API.

Não medi o tamanho do TMDB no SQLite, pelo mesmo motivo.

## Tamanho medido em SQLite

Montei dois bancos de teste com os dados reais, em Python e `sqlite3`, sem compressão. Tabelas `WITHOUT ROWID` e um índice reverso em cada tabela de aresta.

| Parte | Linhas | Tamanho | Tempo de carga |
|---|---|---|---|
| IMDb: filme, nota, crédito (`principals` só de filmes), pessoa | 752.446 filmes, 347.339 notas, 8.680.884 créditos, 2.431.396 pessoas | 724 MB | 120 s |
| Wikidata: arestas filme–predicado–item, IDs numéricos | 3.288.783 arestas, 337.609 filmes, 369.537 alvos | 107 MB | 11 s |

Faltam os rótulos dos itens do Wikidata (uns 730 mil, em pt e en) e a tabela de ponte entre QID, tconst e ID do TMDB. Pelo tamanho das outras tabelas, devem somar dezenas de MB. Total esperado: perto de 0,9 GB. Se o crédito do IMDb ficar só nos filmes com 100 votos ou mais, cai bem abaixo disso.

Tempo de ingestão inicial: uns 2 minutos baixando o IMDb, 1 minuto na consulta do QLever e uns 2 minutos de carga. Rodar isso todo dia é viável.

## Termos de uso

**TMDB** ([API Terms of Use](https://www.themoviedb.org/api-terms-of-use), atualizados em 20/10/2023):

- §1.C proíbe guardar em cache qualquer informação do TMDB "por mais de 6 meses". Um catálogo TMDB completo teria de ser rebaixado pelo menos a cada 6 meses, 9 a 18 horas por vez.
- §1.A e §1.C proíbem usar a API ou o conteúdo "em conexão com, inclusive para treinar, uma aplicação baseada em aprendizado de máquina (ML) ou inteligência artificial (IA)".
- §2.A classifica como uso comercial o uso "em conexão com um sistema interativo de pergunta e resposta (incluindo modelos de linguagem (LLM), inteligência artificial ou qualquer outro sistema interativo baseado em aprendizado de máquina, ou chatbots)". Uso comercial só com contrato escrito.
- §3 exige o logo do TMDB e um aviso de que o app não é endossado por eles.

O desenho do projeto é um LLM (Claude) que lê evidências do banco e responde em conversa. Pela letra dos termos, colocar dados do TMDB nesse caminho cai em §1.C e §2.A, completo ou sob demanda. O plano B não resolve isso. Quem resolve é uma decisão sobre usar ou não o TMDB.

**IMDb** ([Can I use IMDb data in my software?](https://help.imdb.com/article/imdb/general-information/can-i-use-imdb-data-in-my-software/G5JTRESSHJBBHTGX)):

- Os dados só podem vir dos datasets publicados. Raspagem do site é proibida.
- O uso é só pessoal e não comercial. Os dados não podem ser "reaproveitados para criar qualquer tipo de base de dados de filmes online/offline (exceto para uso pessoal individual)". Um SQLite local do dono cabe na exceção. Mostrar as recomendações aos amigos na sessão é zona cinzenta, mas o banco não sai da máquina do dono.
- É obrigatório citar: "Information courtesy of IMDb (https://www.imdb.com). Used with permission."
- O IMDb pode retirar a permissão a qualquer momento.

Não li as condições gerais de uso do IMDb atrás de cláusulas sobre IA.

**Wikidata**: CC0, sem restrição.

## Recomendação

Catálogo completo, com duas fontes:

1. **Wikidata via SPARQL** para o grafo e a ponte de IDs. São 358 mil filmes e 3,3 milhões de arestas em 107 MB, puxados em cerca de 1 minuto. CC0. O dump completo fica de fora.
2. **Datasets do IMDb** para nota, votos, duração, gênero e créditos principais. São 752 mil filmes em 724 MB, com 2 minutos de carga e atualização diária.

O TMDB não entra no catálogo. Baixar tudo é tecnicamente possível (9 a 18 horas, e de novo a cada 6 meses), mas os termos vedam justamente o uso que o projeto faz, e isso pede uma decisão própria no mapa. Se a decisão for aceitar o risco, o TMDB entra sob demanda, só para os candidatos de cada sessão, com data de busca guardada para respeitar os 6 meses.

O plano B de vizinhança no grafo perde a razão de existir. Ele servia para economizar volume e tempo, e o banco completo sem o TMDB tem menos de 1 GB e é recarregado em minutos. Para cortar ruído na geração de candidatos, um filtro por votos no IMDb (100 ou mais votos deixa 147.705 filmes) é mais simples que vizinhança.

## Lacunas

- Tamanho por filme no TMDB e volume diário de mudanças: não medidos, falta chave da API.
- Condições gerais de uso do IMDb sobre IA: não lidas.
- O QLever é mantido pela Universidade de Freiburg, não pela Wikimedia. Não verifiquei de quando é o índice deles. Se ele sair do ar, a alternativa é fatiar a mesma consulta por predicado no WDQS, dentro do limite de 60 segundos.
- Os números de filmes do Wikidata não incluem subclasses de Q11424.
