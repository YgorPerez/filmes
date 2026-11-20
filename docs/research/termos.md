# Termos de uso das fontes da v1 diante do uso com LLM

Ticket: [#11](https://github.com/YgorPerez/filmes/issues/11). Pesquisa feita em 2026-11-20. O TMDB ficou de fora porque a [pesquisa do catálogo](https://github.com/YgorPerez/filmes/blob/research/catalogo/docs/research/catalogo.md#termos-de-uso) já leu os termos dele.

Isto não é parecer jurídico. Cada tabela diz o que o texto diz e onde ele não decide. O uso avaliado é sempre o mesmo: pessoal, não comercial, dados num SQLite local, entregues ao Claude via MCP para redigir recomendações ao dono e aos amigos dele.

## Resposta curta

Só duas fontes falam de LLM com todas as letras. O TMDB proíbe uso "em conexão com" IA, e o Letterboxd fecha a API para "LLM or GPT-related use" e para projetos pessoais. As outras não citam LLM. Três delas (IMDb, Trakt, MovieLens) deixam o caso de pé. O Does the Dog Die e o OMDb deixam, mas com amarras que mudam o desenho.

- **IMDb (datasets):** cabe. Uso pessoal com banco local está na exceção escrita. Mostrar aos amigos é zona cinzenta. A frase de atribuição é obrigatória.
- **Trakt:** cabe, e é a fonte com o texto mais favorável. A política da API cita recomendação personalizada, ferramenta pessoal e cache. Proíbe espelhar o catálogo e repassar dados como dataset a outros serviços.
- **MovieLens:** `ml-latest` e `ml-32m` autorizam só "research purposes", e o texto não diz se um recomendador pessoal conta. A Tag Genome 2021 está em CC BY-NC 3.0, sem essa restrição.
- **Does the Dog Die:** o plano gratuito aceita uso não comercial, mas proíbe baixar a base em massa e manter cópia persistente. O cache tem de ser renovado a cada 30 dias. Os Termos de Uso, que a API incorpora, restringem o serviço a quem mora nos EUA.
- **OMDb:** permite uso pessoal não comercial, mas proíbe indexar e arquivar. Só serve sob demanda. As notas de RT e Metacritic que ele repassa não têm licença própria no texto.
- **Letterboxd:** API fora. Só o export do próprio membro.

## Does the Dog Die

Fontes: [API Terms of Service](https://www.doesthedogdie.com/api/terms), "Version 1.0 · Effective August 7, 2026"; [Terms of Use](https://www.doesthedogdie.com/terms), "Last Modified: August 7, 2026"; [página da API](https://www.doesthedogdie.com/api) com os planos. O site devolveu 403 a acesso automatizado (só `/privacy` respondeu 200), então li as cópias do Wayback Machine de [2026-11-15](https://web.archive.org/web/20261115210859/https://www.doesthedogdie.com/api/terms), [2026-10-01](https://web.archive.org/web/20261001225231/https://www.doesthedogdie.com/terms) e [2026-11-16](https://web.archive.org/web/20261116010849/https://www.doesthedogdie.com/api). A [Privacy Policy](https://www.doesthedogdie.com/privacy) ao vivo traz a mesma data (7/8/2026), o que indica que as cópias estão em dia.

| | O que o texto diz | Cláusula |
|---|---|---|
| Permitido | Plano gratuito sem custo, desde que o app não cobre do usuário, não tenha receita de anúncio, patrocínio, afiliado ou venda de dados e não opere "for the benefit of a for-profit business" | API ToS §9.1 |
| Permitido | Exibir os dados aos End Users dentro do app ("except as displayed to End Users within your Application in the ordinary course of its function") | API ToS §3 |
| Permitido | Cache local "solely to improve performance", renovado "at least every 30 days" | API ToS §3, último item |
| Proibido | "systematically download, harvest, index, or extract the Data or any substantial portion of it" e usar automação "designed to reconstruct the Data set" | API ToS §3 |
| Proibido | "build or maintain a persistent copy of the Data as a substitute for querying the API" | API ToS §3 |
| Proibido | Usar a API para "train, fine-tune, validate, benchmark, evaluate, test, or otherwise develop, improve, or refine any machine learning model, neural network, classifier, automated detection system, or other algorithmic system" | API ToS §3; ML training rights só no Enterprise (§9.3) |
| Proibido | "modify the Data in a way that materially changes its meaning" e "misrepresent the source, accuracy, or completeness of the Data" | API ToS §3 |
| Proibido | Apresentar os dados como completos, verificados ou próprios para fins de segurança | API ToS §13.3 |
| Obrigatório | "Powered by DoesTheDogDie.com", visível, com link quando o meio permitir | API ToS §6 |
| Obrigatório | Política de privacidade pública do app | API ToS §2.4(b) |
| Limite | Plano gratuito: 30 req/min e 5.000 req/mês | Página da API |
| Ambíguo | O LLM dentro do sistema. Nenhuma cláusula fala de LLM ou de mandar dados a um modelo de terceiros. Chegam perto: "combine or integrate the API with any software, technology, services, or materials not authorized by Company" e a proibição de "make the Data available to any third party as data". Mandar o dado ao Claude no prompt pode ser lido como integração não autorizada ou como exibição ao End User. O texto não decide | API ToS §3 |
| Ambíguo | O motor de recomendação é um "algorithmic system". Usar o dado como veto em tempo de execução não é treinar, mas a lista inclui "evaluate, test, or otherwise develop". Testar o recomendador com dados do DDD esbarra na letra | API ToS §3 |
| Ambíguo | A licença é "solely for your internal business purposes in developing your Applications". Não diz como isso se aplica a quem não tem negócio | API ToS §2.1 |
| Ambíguo | Residência. Os Termos de Uso dizem que o serviço é "offered and available to users who are 13 years of age or older and reside in the United States". A API ToS incorpora os Termos de Uso no preâmbulo e no §18.1. O texto não diz se a restrição vale para chaves de API | Terms of Use §1 |
| Ambíguo | O LLM reescreve o dado ao redigir. Uma paráfrase que troque "sim, o cachorro morre" por "talvez" já "materially changes its meaning". A regra pede que a evidência cite o dado sem reinterpretar | API ToS §3, §13.3 |

Os Termos de Uso também proíbem usar o serviço "to build, train, or improve any competing product, dataset, or machine learning model" e usar "any robot, spider, or other automatic device" no site (Terms of Use §2). Nada disso alcança a API, que tem termos próprios. Alcança a raspagem do site.

## IMDb

Fontes: [Conditions of Use](https://www.imdb.com/conditions); [Can I use IMDb data in my software?](https://help.imdb.com/article/imdb/general-information/can-i-use-imdb-data-in-my-software/G5JTRESSHJBBHTGX) (a página "Non-Commercial Licensing"); [IMDb Non-Commercial Datasets](https://data.imdb.com/non-commercial-datasets/) e o índice em [datasets.imdbws.com](https://datasets.imdbws.com/). Nenhuma das três páginas tem data de versão. Li em 2026-11-20. A página dos datasets só registra a troca de fonte de dados de 18/3/2024.

| | O que o texto diz | Fonte |
|---|---|---|
| Permitido | "Subsets of IMDb data are available for access to customers for personal and non-commercial use. You can hold local copies of this data" | Página dos datasets |
| Permitido | Não pode virar base de filmes "except for individual personal use". Um SQLite local do dono cabe nessa exceção | Ajuda, item 3 |
| Proibido | Tirar dado de outro lugar que não os datasets: "You may not use data mining, robots, screen scraping [...] on our website. If the information/data you want is not present in our datasets, it means it's not available for non-commercial usage" | Ajuda, item 2; Conditions of Use, "Robots and Screen Scraping" |
| Proibido | Uso comercial e "any derivative use of this site or its contents" | Conditions of Use, "License and Site Access" |
| Obrigatório | "Information courtesy of IMDb (https://www.imdb.com). Used with permission." | Ajuda |
| Obrigatório | Aceitar as Conditions of Use. O IMDb "reserves the right to withdraw permission to use the data at any time" | Ajuda, item 1 |
| Sem cláusula | As Conditions of Use não falam de IA, LLM ou aprendizado de máquina. O único "generative AI" do texto proíbe postar no IMDb reviews geradas por IA, o que não toca neste uso | Conditions of Use, "Reviews, Comments..." |
| Ambíguo | Amigos. A exceção diz "individual personal use". O texto não diz se mostrar a amigos na sessão uma recomendação que cita nota e créditos do IMDb ainda é uso individual. O banco não sai da máquina do dono | Ajuda, item 3 |
| Ambíguo | Mandar linhas do dataset ao Claude a cada consulta. Não é republicar nem revender, mas o dado sai da máquina para um serviço de terceiro. Nada no texto trata disso | |
| Ambíguo | A ajuda manda seguir "the copyright/license information enclosed in each file". Os TSVs não trazem licença nenhuma. A primeira linha de `title.ratings.tsv.gz` é só o cabeçalho `tconst averageRating numVotes` | Ajuda, item 3 |

## MovieLens (GroupLens)

Fontes: [README do ml-latest](https://files.grouplens.org/datasets/movielens/ml-latest-README.html) (dataset "generated on July 20, 2023"); [README do ml-32m](https://files.grouplens.org/datasets/movielens/ml-32m-README.html) ("generated on October 13, 2023"); [README da Tag Genome 2021](https://files.grouplens.org/datasets/tag-genome-2021/genome_2021_readme.txt) (`Last-Modified` de 30/12/2021); [CC BY-NC 3.0 Unported](https://creativecommons.org/licenses/by-nc/3.0/legalcode). Os dois READMEs do MovieLens têm a mesma "Usage License", palavra por palavra.

### ml-latest e ml-32m

| | O que o texto diz | Cláusula |
|---|---|---|
| Permitido | "The data set may be used for any research purposes under the following conditions" | Usage License, abertura |
| Permitido | Redistribuir, inclusive transformado, "so long as it is distributed under these same license conditions" | Usage License, item 3 |
| Proibido | "any commercial or revenue-bearing purposes without first obtaining permission from a faculty member of the GroupLens Research Project" | Usage License, item 4 |
| Proibido | Insinuar endosso da Universidade de Minnesota ou do GroupLens | Usage License, item 1 |
| Obrigatório | Citar Harper e Konstan (2015) "in publications resulting from the use of the data set". Sem publicação, não há o que citar | Usage License, item 2 |
| Sem cláusula | Nada sobre IA, LLM ou terceiros processando o dado | |
| Ambíguo | "Research purposes". A licença autoriza pesquisa e proíbe uso comercial, sem dizer nada do que fica no meio. Um recomendador pessoal para o dono e amigos não é comercial. O texto não diz se é pesquisa | Usage License, abertura |
| Ambíguo | O `ml-latest` se diz "a development dataset" que "may change over time and is not an appropriate dataset for shared research results". Isso é aviso de reprodutibilidade, não restrição de uso, mas reforça fixar a versão no banco (o mapa já anota isso) | Summary |

O `ml-latest` inclui `genome-scores.csv` e `genome-tags.csv`. Essas cópias seguem a licença do README do `ml-latest`, não a CC BY-NC da Tag Genome 2021.

### Tag Genome 2021

| | O que o texto diz | Cláusula |
|---|---|---|
| Permitido | "This work is licensed under the Creative Commons Attribution-NonCommercial 3.0 License." Não há a condição de pesquisa | README, "Usage License" |
| Proibido | Exercer os direitos "in any manner that is primarily intended for or directed toward commercial advantage or private monetary compensation" | CC BY-NC 3.0 §4(b) |
| Obrigatório | Atribuição ao distribuir ou exibir publicamente (CC §4(c)). O README pede citar Kotkov et al. (2021) e Vig et al. (2012) em publicações | CC §4(c); README, "Citation" |
| Sem cláusula | A CC não fala de IA nem limita o que se faz com a cópia de uso próprio | |
| Ambíguo | Pouco. O uso aqui é não comercial e não é distribuição pública. Se as recomendações mostradas aos amigos contarem como "exibir" a obra, vale a atribuição, que custa uma linha | |

## Trakt

Fontes: [API Use Policy](https://developer.trakt.tv/docs/api-use-policy), `updatedAt: 2026-10-20`; [Create an App](https://developer.trakt.tv/docs/create-an-app), `updatedAt: 2026-11-17`; [Terms of Use](https://app.trakt.tv/terms), "Last Updated — October 27, 2026". O portal do desenvolvedor é uma SPA. Li o texto das duas páginas no bundle JavaScript servido em 2026-11-20 (`/src/lib/guides/api-use-policy.md` e `create-an-app.md`). A URL antiga `trakt.tv/terms/api` devolve 404.

| | O que o texto diz | Cláusula |
|---|---|---|
| Permitido | "A personal or self-hosted tool that syncs a user's media server activity with their own Trakt account" e "The same usage rules apply to personal tools and widely used apps" | Policy, "What is permitted?" |
| Permitido | "You may use related titles and other permitted API results to support recommendations within your app, including personalized recommendations based on titles a user follows or enjoys" | Policy, "Discovery, recommendations, and combined scores" |
| Permitido | Combinar notas do Trakt com outras fontes num score próprio, nomeando as fontes e rotulando como score do app | Mesma seção |
| Permitido | Cache "on users' devices or on a backend", "no fixed maximum cache duration or required refresh interval" | Policy, "Caching and images" |
| Permitido | Uso gratuito: "Standard API access is free for commercial and noncommercial use" | Policy, "Standard and Premium access" |
| Proibido | "Scraping, bulk harvesting, or mirroring Trakt data to build a reusable copy of its catalog, community activity, ratings, or lists" | Policy, "What is not permitted?" |
| Proibido | "Redistributing Trakt data as a feed or dataset that other services use to populate their own catalogs, rankings, recommendations, or data products" | Mesma seção |
| Proibido | Continuar usando metadado de catálogo vindo do Trakt depois que a integração acaba. A regra não vale para o histórico, notas e listas do próprio usuário | Policy, "Caching and images" |
| Obrigatório | "[App name] uses Trakt but is not endorsed or certified by Trakt" numa página de About ou no README | Policy, "Follow Trakt's terms..."; Create an App |
| Obrigatório | OAuth do usuário antes de ler dado protegido da conta, e guardar só o que a função escolhida precisa | Policy, "Respect users and their data" |
| Operacional | App em Development aceita o dono e "up to 16 people you invite". Apps "for yourself or a few people stay on Development". App sem uso por 30 dias seguidos é apagado | Create an App; Policy, "Keep your app active" |
| Sem cláusula | Nada sobre IA, LLM ou aprendizado de máquina | |
| Ambíguo | Mandar dados ao Claude. A proibição mira "supplying feeds or datasets to other services" para "their own use" (catálogos, rankings, produtos de dados). O Claude recebe trechos para redigir a resposta deste app, não para alimentar produto próprio. A política não trata do caso | Policy, "What is not permitted?" |
| Ambíguo | Os Terms of Use do site dizem "You do not have permission to copy, reproduce, [...] download [...] any of the Contents without the prior written permission of Trakt". A política da API diz que cobre o uso pela API e deixa os Terms of Use para "Trakt's user-facing services". Os dois textos não se referem um ao outro de modo a dizer qual prevalece | Terms of Use, "Contents"; Policy |
| Ambíguo | Dados de amigos. A política fala em "user authorization". Cada amigo teria de autorizar via OAuth ou entregar o próprio export. Ler o perfil público de um amigo sem autorização não aparece nem como permitido nem como proibido | Policy, "Respect users and their data"; "Imports, exports, and sync" |

## OMDb

Fontes: [Terms of Use](https://www.omdbapi.com/legal.htm), "This Agreement was last updated on: March 12, 2015"; [página inicial](https://www.omdbapi.com/) e [página da chave](https://www.omdbapi.com/apikey.aspx) (plano FREE com "1,000 daily limit"). Os termos não têm seção sobre a API. Tratam o conteúdo todo como "Contributions" de usuários.

| | O que o texto diz | Cláusula |
|---|---|---|
| Permitido | "We grant you a non-exclusive license to use and copy other users' Contributions solely for personal, non-commercial purposes" | §4.1 |
| Proibido | "copy, download, reproduce, duplicate, archive, distribute [...] Contributions except as permitted in Section 4.1" | §4.2.3 |
| Proibido | "you may not create, recreate, distribute or advertise an index of any Contributions unless authorized by us in writing" | §4.2.4 |
| Proibido | "You may not build a business utilizing the Contributions, whether or not for profit" | §4.2.5 |
| Proibido | "creating derivative works [...] derived from or based on Contributions in any way", com exemplos como montagens e papéis de parede, "even if you intend to give away the derivative materials free of charge" | §4.2.6 |
| Proibido | Uso "in connection with any commercial endeavors" | §10 |
| Sem cláusula | Nada sobre IA ou LLM. Não há exigência de atribuição | |
| Ambíguo | Guardar notas de RT e Metacritic num SQLite. §4.1 permite copiar para uso pessoal, §4.2.3 proíbe "archive" fora de §4.1, e §4.2.4 proíbe criar "an index". O texto não diz onde um cache local de um filme por vez vira índice | §4.1, §4.2.3, §4.2.4 |
| Ambíguo | Uma recomendação redigida pelo LLM que cita a nota do RT pode ser lida como "derivative work [...] based on Contributions". Os exemplos de §4.2.6 são todos produtos visuais | §4.2.6 |
| Ambíguo | O site diz que "all content and images on the site are contributed and maintained by our users". As notas de RT e Metacritic no campo `Ratings` vêm dessas empresas, e os termos do OMDb não dizem que licença repassam sobre elas | Página inicial |

## API do Letterboxd

Fontes: [API Access](https://letterboxd.com/api-beta/), sem data na página, lida nas capturas do Wayback de [2026-11-17](https://web.archive.org/web/20261117124705/https://letterboxd.com/api-beta/) e 2026-11-20 porque o site devolve 403 a acesso automatizado; [Terms of Use](https://letterboxd.com/legal/terms-of-use/), "Last updated: October 2026". A documentação em `api-docs.letterboxd.com` também devolve 403.

| | O que o texto diz | Fonte |
|---|---|---|
| Proibido (na prática) | "Access to the Letterboxd API is available by request only. [...] At this time we are not granting access for data-analysis, visualization or recommendation projects, for LLM or GPT-related use, for private or personal projects" | API Access |
| Permitido | "If you require your account data in a machine-readable format, we provide import and export facilities, and every member profile has an RSS feed of new diary entries, reviews and lists" | API Access |
| Proibido | "You must not export any content from the Service (except your own Posted Content) unless expressly permitted by us" | Terms of Use |
| Proibido | "robot, spider, scraper, deep-link, or other automated data gathering or extraction tool" | Terms of Use |
| Ambíguo | O RSS. A página o oferece a quem quer o próprio dado em formato legível por máquina. Ler o RSS do perfil de um amigo com um script é automação e esbarra na cláusula de robôs. O texto não reconcilia as duas coisas | API Access; Terms of Use |
| Ambíguo | O export de um amigo entregue ao dono. Cada amigo exporta o "own Posted Content", o que é permitido. Os termos não dizem nada sobre o que o membro faz com a própria cópia, inclusive entregá-la a outra pessoa e a um LLM | Terms of Use |

A recusa da API acerta o projeto em três pontos de uma vez: recomendação, LLM e projeto pessoal. Mesmo que o pedido fosse aceito, o uso não caberia na política publicada.

## Quadro-resumo para o grilling

| Fonte | Menção a LLM/IA | Opções |
|---|---|---|
| TMDB | Proíbe uso "em conexão com" IA e trata chatbot de LLM como uso comercial ([catálogo](https://github.com/YgorPerez/filmes/blob/research/catalogo/docs/research/catalogo.md#termos-de-uso)) | (a) fora; (b) sob demanda, aceitando o risco; (c) pedir permissão por escrito |
| IMDb datasets | Nenhuma | (a) entra como está, com a frase de atribuição e o banco só na máquina do dono; (b) entra, mas o que o Claude recebe é limitado aos campos da evidência (nota, votos, créditos do candidato), não linhas brutas em massa |
| MovieLens `ml-32m`/`ml-latest` | Nenhuma | (a) usar, tratando o projeto como pesquisa pessoal; (b) pedir por email a confirmação do GroupLens (`grouplens-info@umn.edu`); (c) fixar o `ml-32m` (versão estável) em vez do `ml-latest` |
| Tag Genome 2021 | Nenhuma | Entra. CC BY-NC 3.0, sem condição de pesquisa. Atribuição numa linha |
| Does the Dog Die | Nenhuma explícita; cláusulas largas sobre integração com serviço não autorizado e sobre "algorithmic system" | (a) plano gratuito, só para os candidatos da sessão, cache de até 30 dias, "Powered by DoesTheDogDie.com" e texto literal do dado na evidência; (b) escrever ao DDD (endereço na página da API) perguntando sobre LLM e residência fora dos EUA antes de construir; (c) fora na v1, com gatilhos vindo só do que as pessoas declaram |
| Trakt | Nenhuma | (a) entra via OAuth de cada pessoa ou export dela, app em Development, aviso "uses Trakt but is not endorsed"; (b) só export, sem chave de API |
| OMDb | Nenhuma | (a) sob demanda, só para os candidatos, sem guardar a nota no SQLite; (b) com cache curto, aceitando a ambiguidade de "index"; (c) fora, e a v1 fica sem RT e Metacritic |
| Letterboxd | API recusa "LLM or GPT-related use" e projetos pessoais | Só o export CSV de cada membro, como o mapa já decidiu. Fica para decidir se o RSS de amigos entra |
| Wikidata | CC0 ([Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)) | Entra sem condição |

O padrão que atravessa as fontes: nenhuma proíbe que o dono olhe o dado. As restrições caem sobre baixar em massa (DDD, OMDb, Trakt), guardar cópia persistente (DDD, OMDb), mandar dado a terceiros (DDD, Trakt de leve) e IA (TMDB, Letterboxd). Um desenho que busca DDD e OMDb só para os candidatos e manda ao Claude só as linhas de evidência reduz quase todos os pontos ambíguos.

## Lacunas

- Não li o Pricing Page nem a documentação v3 da API do DDD. Os números de limite vêm da página da API.
- O DDD só foi lido pelo Wayback. A data das cópias bate com a da Privacy Policy ao vivo, mas não confirmei os termos no site.
- O Letterboxd e a documentação da API dele foram lidos pelo Wayback pelo mesmo motivo.
- Não li os termos da Anthropic sobre o que acontece com os dados que entram no contexto do Claude. Isso pesa na leitura de "make the Data available to any third party" do DDD.
- Não perguntei nada a nenhuma das fontes. As opções "pedir permissão" dependem de resposta que pode não vir.
