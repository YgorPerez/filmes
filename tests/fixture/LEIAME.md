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

Notas de outras Pessoas, para os testes de grupo (`test_grupo.py`):

| Pessoa | Notas | Para que serve |
|---|---|---|
| Iara | 3 em O Farol de Areia (101), 4 em Fronteira (401) | Fraca a favor nos outros de Helena Prado, moderada nos outros de Rui Tavares. Sem Fato sobre 101 e 401 em si. Bruno e Iara discordam em As Horas Lentas e concordam em Inverno em Lisboa: a Regra padrão e a média simples ordenam os dois ao contrário |
| Teo | nenhuma | "sem fato" em todo filme |

Os filmes de Lia Moura, Tomás Reis, Beatriz Sá e Jorge Amaral não ligam a Nota nenhuma: são os filmes só com palpites, que completam a lista com `--quantos 50`.

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

Tags, genome e gênero (`tags_movielens.csv`, `genoma.csv`, `test_clima.py`). Todos são vizinhos de O Farol de Areia por (50, 15), o que dá Evidência fraca igual ao Bruno e à Iara: no gosto, empatam, e só o bônus e os votos os separam.

| Filme | Votos | Tags (usuários) | Genome | Gênero |
|---|---|---|---|---|
| Dia de Feira (1101) | 13000 | feel-good (14), funny (12) | | comédia |
| Tarde de Domingo (1102) | 11000 | feel-good (5) | | |
| Bolo de Fubá (1103) | 10500 | feel-good (2) | feel-good 0,85 | |
| Pipa no Céu (1104) | 10200 | | feel-good 0,70; feel good movie 0,50 | |
| Carnaval de Rua (1105) | 10100 | | | comédia |
| Sessão Maldita (1106) | 10050 | so bad it's good (12) | | |
| Silêncio no Lago (1107) | 10020 | meditative (12) | slow 0,90 | |
| Outro Dia Qualquer (1108) | 30000 | | | |

Outro Dia Qualquer é a régua: sem tag nenhuma e com mais votos, fica à frente de qualquer um deles quando não há bônus.

O gênero comédia usa o QID real (`Q157443`), porque o vocabulário de Climas (`config/climas.toml`) aponta para QIDs reais. Tags e QIDs da fixture têm de existir nos vocabulários de `config/`; trocar uma tag de lá pode quebrar `test_clima.py`.

## dados/

Repo de dados fictício. Cada teste trabalha numa cópia, então comandos podem escrever nele.

- `pessoas/bruno.md`: o Dono (`dono: true`, apelido `eu`).
- `pessoas/iara.md` e `pessoas/teo.md`: Pessoas para os testes de grupo.

## Para estender

Acrescente linhas e filmes novos com IDs novos (um diretor novo `10`, `11`... ou filmes `tt90DD9NN`) em vez de mudar os existentes: outros testes contam com eles. Uma Pessoa nova é um arquivo em `dados/pessoas/`; as Notas dela vão em `catalogo/notas.csv`. Se a mudança alterar o top 5 do Bruno, rode a suíte inteira e ajuste a tabela acima.
