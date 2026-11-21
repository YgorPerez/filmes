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
| Quim | 5 em Ponte Aérea (201), 3,5 em Maré Baixa (102), 4,5 em Barulho (501), 2 em Fronteira (401) | Testes de Crédito (`test_credito.py`). Com o Bruno, o Quim é o mínimo em As Horas Lentas e em A Volta do Mar, e o Bruno é o mínimo em Asfalto Quente: o Crédito de um faz subir os filmes dele |

Os filmes de Lia Moura, Tomás Reis, Beatriz Sá e Jorge Amaral não ligam a Nota nenhuma: são os filmes só com palpites, que completam a lista com `--quantos 50`.

## dados/

Repo de dados fictício. Cada teste trabalha numa cópia, então comandos podem escrever nele.

- `pessoas/bruno.md`: o Dono (`dono: true`, apelido `eu`).
- `pessoas/iara.md` e `pessoas/teo.md`: Pessoas para os testes de grupo.
- `pessoas/quim.md`: Pessoa para os testes de Crédito.
- Não há `sessoes/`: os testes criam as Sessões com `recomendar` e `feedback`, ou escrevem o arquivo direto quando precisam de várias datas (veja `test_credito.py`).

## Para estender

Acrescente linhas e filmes novos com IDs novos (um diretor novo `10`, `11`... ou filmes `tt90DD9NN`) em vez de mudar os existentes: outros testes contam com eles. Uma Pessoa nova é um arquivo em `dados/pessoas/`; as Notas dela vão em `catalogo/notas.csv`. Se a mudança alterar o top 5 do Bruno, rode a suíte inteira e ajuste a tabela acima.
