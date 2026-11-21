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

Entidades que não são diretor, com IDs `Q90018NN` (faixa do #18), só no predicado indicado:

| Entidade | Predicado | Filmes |
|---|---|---|
| Terror (Q9001801) | genero | Porão Escuro (1801), A Casa do Fim (1802), Explosão Final (502) |
| Comédia (Q9001802) | genero | Risos de Domingo (1803), Pequenos Milagres (601) |
| Davi Couto (Q9001803) | elenco | Risos de Domingo (1803), Casa Cheia (602) |

O caminho de conteúdo só usa os predicados de `[caminho.peso]` (hoje, só diretor), então gênero e elenco não mudam o top 5 do Bruno.

Notas de outras Pessoas, para os testes de grupo (`test_grupo.py`):

| Pessoa | Notas | Para que serve |
|---|---|---|
| Iara | 3 em O Farol de Areia (101), 4 em Fronteira (401) | Fraca a favor nos outros de Helena Prado, moderada nos outros de Rui Tavares. Sem Fato sobre 101 e 401 em si. Bruno e Iara discordam em As Horas Lentas e concordam em Inverno em Lisboa: a Regra padrão e a média simples ordenam os dois ao contrário |
| Teo | nenhuma | "sem fato" em todo filme |
| Quim | 5 em Ponte Aérea (201), 3,5 em Maré Baixa (102), 4,5 em Barulho (501), 2 em Fronteira (401) | Testes de Crédito (`test_credito.py`). Com o Bruno, o Quim é o mínimo em As Horas Lentas e em A Volta do Mar, e o Bruno é o mínimo em Asfalto Quente: o Crédito de um faz subir os filmes dele |

Os filmes de Lia Moura, Tomás Reis, Beatriz Sá e Jorge Amaral não ligam a Nota nenhuma: são os filmes só com palpites, que completam a lista com `--quantos 50`.

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

## dados/

Repo de dados fictício. Cada teste trabalha numa cópia, então comandos podem escrever nele.

- `pessoas/bruno.md`: o Dono (`dono: true`, apelido `eu`).
- `pessoas/iara.md` e `pessoas/teo.md`: Pessoas para os testes de grupo.
- `pessoas/quim.md`: Pessoa para os testes de Crédito.
- Não há `sessoes/`: os testes criam as Sessões com `recomendar` e `feedback`, ou escrevem o arquivo direto quando precisam de várias datas (veja `test_credito.py`).

Os testes de Pessoa (#18) criam a Ana pela CLI e escrevem a Carol direto no repo de dados do teste; nenhuma das duas fica na fixture.

## Para estender

Acrescente linhas e filmes novos com IDs novos (um diretor novo `10`, `11`... ou filmes `tt90DD9NN`) em vez de mudar os existentes: outros testes contam com eles. Uma Pessoa nova é um arquivo em `dados/pessoas/`; as Notas dela vão em `catalogo/notas.csv`. Se a mudança alterar o top 5 do Bruno, rode a suíte inteira e ajuste a tabela acima.
