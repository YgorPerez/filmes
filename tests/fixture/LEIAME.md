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

## dados/

Repo de dados fictício. Cada teste trabalha numa cópia, então comandos podem escrever nele.

- `pessoas/bruno.md`: o Dono (`dono: true`, apelido `eu`).

Os testes de Pessoa (#18) criam a Ana pela CLI e escrevem a Carol direto no repo de dados do teste; nenhuma das duas fica na fixture.

## Para estender

Acrescente linhas e filmes novos com IDs novos (um diretor novo `10`, `11`... ou filmes `tt90DD9NN`) em vez de mudar os existentes: outros testes contam com eles. Uma Pessoa nova é um arquivo em `dados/pessoas/`; as Notas dela vão em `catalogo/notas.csv`. Se a mudança alterar o top 5 do Bruno, rode a suíte inteira e ajuste a tabela acima.
