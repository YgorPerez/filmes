# Fixture

Mini Catálogo e repo de dados fictícios. Títulos, diretores e IDs são inventados (`tt90xxxxx`, `Q90xxxxx`) para nunca se confundirem com dado real. Os testes fixam hoje em 2026-11-20.

## catalogo/

Cada `<tabela>.csv` vai direto para a tabela de mesmo nome do banco, na ordem do esquema. O cabeçalho nomeia as colunas; célula vazia vira NULL; `fato_id`, se a tabela tiver e o CSV não, sai do hash da linha. CSV sem tabela no esquema é erro de `reconstruir`.

Os IDs de filme seguem `tt90DDNNN`: `DD` é o diretor (`Q90000DD`), `NNN` a ordem dentro dele.

| Diretor | Filmes | Notas do Bruno | Para que serve |
|---|---|---|---|
| Helena Prado (01) | 101–106 | 5 (2025), 4,5 (2024), 4 (2023) em 101–103 | 3 Notas altas: caminho forte. 106 tem 600 votos, abaixo do mínimo |
| Otávio Lins (02) | 201–203 | 4,5 e 4 em 201–202 | 2 Notas altas: moderada |
| Marta Quintal (03) | 301–303 | 4 em 301, 3,5 em 303 | 1 Nota alta: fraca; 3,5 é semente fraca a favor |
| Rui Tavares (04) | 401–403 | 5 (2019), 4 (2018) | Notas com mais de 5 anos caem um nível |
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

Caminho de conteúdo por outros predicados (`test_caminho_conteudo.py`). Cada filme liga às Notas do Bruno por um predicado só, com entidade `Q90019NN`:

| Filme | Predicado e entidade | Liga a |
|---|---|---|
| Maré Cheia (1901) | roteiro, Ana Ruiz | O Farol de Areia (101) |
| Voo Noturno (1902) | elenco, Rita Lobo | Ponte Aérea (201) |
| Fronteira II (1903) | serie, Trilogia da Fronteira | Fronteira (401) |
| Poeira (1904) | genero, faroeste | 101, 102, 103 e Jardim Suspenso (301): quatro Notas altas, que no gênero ficam em metadado fraco |

Notas de outras Pessoas, para os testes de grupo (`test_grupo.py`):

| Pessoa | Notas | Para que serve |
|---|---|---|
| Iara | 3 em O Farol de Areia (101), 4 em Fronteira (401) | Fraca a favor nos outros de Helena Prado, moderada nos outros de Rui Tavares. Sobre 101 e 401 em si, só o Já visto da própria Nota. Bruno e Iara discordam em As Horas Lentas e quase concordam em A Volta do Mar: a Regra padrão e a média simples ordenam os dois ao contrário |
| Teo | nenhuma | "sem fato" em todo filme |
| Quim | 5 em Ponte Aérea (201), 3,5 em Maré Baixa (102), 4,5 em Barulho (501), 2 em Fronteira (401) | Testes de Crédito (`test_credito.py`). Com o Bruno, o Quim é o mínimo em As Horas Lentas e em A Volta do Mar, e o Bruno é o mínimo em Asfalto Quente: o Crédito de um faz subir os filmes dele |

Os filmes de Lia Moura, Tomás Reis, Beatriz Sá e Jorge Amaral não ligam a Nota nenhuma: são os filmes só com palpites, que completam a lista com `--quantos 50`.

### Sinais de Review (#21)

Os filmes `tt90010NN` e `tt90011NN` não têm diretor. Eles se ligam às Notas só pela tabela `vizinhos`, e cada um tem pelo menos uma Evidência do Bruno, para não virar filme só com palpites nos testes de grupo.

Vizinhança item-item (`vizinhos.csv`, `test_vizinhanca.py`):

| Filme | Vizinho de (base, ambos) | Para que serve |
|---|---|---|
| A Casa das Marés (1001) | O Farol de Areia (3104, 1987); Cidade de Vidro (600, 120) | 64% de 3.104: forte. 20% fica fora |
| Segunda Chamada (1002) | Maré Baixa (100, 40) | 40% de 100: moderada |
| O Mapa Rasgado (1003) | Maré Baixa (100, 25); Ponte Aérea (25, 20) | 25% de 100: fraca. Base 25 fica fora |
| Luz de Inverno (1004) | Rio Abaixo (900, 630); Fronteira (1000, 650) | Seriam fortes; a semente limita a fraca (3,5) e a moderada (5 de 2019). A Iara também deu 4 a Fronteira |
| Ruído Branco (1005) | Barulho (700, 490); Fronteira (1000, 420) | Barulho levou 1 do Bruno e não é semente. Fronteira dá moderada ao Bruno e à Iara |

Tags, genome e gênero (`tags_movielens.csv`, `genoma.csv`, `test_clima.py`). Todos são vizinhos de O Farol de Areia por (3104, 776), o que dá Evidência fraca igual ao Bruno e à Iara: no gosto, empatam, e só o bônus e os votos os separam.

| Filme | Votos | Tags (usuários) | Genome | Gênero |
|---|---|---|---|---|
| Dia de Feira (1101) | 13000 | feel-good (10), funny (12) | suspense 0,8 | comédia |
| Tarde de Domingo (1102) | 11000 | feel-good (3) | | |
| Bolo de Fubá (1103) | 10500 | feel-good (2) | feel-good 0,85; suspense 0,799 | |
| Pipa no Céu (1104) | 10200 | | feel-good 0,70; feel good movie 0,50 | |
| Carnaval de Rua (1105) | 10100 | | suspense 0,6 | comédia |
| Sessão Maldita (1106) | 10050 | so bad it's good (12) | | |
| Silêncio no Lago (1107) | 10020 | meditative (12) | slow 0,90 | |
| Outro Dia Qualquer (1108) | 30000 | tense (2) | suspense 0,599 | |

Outro Dia Qualquer tem mais votos. Sua tag e seu escore ficam abaixo dos pisos, então ele fica à frente dos demais quando empatam sem bônus.

O gênero comédia usa o QID real (`Q157443`), porque o vocabulário de Climas (`config/climas.toml`) aponta para QIDs reais. Tags e QIDs da fixture têm de existir nos vocabulários de `config/`; trocar uma tag de lá pode quebrar `test_clima.py`.

### Restrições

Tabelas que só as Restrições da Sessão leem. Os filmes são os de cima; a tabela completa do que passa em cada idade está no começo da seção de criança de `tests/test_restricoes.py`.

- `idiomas_originais.csv`: português nos filmes de Helena Prado (101–105) e em Jardim Suspenso (301, que também é espanhol); inglês em 201–203 e 401; espanhol em 302. Os outros não têm idioma e saem quando se pede um.
- `classificacoes.csv`: um rótulo por sistema, como a fonte escreve ("12A", "FSK 6", "tous publics"). A etapa `60_faixas_etarias` converte para `faixas_etarias`. Há um caso de cada regra: ClassInd que vence o MPA (104), faixa mais alta entre dois sistemas (105), "livre" do CNC e da EIRIN ignorados (102, 203), faixa 6 (103, 403, 503).
- `adultos.csv`: Jardim Suspenso (301) tem isAdult no IMDb.
- Sem classificação local: 201, 203 (só EIRIN G), 302, 402. Numa Sessão com criança, esses dependem do OMDb.

## gravacoes/

Respostas das fontes sob demanda como a API devolve, em `<fonte>/<tconst>.json`. Os testes ligam com `FILMES_GRAVACOES` e uma chave qualquer; arquivo ausente vale como "a fonte não conhece o filme".

- `omdb/`: Vento Norte PG, Noite de Estreia PG-13, Inverno em Lisboa Not Rated, Jardim Suspenso G. Ponte Aérea não tem arquivo.
- `ddd/`: o tema "a dog dies" tem 12 sim e 2 não em As Horas Lentas, 3 e 2 em A Volta do Mar (os dois saem), 1 e 14 em Sal e Ferrugem, 2 e 0 em Cidade de Vidro (poucos votos), 3 e 3 em Noite de Estreia (empate). O Farol de Areia só tem "there are jump scares"; Maré Baixa não tem arquivo.

- `catalogo/`: trechos dos TSVs do IMDb e das respostas SPARQL JSON do QLever, coletados em 2026-11-20. Exercitam o corte de 100 votos, a exclusão de adultos, a ponte de IDs, o elenco, os idiomas e os rótulos reais de classificação. `atualizar` lê essas gravações em vez de acessar a rede.

## dados/

Repo de dados fictício. Cada teste trabalha numa cópia, então comandos podem escrever nele.

- `pessoas/bruno.md`: o Dono (`dono: true`, apelido `eu`).
- `pessoas/iara.md` e `pessoas/teo.md`: Pessoas para os testes de grupo.
- `pessoas/quim.md`: Pessoa para os testes de Crédito.
- Não há `sessoes/`: os testes criam as Sessões com `recomendar` e `feedback`, ou escrevem o arquivo direto quando precisam de várias datas (veja `test_credito.py`).

Os testes de Pessoa (#18) criam a Ana pela CLI e escrevem a Carol direto no repo de dados do teste; nenhuma das duas fica na fixture.

## Para estender

Acrescente linhas e filmes novos com IDs novos (um diretor novo `10`, `11`... ou filmes `tt90DD9NN`) em vez de mudar os existentes: outros testes contam com eles. Uma Pessoa nova é um arquivo em `dados/pessoas/`; as Notas dela vão em `catalogo/notas.csv`. Se a mudança alterar o top 5 do Bruno, rode a suíte inteira e ajuste a tabela acima.

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
