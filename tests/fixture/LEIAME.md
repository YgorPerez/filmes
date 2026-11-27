# Fixture

Mini Catálogo e repo de dados fictícios. Títulos, diretores e IDs são inventados (`tt90xxxxx`, `Q90xxxxx`) para nunca se confundirem com dado real. Os testes fixam hoje em 2026-11-20.

## catalogo/

Cada `<tabela>.csv` vai direto para a tabela de mesmo nome do banco, na ordem do esquema. O cabeçalho nomeia as colunas; célula vazia vira NULL; `fato_id`, se a tabela tiver e o CSV não, sai do hash da linha. CSV sem tabela no esquema é erro de `reconstruir`.

Os IDs de filme seguem `tt90DDNNN`: `DD` é o diretor (`Q90000DD`), `NNN` a ordem dentro dele. Os filmes acrescentados por ticket a partir do #55 usam `tt900TTNN`, com `TT` o número do ticket (`tt90055NN`, `tt90056NN`, `tt90058NN`), e não seguem essa regra.

| Diretor | Filmes | Notas do Bruno | Para que serve |
|---|---|---|---|
| Helena Prado (01) | 101–106 | 5 (2025), 4,5 (2024), 4 (2023) em 101–103 | 3 Notas altas: caminho forte. 106 tem 600 votos, abaixo do mínimo |
| Otávio Lins (02) | 201–203 | 4,5 e 4 em 201–202 | 2 Notas altas: moderada |
| Marta Quintal (03) | 301–303 | 4 em 301, 3,5 em 303 | 1 Nota alta: fraca; 3,5 é semente fraca a favor |
| Rui Tavares (04) | 401–403 | 5 (2019), 4 (2018) | Notas antigas: a Força fica, a contribuição decai pela meia-vida (#173) |
| Caio Brandão (05) | 501–503 | 1 e 2 | Notas baixas: Evidência contra |
| Lia Moura, Tomás Reis, Beatriz Sá, Jorge Amaral (06–09) | 601–903 | nenhuma | Sem Fato para o Bruno. 903 tem 999 votos |
| Sofia Rangel (18) | 1801–1803 | nenhuma | Alvo de Declarado, Relato e Veto nos testes de Pessoa (#18) |

Toda Nota é também Já visto: o filme a que alguém deu Nota leva "já viu" contra (forte) para essa Pessoa e cai na ordem.

Entidades que não são diretor, com IDs `Q90018NN` (faixa do #18), só no predicado indicado:

| Entidade | Predicado | Filmes |
|---|---|---|
| Terror (Q9001801) | genero | Porão Escuro (1801), A Casa do Fim (1802), Explosão Final (502) |
| Comédia (Q9001802) | genero | Risos de Domingo (1803), Pequenos Milagres (601) |
| Davi Couto (Q9001803) | elenco | Risos de Domingo (1803), Casa Cheia (602) |

Essas entidades não ligam a Nota nenhuma do Bruno, então não mudam o top 5 dele.

Veto a gênero com subgêneros (#48, `test_veto_subgeneros.py`). Os filmes `tt90048NN` não têm diretor nem Nota, e ficam entre os só com palpites. Romance usa o QID real (Q1054574) porque `filmes/catalogo/generos.py` liga o Romance do IMDb a ele. `subclasses_wikidata.csv` faz comédia romântica (Q9004801) subclasse de romance e de comédia (Q157443), e comédia de recasamento (Q9004802) subclasse de comédia romântica.

| Filme | Gênero | Caminho de um Veto a romance |
|---|---|---|
| Carta de Amor (4801) | romance (Wikidata) | direto |
| Amor em Paris (4802) | comédia romântica (Wikidata) | subgêneros |
| Casar de Novo (4803) | comédia de recasamento (Wikidata) | subgêneros, dois níveis abaixo |
| Baile de Formatura (4804) | Romance (IMDb) | gênero do IMDb |

Maré Baixa (102) também tem Romance no IMDb e sai pelo mesmo caminho.

Caminho de conteúdo por outros predicados (`test_caminho_conteudo.py`). Cada filme liga às Notas do Bruno por um predicado só, com entidade `Q90019NN`:

| Filme | Predicado e entidade | Liga a |
|---|---|---|
| Maré Cheia (1901) | roteiro, Ana Ruiz | O Farol de Areia (101) |
| Voo Noturno (1902) | elenco, Rita Lobo | Ponte Aérea (201) |
| Fronteira II (1903) | serie, Trilogia da Fronteira | Fronteira (401) |
| Poeira (1904) | genero, faroeste | 101, 102, 103 e Jardim Suspenso (301): quatro Notas altas, que no gênero ficam em metadado fraco |
| Escala em Lisboa (3501) | elenco, Rita Lobo | Ponte Aérea (201), como Voo Noturno, mas Rita Lobo está fora dos 3 primeiros créditos |
| Mar Aberto (4901) | serie, Os 100 melhores filmes segundo a Revista Tela (`Q9004901`) | Fronteira (401), mas a lista não está em `series_de_filmes.csv` e a aresta sai na reconstrução. Tem 1.000 votos, o mínimo, para ficar depois dos outros filmes só com palpites; entra no `--quantos 100` de `test_grupo.py` e de `test_caminho_conteudo.py` |

`series_de_filmes.csv` diz quais entidades de série são série de filmes: só a Trilogia da Fronteira. Uma série nova na fixture precisa de linha ali, senão a aresta dela some.

Créditos do IMDb (`elenco_principal_imdb.csv`, `atores_imdb.csv`): os 3 primeiros atores de Voo Noturno e de Escala em Lisboa. Rita Lobo (`nm9001902`) é o segundo crédito de Voo Noturno, e a Evidência fica só com o teto do elo (moderada); em Escala em Lisboa os três primeiros são outros, e ela vale no máximo fraca. Também Coxia (`tt9005504`), com Duda Alves (`nm9005501`) no primeiro crédito, para o teto do elenco no metadado agregado (#55). Os demais filmes não têm créditos, e a régua deles não muda.

Notas de outras Pessoas, para os testes de grupo (`test_grupo.py`):

| Pessoa | Notas | Para que serve |
|---|---|---|
| Iara | 3 em O Farol de Areia (101), 4 em Fronteira (401) | Fraca a favor nos outros de Helena Prado, moderada nos outros de Rui Tavares. Sobre 101 e 401 em si, só o Já visto da própria Nota. Bruno e Iara discordam em As Horas Lentas e quase concordam em A Volta do Mar: a Regra padrão e a média simples ordenam os dois ao contrário |
| Rosa | 5 em Ensaio Geral, 4,5 em Bastidores e em Ato Final (`tt9005501`–`03`) | Teto do elenco no metadado agregado (#55): Duda Alves e Clara Bastos em 3 Notas altas. Recomenda sozinha; para os outros, os filmes dela são só palpites |
| Teo | nenhuma | "sem fato" em todo filme |
| Quim | 5 em Ponte Aérea (201), 3,5 em Maré Baixa (102), 4,5 em Barulho (501), 2 em Fronteira (401) | Testes de Satisfação (`packages/engine/test/sessions/satisfaction.test.ts`). Com o Bruno, o Quim é o mínimo em As Horas Lentas e em A Volta do Mar, e o Bruno é o mínimo em Asfalto Quente: quem saiu menos satisfeito faz subir os filmes dele |

Os filmes de Lia Moura, Tomás Reis, Beatriz Sá e Jorge Amaral não ligam a Nota nenhuma: são os filmes só com palpites, que completam a lista com `--quantos 50`.

### Régua por percentil (#172)

`notas_movielens.csv` é a população do MovieLens da fixture: 50 notas inventadas, distribuídas para que, com os cortes de `[rating_percentile]` em `config/weights.toml`, a leitura pela população dê o que a régua absoluta antiga dava (5 e 4,5 forte, 4 moderada, 3,5 e 3 fraca a favor, 2,5 fraca contra, 2 moderada contra, 1,5 ou menos forte contra). Toda Pessoa da fixture tem menos de 20 Notas, o mínimo, e é lida por ela; assim as tabelas acima continuam valendo. Os testes da escala própria baixam o mínimo (`weightsWith`) para o Bruno, com 11 Notas, ser lido pelas dele: 5 forte, 4,5 moderada, 4 fraca, 3,5 fraca contra. Mudou um corte em `weights.toml`? Refaça esta distribuição.

### Vizinhos de gosto (#174)

`notas_gosto_movielens.csv` é a amostra de usuários do MovieLens da fixture, com a Fonte em `fonte_gosto_movielens.csv`. A etapa `71_escalas_de_gosto` calcula o percentil de cada nota na escala do próprio usuário.

| Usuário | Notas | Para que serve |
|---|---|---|
| 10, 20 e 30 | As de Bruno em 101, 102, 103, 201, 202, 401, 501 e 503, quase iguais às dele; 5, 4,5 e 5 em Pequenos Milagres (601); 1, 1,5 e 2 em Deserto Branco (701) | Os vizinhos mais próximos do Bruno: a favor de 601, contra 701 |
| 40 | Os mesmos 8 filmes ao contrário do Bruno; 1 em 601 e 5 em 701 | Vizinho distante: só entra com `k` 4 ou mais |
| 50 | 5 em 101, 4,5 em 102, 1 em 601 | Divide só 2 filmes com o Bruno |
| 60 | Como o Bruno em 101, 202 e 501, ao contrário em 401 (a Nota dele de 2019); 3 em 701 | Divide 4 filmes com o Bruno: com o Decaimento, a Nota velha pesa menos e ele entra entre os 3 mais próximos (`min_shared` 4) |

Ninguém divide 10 filmes com o Bruno, o `min_shared` de `config/weights.toml`, então os outros testes não veem esse caminho. Os testes dele baixam `k` e `min_shared`.

### Sinais de Review (#21)

Os filmes `tt90010NN` e `tt90011NN` não têm diretor. Eles se ligam às Notas só pela tabela `vizinhos`, e cada um tem pelo menos uma Evidência do Bruno, para não virar filme só com palpites nos testes de grupo.

Vizinhança item-item (`vizinhos.csv`, `test_vizinhanca.py`):

| Filme | Vizinho de (base, ambos) | Para que serve |
|---|---|---|
| A Casa das Marés (1001) | O Farol de Areia (3104, 1987); Cidade de Vidro (600, 120) | 64% de 3.104: forte. 20% fica fora |
| Segunda Chamada (1002) | Maré Baixa (250, 112) | 44% de 250: moderada |
| O Mapa Rasgado (1003) | Maré Baixa (40, 12); O Farol de Areia (25, 20) | 30% de 40: fraca. Base 25 fica fora |
| Luz de Inverno (1004) | Rio Abaixo (900, 630); Fronteira (1000, 650) | Seriam fortes; a semente limita a fraca (3,5) e a moderada (5 de 2019). A Iara também deu 4 a Fronteira |
| Ruído Branco (1005) | Barulho (700, 490); Fronteira (150, 63) | Barulho levou 1 do Bruno e não é semente. Fronteira dá moderada ao Bruno e à Iara |
| Porto Seguro (1006) | Cidade de Vidro (600, 240) | 40% exatos: já é moderada |
| Canal Fundo (1007) | Cidade de Vidro (600, 150) | 25% exatos: já é fraca |

Num dump real, a base é a mesma em todas as linhas de uma semente. Aqui não: O Farol de Areia tem 3.104, 50 e 25. O motor lê a base de cada linha, então isso não muda nada, e as linhas antigas ficam como estão.

Tags, genome e gênero (`tags_movielens.csv`, `genoma.csv`, `test_clima.py`). Todos são vizinhos de O Farol de Areia por (50, 15), o que dá Evidência fraca igual ao Bruno e à Iara: no gosto, empatam, e só o bônus e os votos os separam.

| Filme | Votos | Tags (usuários) | Genome | Gênero |
|---|---|---|---|---|
| Dia de Feira (1101) | 13000 | feel-good (14), funny (12) | suspense 0,8 | comédia |
| Tarde de Domingo (1102) | 11000 | feel-good (5) | | |
| Bolo de Fubá (1103) | 10500 | feel-good (2) | feel-good 0,85; suspense 0,799 | |
| Pipa no Céu (1104) | 10200 | | feel-good 0,70; feel good movie 0,50 | |
| Carnaval de Rua (1105) | 10100 | | suspense 0,6 | comédia |
| Sessão Maldita (1106) | 10050 | so bad it's good (12) | | |
| Silêncio no Lago (1107) | 10020 | meditative (12) | slow 0,90 | |
| Outro Dia Qualquer (1108) | 30000 | tense (2) | suspense 0,599 | |
| Quermesse (1109) | 9000 | feel-good (10) | | |
| Piquenique (1110) | 8900 | feel-good (3) | | |

Outro Dia Qualquer tem mais votos. Sua tag e seu escore ficam abaixo dos pisos, então ele fica à frente dos demais quando empatam sem bônus.

O gênero comédia usa o QID real (`Q157443`), porque o vocabulário de Climas (`config/climas.toml`) aponta para QIDs reais. Tags e QIDs da fixture têm de existir nos vocabulários de `config/`; trocar uma tag de lá pode quebrar `test_clima.py`.

### Restrições

Tabelas que só as Restrições da Sessão leem. Os filmes são os de cima; a tabela completa do que passa em cada idade está no começo da seção de criança de `tests/test_restricoes.py`.

- `idiomas_originais.csv`: português nos filmes de Helena Prado (101–105) e em Jardim Suspenso (301, que também é espanhol); inglês em 201–203 e 401; espanhol em 302. Os outros não têm idioma e saem quando se pede um.
- `classificacoes.csv`: um rótulo por sistema, como a fonte escreve ("12A", "FSK 6", "tous publics"). A etapa `60_faixas_etarias` converte para `faixas_etarias`. Há um caso de cada regra: ClassInd que vence o MPA (104), faixa mais alta entre dois sistemas (105), "livre" do CNC e da EIRIN ignorados (102, 203), faixa 6 (103, 403, 503).
- `adultos.csv`: Jardim Suspenso (301) tem isAdult no IMDb.
- Sem classificação local: 201, 203 (só EIRIN G), 302, 402. Numa Sessão com criança, esses dependem do OMDb.

### Cabeçalho do filme

- `generos_imdb.csv`: gêneros do IMDb como o title.basics escreve, na ordem dele. Têm gênero 101–105 e 403; Noite de Estreia (203) não tem, para o caso da lista vazia. Nada lê esta tabela fora do cabeçalho, então acrescentar gênero não muda a ordem.
- `filmes.csv`, coluna `nota_imdb`: só As Horas Lentas (104) tem nota (7,4); os outros saem com `nota_imdb` nulo.

### Série na ordem (#165)

Filmes `tt90165NN`, sem diretor, com 1.000 votos, para `series-order.test.ts`. As séries estão em `series_de_filmes.csv` com a raiz (Q24856, série de filmes; Q196600, franquia), e as datas de estreia em `estreias.csv`. A Trilogia da Fronteira (Q9001903) ganhou a raiz Q24856; os filmes dela não têm data, então a regra não mexe neles.

| Filme | Série | Estreia | Quem viu |
|---|---|---|---|
| Cais (9016501) | Trilogia do Cais (Q9016501), série de filmes | 2010-05-07 | ninguém |
| Cais 2 (9016502) | Trilogia do Cais | 2012-06-15 | Rosa (Nota 3, que não é semente de 4+) |
| Cais 3 (9016503) | Trilogia do Cais | 2014-07-04 | ninguém |
| Cais: Origens (9016504) | Trilogia do Cais | sem data: não vem antes nem depois de nenhum | ninguém |
| Estelar (9016511) e Estelar: Retorno (9016512) | Universo Estelar (Q9016502), franquia | 2001 e 2005 | ninguém: a franquia não conta |
| Lado A (9016521) e Lado B (9016522) | Díptico dos Lados (Q9016503), classe Q9016504 sob série de filmes | os dois 2018-03-10 | ninguém: mesma data, nenhum vem antes |

Na regra padrão, para quem não viu nada (o Teo, o Bruno) saem Cais 2 e Cais 3; para a Rosa sai só Cais 2, porque ela viu Cais 2, o anterior de Cais 3. Com "todos os anteriores", Cais 3 também sai para ela, que nunca viu Cais.

## gravacoes/

Respostas das fontes sob demanda como a API devolve, em `<fonte>/<tconst>.json`. Os testes ligam com `FILMES_GRAVACOES` e uma chave qualquer; arquivo ausente vale como "a fonte não conhece o filme". Uma falha de rede se grava em `<fonte>/<chave>.falha.json` (`{"motivo": "Connection reset by peer", "vezes": 2}` falha duas vezes e depois lê `<chave>.json`; sem `vezes`, falha sempre). A fixture não tem nenhuma: `test_fila_reprocessar.py` cria as suas numa cópia das gravações.

- `omdb/`: Vento Norte PG, Noite de Estreia PG-13, Inverno em Lisboa Not Rated, Jardim Suspenso G. Ponte Aérea não tem arquivo.
- `ddd/`: o tema "a dog dies" tem 12 sim e 2 não em As Horas Lentas, 3 e 2 em A Volta do Mar (os dois saem), 1 e 14 em Sal e Ferrugem, 2 e 0 em Cidade de Vidro (poucos votos), 3 e 3 em Noite de Estreia (empate). O Farol de Areia só tem "there are jump scares"; Maré Baixa não tem arquivo.
- `tmdb/find-<tconst>-pt-BR.json`: respostas do `/find` com `language=pt-BR`, de onde saem capa, título em português e sinopse. `find-tt0133093-pt-BR.json` (Matrix) foi gravada do TMDB em 2026-11-21; as outras copiam o formato dela. As Horas Lentas tem pôster e sinopse de duas frases; Sal e Ferrugem vem sem pôster, com o título "Sal & Ferrugem" e um "Dr." na primeira frase; Noite de Estreia vem sem pôster e com o overview vazio; os demais não têm arquivo. Os outros arquivos de `tmdb/` são do import do Letterboxd, descrito abaixo.

- `catalogo/`: trechos dos TSVs do IMDb e das respostas SPARQL JSON do QLever, coletados em 2026-11-20. Exercitam o corte de 100 votos, a exclusão de adultos, a ponte de IDs, o elenco, os créditos do `title.principals` (Schindler's List, Matrix e Miss Jerry) e o P345 de dois atores, os idiomas e os rótulos reais de classificação. `atualizar` lê essas gravações em vez de acessar a rede. O P179 de Matrix (The Matrix series, `Q1210827`) e a linha dela em `wikidata-series.json` são reais, de 2026-11-21; a variável `raiz` dessa linha (Q24856) entrou no #165, com o que a consulta nova responde para uma série que é instância direta de série de filmes. As datas P577 de Schindler's List em `wikidata-ids.json` têm um 1993-01-01, a data só com ano do Wikidata. O P179 de Schindler's List para a lista da BBC (`Q26705935`) é inventado: a lista existe, mas o filme não está nela. Serve para a aresta que a reconstrução tira.

## dados/

Repo de dados fictício. Cada teste trabalha numa cópia, então comandos podem escrever nele.

As chaves do frontmatter estão em inglês (ADR 0002), como no filmes-dados; o corpo da Pessoa continua em português.

- `people/bruno.md`: o Dono (`owner: true`, apelido `eu`), com `email: bruno@example.org`, que entra no login online (#112).
- `people/iara.md` e `people/teo.md`: Pessoas para os testes de grupo. A Iara tem `email: iara@example.org` sem ser Dona: o login a recusa (#112).
- `people/vera.md`: a segunda Dona (`owner: true`, `email: vera@example.org`), sem Nota, para os testes com dois Donos (#131): cada uma entra no login, e sem login "dono" é o primeiro Dono por slug, o Bruno.
- `people/quim.md`: Pessoa para os testes de Satisfação; tem uma pergunta aberta sobre a Helena Prado (Q9000001), para os testes de perguntas abertas (#62).
- `people/rosa.md`: Pessoa do teste do teto do elenco no metadado agregado (#55).
- Não há `sessions/`: os testes criam as Sessões com `recomendar` e `feedback`, ou escrevem o arquivo direto quando precisam de várias datas (veja `satisfaction.test.ts`).

Os testes de Pessoa (#18) criam a Ana pela CLI e escrevem a Carol direto no repo de dados do teste; nenhuma das duas fica na fixture.

## Para estender

Acrescente linhas e filmes novos com IDs novos (um diretor novo `10`, `11`... ou filmes `tt90DD9NN`) em vez de mudar os existentes: outros testes contam com eles. Uma Pessoa nova é um arquivo em `dados/people/`, com as chaves em inglês; as Notas dela vão em `catalogo/notas.csv`. Se a mudança alterar o top 5 do Bruno, rode a suíte inteira e ajuste a tabela acima.

## Export do Letterboxd

`letterboxd/olga/` tem os cinco CSVs no formato de export. Os testes montam o ZIP
no diretório temporário. Uma review tem HTML, vírgulas e aspas. A outra tem duas
linhas. As tags de O Farol de Areia aparecem tanto no diário quanto na review.

- O Farol de Areia, Maré Baixa, Cidade de Vidro, Noite d'Estreia e Jardim Suspenso
  vêm de `catalogo/slugs_letterboxd.csv`. Maré Baixa tem um homônimo de 1980 e
  precisa do sufixo de ano. Cidade de Vidro foi cadastrada no export com um ano
  de diferença. Jardim Suspenso só está na watchlist.
- Rio Abaixo tem um homônimo com ano incompatível no Wikidata. O TMDB acha o
  título em 2015, um ano depois do export, e devolve o tconst em `externos-9101.json`.
- A Longa Série tem só ID de série no Wikidata. Gambito só tem resultado na
  busca de séries do TMDB. Os dois são descartados.
- Vento Norte fica na fila com dois candidatos do TMDB. Confirmar o primeiro
  usa `externos-9102.json`. Filme Perdido também fica na fila, sem candidato.
  A fila mostra a ficha de cada candidato (`ficha-9102.json`, brasileiro, de
  Helena Prado; `ficha-9103.json`, alemão, sem sinopse em português), para
  separar os dois (#274).

### Série e curta homônimos (#53)

`test_letterboxd.py` monta um `watched.csv` no diretório temporário com estes títulos:

- Dama do Lago (2017): o filme 9301 tem 2 votos e a série 9302 tem 540. Vira minissérie.
- Porto Seguro (2019): o filme 9311 tem 820 votos e a série 9312 tem 31. Resolve para `tt9009311`.
- Eco (2021): 9321 é curta de 6 min sem votos e 9322 é longa de 98 min com 4 votos (`detalhes-<id>.json`). Resolve para `tt9009322`.
- Duas Margens (2022): os dois candidatos são curtas. Ficam os dois, e o item vai para a fila.

### Nada triste (#42)

`test_restricao_tristeza.py`. Sinais de tristeza e de tema pesado em filmes sem Nota de ninguém, com as tags e os QIDs reais de `config/tristeza.toml`:

| Filme | Sinal | Com `--sem-tristeza` |
|---|---|---|
| Pequenos Milagres (601) | tags.csv "sad", 5 usuários | sai |
| Casa Cheia (602) | tags.csv "sad", 2 usuários | passa |
| Deserto Branco (701) | genome "tearjerker" 0,6 | sai |
| A Última Estação (702) | genome "sad" 0,59 | passa |
| Os Inquilinos (901) | tags.csv "massacre", 2 usuários | sai |
| Fim de Tarde (902) | `tema` Holocausto (Q2763) | sai |
| Café Amargo (801) | `baseado_em` suicídio (Q10737) | sai |
| Linha Cruzada (802) | `tema` futebol (Q9004201), sem tag | passa |
| Casa Vazia (5801) | tags.csv "grief", 2 usuários | sai |
| Último Verão (5802) | tags.csv "tragic loss", 2 usuários | sai |
| Aliança Partida (5803) | tags.csv "death of wife", 2 usuários | sai |

Os filmes `tt90058NN` (#58) não têm diretor nem Nota, e ficam entre os só com palpites. Cada um tem só uma das tags de luto de `[tema_pesado]`.

"sad" e "tearjerker" estão no Clima "pra chorar"; nenhum teste pede esse Clima. As tags de "sozinho" (bleak, depressing) ficaram de fora de propósito, para não mudar quem é filme só com palpites.

## CSV de avaliações do IMDb

`imdb/vera.csv` está no formato do "Your Ratings" > Export do IMDb, com as colunas que `exportRatings` escreve (#285). A Vera não tem Nota na fixture; os testes importam o CSV para ela ou para uma Pessoa criada no teste.

- O Último Bonde (202) com 9, Rio Abaixo (303) com 7 e Pequenos Milagres (601) com 2: viram Notas 4,5, 3,5 e 1.
- "Cais, Episódio 1" (`tt9028501`) é um episódio de série fora do Catálogo, com vírgula no título: fica de fora do import, no relatório.

## Backup do Simkl

`simkl/SimklBackup.json` está no formato do backup do Simkl (Apps › Export › ".zip archive with .json file", #299), com IDs `simkl` inventados (`91000NN`). Os testes o importam para a Vera, sozinho ou dentro de um ZIP.

- O Último Bonde (202) com 9, pelo ID do IMDb: Nota 4,5 em 2025-03-08 (`last_watched_at`).
- Maré Baixa só com o TMDB 9003, que `slugs_letterboxd.csv` liga a 102: Nota 3. O `last_watched_at` é o "não lembro" do Simkl (`1970-01-01T00:00:01Z`), e a data sai de `user_rated_at`, 2024-07-14.
- Rio Abaixo só com o TMDB 9101, que nada liga offline: com a chave do TMDB, a gravação `tmdb/externos-9101.json` dá 303, e vira Já visto (`completed` sem nota) em 2023-05-01; sem a chave, fica de fora.
- Pequenos Milagres (601) em `plantowatch`: watchlist em 2026-10-02.
- Casa Cheia (602) `completed` sem nota e sem data nenhuma além do "não lembro": Já visto com a data do import.
- Barulho (501) em `dropped`, sem nota: não entra.
- Filme Perdido (`tt9999901`) não está no Catálogo, e Filme Sem Ids, um anime só com o ID do MyAnimeList, não se resolve: os dois ficam no relatório.
- Em `anime`, Deserto Branco (701) com `anime_type: "movie"` e nota 8 vira Nota 4; A Última Estação (702) é `tv` e não entra, nem a série Cais em `shows`.

## Backups do TV Time

`tvtime/` tem os dois backups do TV Time (#300), com nomes e colunas dos reais (pesquisa #288). Os testes montam o ZIP: `gdpr-data/` vai dentro da pasta `gdpr-data/`, como no export real; `liberator/` vai na raiz. Os testes importam para a Vera.

`gdpr-data/` é o export GDPR, sem ID de filme. Os filmes são as linhas `movie` de `tracking-prod-records.csv` e se resolvem pelo slug em inglês de `alpha_range_key` e pelo ano de `release_date`:

- O Farol de Areia: assistido em 2023-05-01 e revisto em 2025-01-10, com "great" (4) em `ratings-live-votes.csv`, que vale na revisão. Sai pelo Wikidata.
- Cidade de Vidro: `movie_name` em japonês, e o slug resolve pelo Wikidata. Sem `watch_date_range_key`, a data é a de `created_at`, com "bad" (1).
- Porto Seguro (2019): só o TMDB acha, como no import do Letterboxd. Nota "good" (3).
- Vento Norte (2020) fica na fila com os dois candidatos do TMDB, a mesma entrada da Olga.
- Filme Perdido tem `release_date` 0001-01-01 e fica na fila sem ano.
- Jardim Suspenso é `towatch`: vai para a watchlist.
- "Cais, Episódio 1" é um episódio e fica de fora.
- Iscas, que o import nunca lê nem guarda: `emotions-live-votes.csv` (mesmo cabeçalho das notas, daria "wow" ao Farol), `access_token.csv` e `auth-prod-login.csv` (credenciais) e `tracking-prod-records-v2.csv` (episódios). Cada uma tem um texto `*-NAO-LER` que o teste procura na cópia guardada.

`liberator/` é o export do TV Time Liberator: `movies.json` traz o tconst em `id.imdb` e a nota de 1 a 10.

- O Último Bonde com 8 e Rio Abaixo com 10 viram Notas 4 e 5. Pequenos Milagres não tem `watched_at`: o Já visto fica com a data de `created_at`.
- Jardim Suspenso tem `is_watched: false`: vai para a watchlist.
- Filme Perdido tem `imdb: "-1"` e fica na fila, sem ano. Fora do Catálogo (`tt9099999`) não está no Catálogo e sai no relatório.
- `shows.json` e `lists.json` são iscas: o import guarda só o `movies.json`.

## RSS do Letterboxd

`gravacoes/letterboxd/rss-olga_farol.xml` é um RSS inventado no formato do real
(conferido num RSS público em 2026-11-21), lido por `importar --letterboxd-rss olga_farol`.
Usuário sem arquivo vale como perfil inexistente.

- O Farol de Areia (2012-01-10, 4,5) e Maré Baixa (2015, 2024-02-11, 2) repetem o
  diário do ZIP da Olga; o ZIP importado depois não duplica esses Fatos.
- O Farol de Areia tem uma revisão em 2024-05-05 com 5 que o ZIP não tem.
- Maré Baixa (2014) traz o ID 9002, do homônimo de 1980 (tt9023002): o slug com
  `-2015` daria outro filme, e o ID vence.
- Vento Norte não tem data do diário; vale a data de publicação, 16/07 às 21h
  (-03:00). O ID 9102 resolve por `tmdb/externos-9102.json`, sem passar pela busca
  por título, que daria dois candidatos.
- Uma lista ("Faróis") fica de fora.

### Veto por grupo de tags e nota do IMDb (#56)

Filmes `tt90056NN`, sem diretor nem Nota, para `test_veto_por_tag_e_nota_imdb.py`. O grupo "comédia boba" (`config/vetos_por_tag.toml`) vale para Comédia no IMDb, com relevância 0,7 no Genome ou 10 usuários no tags.csv.

| Filme | Gênero do IMDb | Tag | Para que serve |
|---|---|---|---|
| Turma do Recreio (5601) | Comedy | teen 0,9 (Genome) | sai pelo Genome |
| Piada Pronta (5602) | Comedy | silly, 12 usuários | sai pelo tags.csv |
| Riso Contido (5603) | Comedy | silly 0,69 e 9 usuários | abaixo dos dois mínimos: fica |
| Drama Juvenil (5604) | Drama | teen 0,95 | não é comédia: fica |
| Obra-Prima (5605) | — | — | nota 8,5 e 1.000 votos: o bônus da nota o põe à frente dos outros só com palpites |

As Horas Lentas (7,4) também ganha o bônus da nota; `satisfaction.test.ts` zera o peso para isolar a Satisfação.

### Nada lento (#57)

Os mesmos filmes `tt90056NN` levam "boring", tag do grupo `lento` fora do `grupo_sozinho.toml` (`config/vetos_por_tag.toml`), para `test_sem_lento.py`. O grupo vale para qualquer gênero, com os mínimos do #56.

| Filme | Tag de ritmo | No `--sem-lento` |
|---|---|---|
| Piada Pronta (5602) | boring, 10 usuários | sai pelo tags.csv |
| Riso Contido (5603) | boring, 9 usuários | abaixo do mínimo: fica |
| Drama Juvenil (5604) | boring 0,8 (Genome) | sai pelo Genome, mesmo sendo drama |

### Teto do elenco no metadado agregado (#55)

Filmes `tt90055NN`, de Clara Bastos (`Q9000055`) e com Duda Alves (`Q9005501`, `nm9005501`) no elenco, para o último teste de `test_caminho_conteudo.py`. Só a Rosa deu Nota a eles, então para o Bruno e os outros são filmes só com palpites. Têm 1.000 votos, para ficar no fim entre eles.

| Filme | Nota da Rosa | Para que serve |
|---|---|---|
| Ensaio Geral (5501) | 5 (2025) | três Notas altas no mesmo diretor e no mesmo ator |
| Bastidores (5502) | 4,5 (2025) | |
| Ato Final (5503) | 4,5 (2025) | |
| Coxia (5504) | nenhuma | Candidato: Duda Alves é o primeiro crédito do IMDb. O agregado do diretor sai forte e o do elenco fica no teto, moderada |

### Algo igual X (#67)

Filmes `tt90067NN`, sem diretor nem Nota, para `test_parecido.py` e `mcp/test/parecido.test.ts`. Para o Bruno são só palpites: entre eles, os votos ordenam. Nenhum tem Romance, para não mudar a contagem do Veto a romance. Escrever Cartas e Estrada Afora são as referências.

| Filme | Votos, nota | Genoma | Tags (usuários) | Vizinho de Escrever Cartas | Gêneros do IMDb |
|---|---|---|---|---|---|
| Escrever Cartas (6701) | 5000 | family 0,9, writers 0,85, bittersweet 0,8 | family 20, writers 15 | | Drama, Family |
| Estrada Afora (6702) | 5000 | — | road trip 10 | | Comedy, Drama |
| Mesa de Domingo (6711) | 3000 | family 0,9, writers 0,8, bittersweet 0,75 | family 10, writers 8 | 500, 200 | Drama, Family |
| Rascunho (6712) | 2000 | family 0,6 | | | Drama |
| Pé na Estrada (6713) | 2500 | | road trip 8 | 500, 50 | Comedy |
| Quase Igual (6714) | 3000, 6,5 | como Mesa de Domingo | | | Drama, Family |
| Tinta e Papel (6716) | 1500 | — | family 20, writers 15 | | Drama, Family |

Parecença com Escrever Cartas, do maior para o menor: Tinta e Papel (fora do genoma, com o peso dele redistribuído, empata em tudo o que tem), Mesa de Domingo, Quase Igual (abaixo da nota mínima e fica fora do corte), Rascunho e Pé na Estrada. Com Estrada Afora, que não está no genoma, só Pé na Estrada.

Ponto de Partida (6720, 5000 votos, Drama) é referência fora do MovieLens, só com diretora (Lia Moura, Q9006701), os 3 primeiros atores (nm9006701 a 03) e gênero. Mesmo Elenco (6721, 4000, Thriller) divide os 3 atores e nada mais: não é parecido. Mesma Diretora (6722, 1200, Drama) divide a diretora: é parecida, com a linha "mesmo diretor".

### Sementes de mesmo título (#126)

Filmes `tt90126NN`, de Nina Vale (`Q9012601`), para o teste de ordem das sementes em `test_caminho_conteudo.py`. Só a Rosa deu Nota a eles, então para o Bruno e os outros são filmes só com palpites. Têm 1.000 votos, para ficar no fim entre eles.

| Filme | Nota da Rosa | Para que serve |
|---|---|---|
| Reprise (9012601, 2011) | 4 (2025) | mesmo título e mesma Nota que a de 2004, com o ID menor: o ano desempata antes do ID |
| Reprise (9012602, 2004) | 4 (2025) | |
| Bis (9012603, 2019) | nenhuma | Candidato: as duas Reprise saem em ordem de ano na linha do diretor e nas sementes |

Perguntas par a par (#181, `entropia_movielens.csv`): sete filmes com a entropia das notas do MovieLens, na ordem de entropia × ln(avaliações): Jardim Suspenso (301, adulto, nunca é perguntado), Ponte Aérea (201, que o Quim já viu), O Farol de Areia (101), A Última Estação (702), Sal e Ferrugem (105), Pequenos Milagres (601, o mais popular, mas sem discordância) e O Último Bonde (202). Os outros filmes vêm depois, pelos votos do IMDb.

### Fotografia e produtor (#284)

Filmes `tt90284NN`, com entidades `Q90284NN`, para o caminho de conteúdo por fotografia e por produtor (decisão do Dono no #283: teto fraca, peso 0,5). Contraluz é a semente: ninguém da fixture deu Nota a ele, e o teste importa o 10 da Vera (o CSV do IMDb) antes de recomendar. Os outros dois ligam a ele por um predicado só. Os três têm 900 votos, abaixo do mínimo de `[catalog]`: só são Candidatos no teste que baixa o `min_votes`, e por isso não mudam as saídas gravadas.

| Filme | Predicado e entidade | Liga a |
|---|---|---|
| Contraluz (9028403, 2013) | fotografia e produtor | a semente |
| Luz Rasante (9028401) | fotografia, Íris Penha (Q9028401) | Contraluz (9028403) |
| Bilheteria (9028402) | produtor, Nestor Gil (Q9028402) | Contraluz (9028403) |
