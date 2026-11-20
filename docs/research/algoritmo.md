# Algoritmo candidato de recomendação

Ticket: [#5](https://github.com/YgorPerez/filmes/issues/5). Pesquisa feita em 2026-11-20. Os dados de repositório (licença, último commit, estrelas) vêm da API do GitHub nesse dia.

## Pergunta

Qual algoritmo gera os candidatos da v1, para uma pessoa e para um grupo, de modo que cada candidato venha com caminhos ou fatos que virem linha de evidência (`Evidência · Fonte · Força · Tipo`)? Critérios: explicabilidade por caminho, custo numa máquina local, amigo com poucas notas, agregação de grupo, licença e manutenção.

## Resposta curta

Para a v1, nada de modelo treinado de ponta a ponta. O que eu proponho tem três partes, todas determinísticas e rodando sobre o SQLite:

1. **Caminhos de conteúdo no grafo.** Para cada filme que a pessoa avaliou bem, percorrer arestas reais (mesmo diretor, mesmo ator, mesmo gênero, mesma palavra-chave do TMDB/Wikidata) até filmes não vistos e somar pesos por tipo de aresta. É o "weighted content algorithm" do exemplo da Neo4j, só que em SQL. Cada caminho já é a evidência: "Mesmo diretor de *Zodíaco*, que você deu 5 estrelas no Letterboxd em 2024-03-02".
2. **Vizinhança item-item do MovieLens.** Coavaliações agregadas do MovieLens ("de 3.100 pessoas que deram 4+ a *Zodíaco*, 62% deram 4+ a *Memórias de um Assassino*"). O lado do item é calculado uma vez, offline. Qualquer amigo com uma única nota já recebe candidatos, e o número vira uma linha de evidência com fonte e data do dataset.
3. **Agregação de grupo transparente.** Vetos antes, depois pontuação de cada membro por filme e a regra "média sem miséria" (ordena pela menor utilidade individual, desempata pela média), no formato do commonground: a nota de cada pessoa aparece e quem não tem dado conta como "desconhecido", não como "não gosta".

Fica para depois: PGPR/hopwise (caminhos aprendidos por RL), embeddings do pykeen, AGREE e GroupIM (exigem histórico de grupo que não temos) e o FAPE (pacotes justos, útil quando a justiça entre sessões existir).

## O que cada candidato oferece

### hopwise e PGPR: caminhos aprendidos sobre grafo de conhecimento

- **O que é.** O hopwise é uma extensão do RecBole para recomendação explicável por caminhos em grafos de conhecimento; implementa PGPR, CAFE, TPRec, PLM-Rec, PEARLM e KGGLM, além de métricas de qualidade de caminho ([README](https://github.com/tail-unica/hopwise/blob/main/README.md); artigo [Boratto et al., CIKM 2025, doi:10.1145/3746252.3761641](https://doi.org/10.1145/3746252.3761641)). O PGPR original treina um agente de RL que anda pelo grafo a partir do usuário e devolve "actual paths in a knowledge graph" ([Xian et al., SIGIR 2019, arXiv:1906.05237](https://arxiv.org/abs/1906.05237)).
- **O caminho vira evidência?** Em parte. Na busca em feixe do PGPR do hopwise, cada passo escolhe uma aresta que existe no grafo (`_get_actions` lê de `dataset.ckg_dict_graph()`), então o caminho é real ([pgpr.py](https://github.com/tail-unica/hopwise/blob/main/hopwise/model/knowledge_aware_recommender/pgpr.py), `beam_search`). Mas a ordem dos filmes não vem do caminho: `collect_scores` ordena pelo produto interno do TransE (`user_embedding + relation_embedding` contra `entity_embedding`) e só escolhe, por item, o caminho de maior probabilidade. O original faz o mesmo (`evaluate_paths` em [test_agent.py](https://github.com/orcax/PGPR/blob/master/test_agent.py), `scores = np.dot(user_embeds + purchase_embeds, product_embeds.T)`). O caminho justifica um item que o embedding escolheu. Para nós, isso fere a regra de que o motivo explica a escolha.
- **Um defeito que achei lendo o código** (não executei). Quando um usuário tem menos caminhos que `topk`, `collect_scores` completa a lista com itens pelo score do embedding, inverte `top_items` e `top_paths` e faz `zip` das duas listas, que têm tamanhos diferentes. Os itens de preenchimento ficam pareados com caminhos que terminam em outros filmes. Se um dia usarmos o hopwise, isso precisa de teste antes.
- **Modelos de linguagem de caminho** podem inventar caminhos. O artigo do PEARLM diz que arquiteturas anteriores geram "corrupted paths" que não correspondem a arestas reais e propõe decodificação restrita ao grafo para zerá-los ([Balloccu et al., arXiv:2310.16452](https://arxiv.org/abs/2310.16452)). Com nossa regra de verificação, qualquer caminho gerado teria de ser conferido contra o banco de qualquer jeito.
- **Custo local.** PGPR exige pré-treino do TransE e depois treino do agente; o hopwise pede Python 3.10 a 3.13, `torch>=2.5`, `numba`, `wandb`, `tensorboard` ([pyproject.toml](https://github.com/tail-unica/hopwise/blob/main/pyproject.toml)). Roda em CPU, mas é treino de horas para um catálogo grande, e precisa refazer quando o grafo muda.
- **Amigo com poucas notas.** O modelo é transdutivo: o PGPR carrega `user_embedding` pré-treinado e o histórico (`history_item_matrix`) no construtor. Um amigo novo só entra depois de retreinar.
- **Grupo.** Nada.
- **Licença e manutenção.** hopwise: MIT, último commit 2026-11-07, 18 estrelas, release v0.9.1 de 2025-07-07. PGPR original: sem arquivo de licença (logo, todos os direitos reservados), último commit 2019-11-01, PyTorch 1.0, dados só da Amazon ([README](https://github.com/orcax/PGPR/blob/master/README.md)).

### RecBole: filtragem colaborativa clássica

- **O que é.** Biblioteca com 94 algoritmos ([README](https://github.com/RUCAIBox/RecBole/blob/master/README.md)). Entre os gerais estão `itemknn.py`, `ease.py`, `slimelastic.py`, `lightgcn.py`, `bpr.py`.
- **O caminho vira evidência?** Só no ItemKNN, e aí a evidência é "pessoas que gostaram de X gostaram de Y", que podemos calcular sem a biblioteca. EASE, BPR e LightGCN dão um número sem caminho.
- **Custo local.** O benchmark do próprio RecBole no MovieLens-1M (6.034 usuários, 3.124 filmes) mostra ItemKNN com 1,56 s por época de treino e EASE com 1,65 s, ambos sem GPU ([General_recommendation.md](https://github.com/RUCAIBox/RecBole/blob/master/asset/time_test_result/General_recommendation.md)). Barato. O MovieLens-32M tem 87.585 filmes ([README do ml-32m](https://files.grouplens.org/datasets/movielens/ml-32m-README.html)), então a matriz item-item precisa ser esparsa (top-k vizinhos por filme), mas cabe numa máquina comum.
- **Amigo com poucas notas.** Modelos item-item (ItemKNN, EASE, SLIM) pontuam qualquer vetor de notas sem retreinar. BPR e LightGCN precisam do usuário no treino.
- **Licença e manutenção.** MIT; último commit 2025-02-24 e release v1.2.1 de 2025-02-23. Parado há quase dois anos.

### letterboxd_recommendations: SVD com fold-in

- **O que é.** Raspa notas públicas do Letterboxd e treina um SVD (Surprise) sobre uma amostra de até ~5 milhões de notas ([README](https://github.com/sdl60660/letterboxd_recommendations/blob/main/README.md)).
- **Ideia que vale copiar.** O usuário novo entra por fold-in: `_fold_in_from_pairs` resolve uma regressão ridge sobre os fatores dos itens que ele avaliou e limita a norma do vetor, sem retreinar nada ([model.py](https://github.com/sdl60660/letterboxd_recommendations/blob/main/data_processing/model.py)). Com zero notas, o vetor é zero e sobra só o viés do item, ou seja, popularidade.
- **Limites que o autor admite.** O modelo "is completely blind to genres, themes, directors, cast" e tende a recomendar filmes populares ([README](https://github.com/sdl60660/letterboxd_recommendations/blob/main/README.md), Notes). Não há caminho: um fator latente não vira evidência.
- **Licença.** GPL-3.0. Copiar código obrigaria o projeto a ser GPL; reimplementar a ideia (é uma regressão ridge de dez linhas) não. Raspar o Letterboxd contraria nossa decisão de usar só o export CSV. Último commit 2026-08-15.

### pykeen: embeddings de grafo

- **O que é.** Biblioteca para treinar e avaliar embeddings de grafos de conhecimento, com dezenas de modelos e alguns indutivos (`InductiveNodePiece`) ([README](https://github.com/pykeen/pykeen/blob/master/README.md)).
- **O caminho vira evidência?** Não. A saída é um score de tripla (`pessoa gosta filme`), sem caminho. Serviria para sugerir candidatos que depois procuraríamos justificar no grafo, o mesmo problema do PGPR.
- **Custo e cold start.** Exige Python 3.11+ e treino em PyTorch. Os modelos transdutivos não aceitam entidade nova; os indutivos aceitam, mas são feitos para grafos inteiros novos e não foram testados em recomendação.
- **Licença e manutenção.** MIT, último commit 2026-11-13, release v1.11.1 de 2025-04-24. Bem mantido.

### neo4j-graph-examples/recommendations: consultas de caminho

- **O que é.** Guia com consultas Cypher sobre um grafo MovieLens com `ACTED_IN`, `IN_GENRE`, `DIRECTED` e `RATED` ([recommendations.adoc](https://github.com/neo4j-graph-examples/recommendations/blob/main/documentation/recommendations.adoc)).
- **O caminho vira evidência?** Sim, direto. A consulta "Weighted Content Algorithm" conta gêneros, atores e diretores em comum com pesos 5, 3 e 4. A consulta de CF conta quantos usuários avaliaram os dois filmes. Cada contagem é um fato que dá para citar. Não precisamos do Neo4j: são junções que o SQLite faz.
- **Grupo.** A seção "Group Recommender System" lista estratégias (pluralidade, média, multiplicativa, Borda, least misery, most pleasure), mas a consulta está marcada como "WIP".
- **Licença e manutenção.** Sem arquivo de licença no repositório; último commit 2026-04-20. Uso as consultas como referência de ideia, sem copiar.

### AGREE e GroupIM: agregação neural de grupo

- **AGREE** aprende por atenção o peso de cada membro ([README](https://github.com/LianHaiMiao/Attentive-Group-Recommendation/blob/master/README.md); Cao et al., SIGIR 2018, [doi:10.1145/3209978.3209998](https://doi.org/10.1145/3209978.3209998)). Treina com interações grupo-filme (CAMRa2011). Sem licença, último commit 2020-11-23, PyTorch 0.3/1.x e Python 3.5.
- **GroupIM** mira grupos "efêmeros", com pouca ou nenhuma história conjunta ([Sankar et al., SIGIR 2020, arXiv:2006.03736](https://arxiv.org/abs/2006.03736)), mas o treino ainda pede `train_gi.csv` com interações grupo-item e associação grupo-usuário ([README](https://github.com/CrowdDynamicsLab/GroupIM/blob/master/README.md)). BSD-3-Clause, último commit 2020-09-01, testado com PyTorch 1.1.
- **Para nós.** Teremos poucas dezenas de sessões, longe do volume que esses modelos precisam. E o peso de atenção de cada membro é exatamente o tipo de número que não vira evidência.

### commonground: grupo com consenso transparente

- **O que é.** Agente de noite de filmes feito para um hackathon: busca uma lista por pessoa (API Qloo), exclui os filmes-semente, ordena pela menor utilidade individual e compara com a ordem pela média ([README](https://github.com/aggravating08/commonground/blob/main/README.md)).
- **O que copiar.** A utilidade de quem não tem o filme na lista vale zero só na ordenação conservadora, porque "absence is unknown evidence, not proof of dislike". O README também diz que a normalização é uma escolha local e não calibrada entre pessoas. É o mesmo cuidado que nosso modelo de evidência pede.
- **Limites.** Depende da Qloo (API comercial com chave); README diz que a verificação com dados reais estava pendente. MIT, último commit 2026-10-30, zero estrelas. Ideia, não dependência.

### FAPE: pacotes justos

- **O que é.** Enumera todos os pacotes de itens que satisfazem proporcionalidade ou ausência de inveja para um grupo, a partir de uma matriz membros x itens ([README](https://github.com/joisino/fape/blob/main/README.md); Sato, WSDM 2022, [arXiv:2105.14423](https://arxiv.org/abs/2105.14423)). Avaliado no MovieLens.
- **Para nós.** Recomenda um conjunto, não um filme por noite. Pode servir à justiça entre sessões (tratar a sequência de sessões como pacote), quando esse modelo existir. Depende do `graphillion`. MIT, último commit 2021-12-28.

## Comparação

| Opção | Caminho vira evidência | Custo local | Amigo com poucas notas | Grupo | Licença e manutenção |
|---|---|---|---|---|---|
| Caminhos de conteúdo em SQL (ideia da Neo4j) | Sim, cada aresta é um fato com fonte | Consultas, sem treino | Funciona a partir de 1 nota ou de uma preferência declarada | Pontua por membro | Código nosso |
| Item-item do MovieLens (ItemKNN) | Sim, como contagem agregada com fonte e data | Pré-cálculo de minutos | Funciona a partir de 1 nota | Pontua por membro | MovieLens não comercial; código nosso ou RecBole (MIT, parado) |
| SVD com fold-in | Não | Treino curto, fold-in instantâneo | Funciona, cai em popularidade com 0 notas | Pontua por membro | Ideia livre; código GPL-3.0 |
| PGPR via hopwise | Caminho real, mas não é o que ordena | Treino TransE + RL, horas | Precisa retreinar | Nada | MIT, ativo, pequeno |
| pykeen | Não | Treino em PyTorch | Precisa retreinar (exceto indutivos) | Nada | MIT, ativo |
| AGREE / GroupIM | Não | Treino, código antigo | Precisa retreinar | Aprende pesos, exige histórico de grupo | Sem licença / BSD-3; parados |
| commonground | Mostra a nota de cada um | Trivial | Ausência tratada como desconhecida | Least misery explícito | MIT, protótipo de hackathon |
| FAPE | Regra de justiça explícita | Leve para grupos pequenos | Depende das notas de entrada | Pacotes justos | MIT, parado |

## Recomendação para a v1

Um gerador de candidatos em Python puro sobre o SQLite, com dois sinais que já nascem como evidência e uma etapa de grupo.

1. **Sementes por pessoa.** Notas importadas (Letterboxd, Trakt), preferências declaradas e feedback de sessões. Cada semente já tem fonte e data no banco.
2. **Sinal de conteúdo.** Para cada semente positiva, seguir arestas de 1 salto filme-entidade-filme (diretor, roteirista, ator principal, gênero, palavra-chave, franquia). Somar pesos por tipo de aresta, ponderados pela nota da semente, como na consulta da Neo4j. Guardar o caminho que gerou cada ponto. Preferências declaradas ("gosta de terror coreano") entram como semente de entidade, com `Tipo: declarado`.
3. **Sinal colaborativo.** Tabela pré-calculada, a partir do MovieLens-32M ligado ao TMDB pelo `links.csv` ([README do ml-32m](https://files.grouplens.org/datasets/movielens/ml-32m-README.html)), com os k vizinhos de cada filme e as contagens que justificam a vizinhança. A evidência cita "MovieLens 32M, gerado em 2023-10-13". Sem usuário no treino, então amigo novo não exige nada.
4. **Pessoa sem dado.** Sem nenhuma semente, não há candidato próprio dela. No grupo, a utilidade dela fica "desconhecida" e o motivo que a cita vira `palpite`, como no commonground. O questionário rápido e a descrição feita pelo dono (outro ticket) são a saída para isso.
5. **Grupo.** Vetos rígidos filtram primeiro. Depois cada membro tem uma utilidade por filme (normalizada por pessoa), a ordem é pela menor utilidade conhecida e o desempate pela média. A resposta lista quem cada filme atende e quem fica de fora. O LLM reordena dentro dessa lista e redige só a partir das linhas de evidência.

Não instalar hopwise, RecBole nem pykeen na v1. O sinal item-item é algumas dezenas de linhas com `scipy.sparse`. Adotar uma dessas bibliotecas traria PyTorch para ganhar um score sem evidência.

## O que fica para depois

- **SVD com fold-in** como terceiro sinal, só para ordenar dentro dos candidatos já justificados, nunca para gerar candidato sem caminho. Avaliar quando houver feedback para medir se melhora.
- **PGPR/hopwise** se o sinal de conteúdo de 1 salto se mostrar raso. Antes de usar: testar o pareamento item-caminho em `collect_scores` e checar cada caminho contra o banco.
- **FAPE** quando houver modelo de justiça entre sessões: a sequência de sessões de um grupo vira o pacote.
- **AGREE/GroupIM** só se um dia houver centenas de sessões de grupo, o que não deve acontecer neste uso.

## Lacunas

- Não medi o tempo da tabela item-item sobre o MovieLens-32M inteiro; o número do RecBole é do ML-1M.
- Os pesos por tipo de aresta (5, 3, 4 na Neo4j) são escolha do autor do guia, sem avaliação. Precisamos de pesos nossos e de alguma forma de avaliar o top 5.
- O defeito de pareamento no PGPR do hopwise vem da leitura do código, sem execução.
